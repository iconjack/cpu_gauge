# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

```bash
uv run server.py
```

Starts the aiohttp server on `0.0.0.0:8080`. No build step or test suite exists. Python dependencies (`aiohttp`, `psutil`) are declared inline in `server.py`'s PEP 723 script metadata and resolved automatically by `uv run`.

## Architecture

Real-time system monitor that streams CPU, memory, and temperature metrics from a Python server to browser clients via WebSocket, rendered entirely on HTML5 `<canvas>`.

**Server (`server.py`):** aiohttp async server. `collect_metrics()` gathers system data via psutil and broadcasts JSON to all connected WebSocket clients every second. `InstructionsCounter` reads the hardware "instructions retired" counter via the `perf_event_open` syscall (system-wide if `perf_event_paranoid <= -1`, otherwise per-process fallback). On startup, it can prompt for a sudo password to lower the paranoid setting.

**Client (`static/app.js`):** Connects to `/ws`, parses the URL path to pick a display style (e.g., `/round`, `/plain`), dynamically imports the corresponding ES module from `static/styles/`, and forwards metrics to it. Handles DPI-aware canvas sizing, landscape rotation via canvas transform for styles that request it, and tap-to-fullscreen.

**Pluggable styles (`static/styles/`):** Each style extends `GaugeStyle` (defined in `base.js`) and implements `init()`, `resize(w, h)`, and rendering methods (`render_cpu()`, `render_memory()`, etc.). The base class handles `update(data)` and `set_status()`. To add a new style, create a new `.js` file in `static/styles/` exporting a default class that extends `GaugeStyle`.

- **`plain.js`** — Card-based layout showing all metrics (CPU bars, memory, temperatures, uptime).
- **`round.js`** — Vintage circular speedometer with chrome rim, per-core indicator lamps, needle gauge, and instructions-retired odometer. Requests landscape orientation.

**Fonts:** Jost and Limelight are served locally from `static/fonts/` (no CDN). The app is designed to work on air-gapped LANs.

## Metrics JSON shape

```json
{
  "hostname": "...",
  "timestamp": 1234567890.0,
  "uptime_seconds": 12345.0,
  "cpu": {
    "overall": 23.5,
    "per_core": [10.0, 35.0, ...],
    "count_logical": 12,
    "count_physical": 6,
    "instructions_retired": 123456789000
  },
  "memory": { "total_bytes": ..., "used_bytes": ..., "available_bytes": ..., "percent": 45.2 },
  "temperatures": { "chip_name": [{"label": "...", "current": 55.0}] }
}
