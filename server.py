#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "aiohttp",
#     "psutil",
# ]
# ///

import asyncio
import ctypes
import ctypes.util
import json
import os
import socket
import struct
import time
from pathlib import Path

import psutil
from aiohttp import web

HOST = "0.0.0.0"
PORT = 8080
INTERVAL = 1.0
STATIC_DIR = Path(__file__).parent / "static"

# perf_event_open constants
_NR_PERF_EVENT_OPEN = 298  # x86_64
_PERF_TYPE_HARDWARE = 0
_PERF_COUNT_HW_INSTRUCTIONS = 1
_EXCLUDE_KERNEL_HV = 0x60  # exclude_kernel | exclude_hv bits


class InstructionsCounter:
    """Reads hardware 'instructions retired' counter via perf_event_open."""

    def __init__(self):
        self.fds = []
        self.mode = None
        libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
        attr = self._make_attr()

        # Try system-wide first (needs perf_event_paranoid <= 1)
        ncpu = os.cpu_count() or 1
        fds = []
        ok = True
        for cpu in range(ncpu):
            fd = libc.syscall(
                _NR_PERF_EVENT_OPEN,
                ctypes.c_char_p(attr), ctypes.c_int(-1),
                ctypes.c_int(cpu), ctypes.c_int(-1), ctypes.c_ulong(0),
            )
            if fd < 0:
                for f in fds:
                    os.close(f)
                fds = []
                ok = False
                break
            fds.append(fd)

        if ok:
            self.fds = fds
            self.mode = "system-wide"
            return

        # System-wide failed — offer to fix perf_event_paranoid
        import subprocess
        import getpass
        paranoid_path = "/proc/sys/kernel/perf_event_paranoid"
        current = int(open(paranoid_path).read().strip())
        if current > -1:
            while True:
                try:
                    password = getpass.getpass("Enter password for system odometer: ")
                except EOFError:
                    break
                if not password:
                    break
                result = subprocess.run(
                    ["sudo", "-kS", "-p", "", "sysctl", "-q",
                     "kernel.perf_event_paranoid=-1"],
                    input=password + "\n", text=True,
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
                if result.returncode != 0:
                    continue
                # Verify it actually changed
                new_val = int(open(paranoid_path).read().strip())
                if new_val > -1:
                    continue
                # Retry system-wide
                fds = []
                for cpu in range(ncpu):
                    fd = libc.syscall(
                        _NR_PERF_EVENT_OPEN,
                        ctypes.c_char_p(attr), ctypes.c_int(-1),
                        ctypes.c_int(cpu), ctypes.c_int(-1),
                        ctypes.c_ulong(0),
                    )
                    if fd < 0:
                        for f in fds:
                            os.close(f)
                        fds = []
                        break
                    fds.append(fd)
                if fds:
                    self.fds = fds
                    self.mode = "system-wide"
                    return
                break

        # Fall back to self-process (needs perf_event_paranoid <= 2)
        fd = libc.syscall(
            _NR_PERF_EVENT_OPEN,
            ctypes.c_char_p(attr), ctypes.c_int(0),
            ctypes.c_int(-1), ctypes.c_int(-1), ctypes.c_ulong(0),
        )
        if fd >= 0:
            self.fds = [fd]
            self.mode = "self"
            return

    @staticmethod
    def _make_attr():
        buf = bytearray(120)
        struct.pack_into("<IIQ", buf, 0,
                         _PERF_TYPE_HARDWARE, 120, _PERF_COUNT_HW_INSTRUCTIONS)
        struct.pack_into("<Q", buf, 40, _EXCLUDE_KERNEL_HV)
        return bytes(buf)

    def read(self):
        total = 0
        for fd in self.fds:
            data = os.read(fd, 8)
            total += struct.unpack("<Q", data)[0]
        return total

    def close(self):
        for fd in self.fds:
            try:
                os.close(fd)
            except OSError:
                pass
        self.fds = []


instructions_counter = InstructionsCounter()
if instructions_counter.mode:
    print(f"Instructions counter: {instructions_counter.mode}")
else:
    print("Instructions counter: unavailable (perf_event_paranoid too high)")


def collect_metrics() -> dict:
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    mem = psutil.virtual_memory()
    boot_time = psutil.boot_time()

    temps = {}
    try:
        sensor_temps = psutil.sensors_temperatures()
        for chip, readings in sensor_temps.items():
            entries = []
            for r in readings:
                entries.append({
                    "label": r.label or chip,
                    "current": r.current,
                })
            if entries:
                temps[chip] = entries
    except Exception:
        pass

    instructions = None
    if instructions_counter.mode:
        try:
            instructions = instructions_counter.read()
        except Exception:
            pass

    return {
        "hostname": socket.gethostname(),
        "timestamp": time.time(),
        "uptime_seconds": time.time() - boot_time,
        "cpu": {
            "overall": cpu_percent,
            "per_core": cpu_per_core,
            "count_logical": psutil.cpu_count(logical=True),
            "count_physical": psutil.cpu_count(logical=False),
            "instructions_retired": instructions,
        },
        "memory": {
            "total_bytes": mem.total,
            "used_bytes": mem.used,
            "available_bytes": mem.available,
            "percent": mem.percent,
        },
        "temperatures": temps,
    }


async def broadcast_loop(app: web.Application):
    connected_clients: set[web.WebSocketResponse] = app["connected_clients"]

    # Prime cpu_percent so the first real reading isn't 0
    psutil.cpu_percent()
    await asyncio.sleep(0.1)

    while True:
        try:
            metrics = await asyncio.to_thread(collect_metrics)
            payload = json.dumps(metrics)

            stale = set()
            for ws in tuple(connected_clients):
                if ws.closed:
                    stale.add(ws)
                    continue
                try:
                    await ws.send_str(payload)
                except Exception:
                    stale.add(ws)

            connected_clients.difference_update(stale)
        except asyncio.CancelledError:
            return
        except Exception:
            pass

        try:
            await asyncio.sleep(INTERVAL)
        except asyncio.CancelledError:
            return


async def start_background_tasks(app: web.Application):
    app["broadcast_task"] = asyncio.create_task(broadcast_loop(app))


async def cleanup_background_tasks(app: web.Application):
    app["broadcast_task"].cancel()
    await app["broadcast_task"]


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_clients: set[web.WebSocketResponse] = request.app["connected_clients"]
    connected_clients.add(ws)

    try:
        async for _msg in ws:
            pass  # We don't expect messages from the client
    finally:
        connected_clients.discard(ws)

    return ws


async def index_handler(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


def get_connect_urls(port: int) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    iface_stats = psutil.net_if_stats()

    for iface, addrs in psutil.net_if_addrs().items():
        stats = iface_stats.get(iface)
        if stats is not None and not stats.isup:
            continue

        for addr in addrs:
            if addr.family != socket.AF_INET:
                continue

            ip = addr.address
            if not ip or ip.startswith("127.") or ip in seen:
                continue

            seen.add(ip)
            urls.append(f"http://{ip}:{port}/")

    if not urls:
        urls.append(f"http://127.0.0.1:{port}/")

    return urls


def create_app() -> web.Application:
    app = web.Application()
    app["connected_clients"] = set()
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/{style}", index_handler)
    app.router.add_static("/static/", STATIC_DIR)
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    return app


if __name__ == "__main__":
    app = create_app()
    print("Clients can connect to:")
    for url in get_connect_urls(PORT):
        print(f"  {url}")
    web.run_app(app, host=HOST, port=PORT)
