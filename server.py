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

connected_clients: set[web.WebSocketResponse] = set()


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
    # Prime cpu_percent so the first real reading isn't 0
    psutil.cpu_percent()
    await asyncio.sleep(0.1)

    while True:
        try:
            metrics = await asyncio.to_thread(collect_metrics)
            payload = json.dumps(metrics)

            stale = set()
            for ws in connected_clients:
                try:
                    await ws.send_str(payload)
                except Exception:
                    stale.add(ws)

            connected_clients.difference_update(stale)
        except asyncio.CancelledError:
            return
        except Exception:
            pass

        await asyncio.sleep(INTERVAL)


async def start_background_tasks(app: web.Application):
    app["broadcast_task"] = asyncio.create_task(broadcast_loop(app))


async def cleanup_background_tasks(app: web.Application):
    app["broadcast_task"].cancel()
    await app["broadcast_task"]


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    connected_clients.add(ws)

    try:
        async for _msg in ws:
            pass  # We don't expect messages from the client
    finally:
        connected_clients.discard(ws)

    return ws


async def index_handler(_request: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/{style}", index_handler)
    app.router.add_static("/static/", STATIC_DIR)
    app.on_startup.append(start_background_tasks)
    app.on_cleanup.append(cleanup_background_tasks)
    return app


if __name__ == "__main__":
    app = create_app()
    web.run_app(app, host=HOST, port=PORT)
