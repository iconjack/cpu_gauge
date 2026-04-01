#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "aiohttp",
#     "psutil",
# ]
# ///

import asyncio
import json
import socket
import time
from pathlib import Path

import psutil
from aiohttp import web

HOST = "0.0.0.0"
PORT = 8080
INTERVAL = 1.0
STATIC_DIR = Path(__file__).parent / "static"


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

    return {
        "hostname": socket.gethostname(),
        "timestamp": time.time(),
        "uptime_seconds": time.time() - boot_time,
        "cpu": {
            "overall": cpu_percent,
            "per_core": cpu_per_core,
            "count_logical": psutil.cpu_count(logical=True),
            "count_physical": psutil.cpu_count(logical=False),
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
