import GaugeStyle, { format_bytes } from "./base.js";

const DEG = Math.PI / 180;

// CPU speedometer
const SWEEP_START = 150 * DEG;
const SWEEP_RANGE = 240 * DEG;
const LAMP_SWEEP_RANGE = 120 * DEG;
const LAMP_SWEEP_START = (270 * DEG) - (LAMP_SWEEP_RANGE / 2);

// Memory fuel gauge — arc across the top from ~10 o'clock to ~2 o'clock
const FUEL_START = 210 * DEG;
const FUEL_RANGE = 120 * DEG;

// Fan tachometer
const TACH_START = 150 * DEG;
const TACH_RANGE = 240 * DEG;
const TACH_MAX_RPM = 2000;

// Friendly labels for temperature chips
const SENSOR_LABELS = {
    "k10temp:Tctl": "CPU",
    "k10temp:Tccd1": "CCD",
    "coretemp:Package id 0": "CPU",
    "amdgpu:edge": "GPU",
    "nvme:Composite": "SSD",
};

function sensor_display_label(chip, label) {
    const key = chip + ":" + label;
    if (SENSOR_LABELS[key]) return SENSOR_LABELS[key];
    if (chip.startsWith("r8169")) return "Eth";
    if (chip === "spd5118" || chip.startsWith("spd5")) return "RAM";
    if (chip.startsWith("mt79")) return "Wi-Fi";
    if (chip.startsWith("nvme")) return "SSD";
    if (chip === "k10temp" || chip === "coretemp") return "CPU";
    if (chip === "amdgpu") return "GPU";
    return chip.length > 6 ? chip.slice(0, 6) : chip;
}

const COLORS = {
    bg: "#2a2a3a",
    face: "#d4cfc2",
    speedo_face: "#e8e8ec",
    tick: "#666677",
    tick_major: "#444455",
    number: "#555566",
    needle: "#ee3333",
    label: "#444455",
    label_light: "#999aab",
    mercury: "#cc2222",
};

function round_rect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

export default class RoundStyle extends GaugeStyle {
    get orientation() { return "landscape"; }

    init() {
        this.layout = {};
    }

    resize(width, height) {
        this.w = width;
        this.h = height;

        const pad = Math.round(Math.min(width, height) * 0.03);

        // Size main gauge so side panels get at least 22 % of width each
        const min_side = Math.round(width * 0.22);
        const R = Math.floor(Math.min(
            (height - pad * 2) * 0.42,
            (width - pad * 2 - min_side * 2) / 2,
        ));
        const cx = Math.round(width / 2);
        const cy = Math.round(height / 2);

        // Side panel boundaries
        const panel_gap = Math.round(R * 0.06);
        const left_x = pad;
        const left_w = cx - R - panel_gap - pad;
        const right_x = cx + R + panel_gap;
        const right_w = width - right_x - pad;

        // Fuel gauge sizing (memory)
        const fuel_r = Math.min(left_w * 0.42, R * 0.55);
        const fuel_cx = left_x + left_w / 2;
        const fuel_cy = cy - fuel_r * 0.1;

        // Temperature / fan panel bounds
        const panel_top = cy - R + pad;
        const panel_bottom = cy + R - pad;
        const panel_h = panel_bottom - panel_top;

        // Tachometer sizing (fan RPM) — bottom of right panel
        const tach_r = Math.min(right_w * 0.32, panel_h * 0.18);
        const tach_cx = right_x + right_w / 2;
        const tach_cy = panel_bottom - tach_r * 1.8;

        this.layout = {
            cx, cy, R, pad,
            rim_width: Math.max(4, Math.round(R * 0.06)),
            lamp_r: Math.max(3, Math.round(R * 0.048)),
            lamp_arc_r: R * 0.75,
            speedo_cx: cx,
            speedo_cy: cy + Math.round(R * 0.15),
            speedo_r: Math.round(R * 0.52),
            font_label: Math.max(10, Math.round(R * 0.09)),
            font_number: Math.max(7, Math.round(R * 0.065)),

            // Memory fuel gauge
            left_x, left_w,
            fuel_cx, fuel_cy, fuel_r,
            fuel_rim: Math.max(3, Math.round(fuel_r * 0.07)),

            // Temperature panel
            right_x, right_w,
            panel_top, panel_bottom,

            // Tachometer (fan RPM)
            tach_cx, tach_cy, tach_r,
        };

        this.render();
    }

    render() {
        if (!this.data || !this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.w, this.h);

        this.render_memory();
        this.render_cpu();
        this.render_temperatures();
    }

    // ── CPU section (centre) ──────────────────────────────────

    render_cpu() {
        const L = this.layout;
        const cpu = this.data.cpu;

        this._draw_chrome_bezel(L.cx, L.cy, L.R, L.rim_width);
        this._draw_face(L.cx, L.cy, L.R - L.rim_width);
        this._draw_core_lamps(cpu.per_core);
        this._draw_cores_label();
        this._draw_speedometer(cpu.overall);
        this._draw_odometer(cpu.instructions_retired);
        this._draw_cpu_label();
    }

    // ── Memory section (left) ─────────────────────────────────

    render_memory() {
        const ctx = this.ctx;
        const L = this.layout;
        const mem = this.data.memory;
        const pct = mem.percent / 100;

        const { fuel_cx: fcx, fuel_cy: fcy, fuel_r: fr, fuel_rim: frw } = L;

        // Chrome bezel & face
        this._draw_chrome_bezel(fcx, fcy, fr, frw);
        this._draw_face(fcx, fcy, fr - frw);

        const inner = fr - frw;

        // ── Tick marks ──
        const tick_out = inner * 0.88;
        const tick_in_major = inner * 0.70;
        const tick_in_minor = inner * 0.78;
        const label_r = inner * 0.52;

        for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const angle = FUEL_START + t * FUEL_RANGE;
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            const major = i % 2 === 0;

            ctx.beginPath();
            ctx.moveTo(fcx + tick_out * ca, fcy + tick_out * sa);
            ctx.lineTo(fcx + (major ? tick_in_major : tick_in_minor) * ca,
                       fcy + (major ? tick_in_major : tick_in_minor) * sa);
            ctx.strokeStyle = major ? COLORS.tick_major : COLORS.tick;
            ctx.lineWidth = major ? 2 : 1;
            ctx.stroke();
        }

        // ── E / ¼ / ½ / ¾ / F labels ──
        const fuel_font = Math.max(7, Math.round(fr * 0.13));
        ctx.font = `600 ${fuel_font}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.number;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const marks = [
            { t: 0, text: "E" },
            { t: 0.25, text: "\u00bc" },
            { t: 0.5, text: "\u00bd" },
            { t: 0.75, text: "\u00be" },
            { t: 1, text: "F" },
        ];
        for (const m of marks) {
            const a = FUEL_START + m.t * FUEL_RANGE;
            ctx.fillText(m.text, fcx + label_r * Math.cos(a), fcy + label_r * Math.sin(a));
        }

        // ── Needle ──
        const na = FUEL_START + Math.max(0, Math.min(1, pct)) * FUEL_RANGE;
        const nlen = inner * 0.78;
        const nhw = Math.max(1.2, fr * 0.02);
        const cn = Math.cos(na);
        const sn = Math.sin(na);
        const px = -sn * nhw;
        const py = cn * nhw;

        ctx.beginPath();
        ctx.moveTo(fcx + nlen * cn, fcy + nlen * sn);
        ctx.lineTo(fcx + px, fcy + py);
        ctx.lineTo(fcx - px, fcy - py);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        // Tail
        const tl = inner * 0.12;
        const thw = nhw * 2;
        const tpx = -sn * thw;
        const tpy = cn * thw;
        ctx.beginPath();
        ctx.moveTo(fcx - tl * cn, fcy - tl * sn);
        ctx.lineTo(fcx + tpx, fcy + tpy);
        ctx.lineTo(fcx - tpx, fcy - tpy);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        // Center cap
        this._draw_needle_cap(fcx, fcy, Math.max(2, fr * 0.06));

        // ── Labels below gauge ──
        const lbl = Math.max(8, Math.round(fr * 0.12));
        ctx.font = `600 ${lbl}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label_light;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.letterSpacing = "0.15em";
        ctx.fillText("MEMORY", fcx, fcy + fr + lbl * 0.6);
        ctx.letterSpacing = "0px";

        const det = Math.max(7, Math.round(fr * 0.09));
        ctx.font = `${det}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label_light;
        ctx.fillText(
            format_bytes(mem.used_bytes) + " / " + format_bytes(mem.total_bytes),
            fcx, fcy + fr + lbl * 0.6 + lbl * 1.3,
        );
    }

    // ── Temperature / Fan section (right) ─────────────────────

    render_temperatures() {
        const ctx = this.ctx;
        const L = this.layout;
        const temps = this.data.temperatures || {};
        const fans = this.data.fans || {};

        // Flatten temperature readings
        const readings = [];
        for (const [chip, sensors] of Object.entries(temps)) {
            for (const s of sensors) {
                readings.push({
                    label: sensor_display_label(chip, s.label),
                    current: s.current,
                    high: s.high,
                    critical: s.critical,
                });
            }
        }

        // Flatten fan readings — only non-zero RPM
        const fan_readings = [];
        for (const [, sensors] of Object.entries(fans)) {
            for (const s of sensors) {
                if (s.current > 0) {
                    fan_readings.push({ label: s.label, rpm: s.current });
                }
            }
        }

        if (readings.length === 0 && fan_readings.length === 0) return;

        const title_size = Math.max(9, Math.round(L.fuel_r * 0.12));

        // ── "TEMPERATURES" header ──
        ctx.font = `600 ${title_size}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label_light;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.letterSpacing = "0.12em";
        ctx.fillText("TEMPERATURES", L.right_x + L.right_w / 2, L.panel_top);
        ctx.letterSpacing = "0px";

        // ── Thermometers ──
        if (readings.length > 0) {
            const thermo_top = L.panel_top + title_size * 2.5;
            const thermo_bottom = fan_readings.length > 0
                ? L.tach_cy - L.tach_r - title_size * 2
                : L.panel_bottom - title_size * 3;
            const thermo_h = thermo_bottom - thermo_top;
            const count = readings.length;
            const spacing = L.right_w / count;
            const tube_w = Math.max(6, Math.min(Math.round(spacing * 0.28), 18));

            for (let i = 0; i < count; i++) {
                const tcx = L.right_x + spacing * (i + 0.5);
                this._draw_thermometer(tcx, thermo_top, thermo_h, tube_w, readings[i]);
            }
        }

        // ── Fan tachometer ──
        if (fan_readings.length > 0) {
            this._draw_tachometer(
                L.tach_cx, L.tach_cy, L.tach_r,
                fan_readings[0].rpm, fan_readings[0].label,
            );
        }
    }

    // ── Thermometer helper ────────────────────────────────────

    _draw_thermometer(cx, top_y, height, tube_w, reading) {
        const ctx = this.ctx;
        const bulb_r = tube_w * 1.1;
        const half = tube_w / 2;

        const tube_top = top_y;
        const bulb_cy = top_y + height - bulb_r;
        const tube_bottom = bulb_cy;

        // Temperature → fill fraction (20 °C – 100 °C range)
        const t_min = 20, t_max = 100;
        const t = Math.max(0, Math.min(1, (reading.current - t_min) / (t_max - t_min)));
        const usable_h = tube_bottom - tube_top - half;
        const fill_h = t * usable_h;

        // ── Glass bulb ──
        ctx.beginPath();
        ctx.arc(cx, bulb_cy, bulb_r, 0, Math.PI * 2);
        ctx.fillStyle = "#d8d4c8";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Glass tube ──
        round_rect(ctx, cx - half, tube_top, tube_w, tube_bottom - tube_top, half);
        ctx.fillStyle = "#d8d4c8";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Mercury (bulb always filled) ──
        const mw = tube_w * 0.5;
        const mh = mw / 2;
        const mbr = bulb_r * 0.7;

        ctx.beginPath();
        ctx.arc(cx, bulb_cy, mbr, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.mercury;
        ctx.fill();

        if (fill_h > 0) {
            const merc_top = tube_bottom - fill_h;
            ctx.fillStyle = COLORS.mercury;
            ctx.fillRect(cx - mh, merc_top, mw, tube_bottom - merc_top);
            // Rounded top cap of mercury column
            ctx.beginPath();
            ctx.arc(cx, merc_top, mh, Math.PI, 0);
            ctx.fill();
        }

        // ── Glass highlight ──
        ctx.save();
        const hl = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
        hl.addColorStop(0, "rgba(255,255,255,0)");
        hl.addColorStop(0.25, "rgba(255,255,255,0.30)");
        hl.addColorStop(0.45, "rgba(255,255,255,0.08)");
        hl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hl;
        ctx.fillRect(cx - half, tube_top, tube_w, tube_bottom - tube_top);
        ctx.restore();

        // ── Scale ticks (every 20 °C) ──
        for (let temp = 20; temp <= 100; temp += 20) {
            const mt = (temp - t_min) / (t_max - t_min);
            const my = tube_bottom - mt * usable_h;

            ctx.beginPath();
            ctx.moveTo(cx + half + 1, my);
            ctx.lineTo(cx + half + 4, my);
            ctx.strokeStyle = COLORS.label_light;
            ctx.lineWidth = 0.75;
            ctx.stroke();
        }

        // ── Critical threshold marker ──
        if (reading.critical != null && reading.critical > t_min && reading.critical < 150) {
            const ct = (reading.critical - t_min) / (t_max - t_min);
            const crit_y = tube_bottom - Math.max(0, Math.min(1, ct)) * usable_h;

            // Subtle red danger zone above critical line
            ctx.save();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = "#ff0000";
            ctx.fillRect(cx - half, tube_top, tube_w, crit_y - tube_top);
            ctx.restore();

            // Red threshold line extending beyond tube edges
            ctx.beginPath();
            ctx.moveTo(cx - half - 3, crit_y);
            ctx.lineTo(cx + half + 3, crit_y);
            ctx.strokeStyle = "#ee3333";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // ── Value below bulb ──
        const vf = Math.max(7, Math.round(tube_w * 0.65));
        ctx.font = `600 ${vf}px "Jost", sans-serif`;
        ctx.fillStyle = "#cccccc";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(`${reading.current.toFixed(0)}\u00b0`, cx, bulb_cy + bulb_r + 3);

        // ── Label below value ──
        const lf = Math.max(6, Math.round(tube_w * 0.55));
        ctx.font = `${lf}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label_light;
        ctx.fillText(reading.label, cx, bulb_cy + bulb_r + 3 + vf * 1.3);
    }

    // ── Fan tachometer helper ─────────────────────────────────

    _draw_tachometer(cx, cy, r, rpm, label) {
        const ctx = this.ctx;
        const rim_w = Math.max(3, Math.round(r * 0.07));

        this._draw_chrome_bezel(cx, cy, r, rim_w);
        this._draw_face(cx, cy, r - rim_w);

        const inner = r - rim_w;
        const tick_out = inner * 0.88;
        const tick_in_major = inner * 0.70;
        const tick_in_minor = inner * 0.78;
        const number_r = inner * 0.55;

        // Ticks: minor every 250 RPM, major every 500
        for (let v = 0; v <= TACH_MAX_RPM; v += 250) {
            const t = v / TACH_MAX_RPM;
            const angle = TACH_START + t * TACH_RANGE;
            const ca = Math.cos(angle);
            const sa = Math.sin(angle);
            const major = v % 500 === 0;

            ctx.beginPath();
            ctx.moveTo(cx + tick_out * ca, cy + tick_out * sa);
            ctx.lineTo(cx + (major ? tick_in_major : tick_in_minor) * ca,
                       cy + (major ? tick_in_major : tick_in_minor) * sa);
            ctx.strokeStyle = major ? COLORS.tick_major : COLORS.tick;
            ctx.lineWidth = major ? 1.5 : 0.75;
            ctx.stroke();

            if (major) {
                const fs = Math.max(6, Math.round(r * 0.10));
                ctx.font = `${fs}px "Jost", sans-serif`;
                ctx.fillStyle = COLORS.number;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                // Display as ÷100 for clean face numbers (0, 5, 10, 15, 20)
                ctx.fillText(String(v / 100), cx + number_r * ca, cy + number_r * sa);
            }
        }

        // "×100 RPM" label in the dead zone at bottom of face
        const unit_fs = Math.max(5, Math.round(r * 0.08));
        ctx.font = `${unit_fs}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u00d7100 RPM", cx, cy + inner * 0.3);

        // Needle
        const clamped = Math.max(0, Math.min(TACH_MAX_RPM, rpm));
        const na = TACH_START + (clamped / TACH_MAX_RPM) * TACH_RANGE;
        const nlen = inner * 0.78;
        const nhw = Math.max(1, r * 0.02);
        const cn = Math.cos(na);
        const sn = Math.sin(na);
        const px = -sn * nhw;
        const py = cn * nhw;

        ctx.beginPath();
        ctx.moveTo(cx + nlen * cn, cy + nlen * sn);
        ctx.lineTo(cx + px, cy + py);
        ctx.lineTo(cx - px, cy - py);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        // Tail
        const tl = inner * 0.12;
        const thw = nhw * 2;
        const tpx = -sn * thw;
        const tpy = cn * thw;
        ctx.beginPath();
        ctx.moveTo(cx - tl * cn, cy - tl * sn);
        ctx.lineTo(cx + tpx, cy + tpy);
        ctx.lineTo(cx - tpx, cy - tpy);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        this._draw_needle_cap(cx, cy, Math.max(2, r * 0.06));

        // Fan name below gauge
        const ls = Math.max(7, Math.round(r * 0.11));
        ctx.font = `600 ${ls}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label_light;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, cx, cy + r + ls * 0.5);
    }

    // ── Shared drawing helpers ────────────────────────────────

    _draw_chrome_bezel(cx, cy, R, rim_width) {
        const ctx = this.ctx;
        const steps = 120;
        const step_angle = (2 * Math.PI) / steps;
        for (let i = 0; i < steps; i++) {
            const a0 = i * step_angle - Math.PI / 2;
            const a1 = a0 + step_angle + 0.01;
            const light_angle = a0 + Math.PI * 0.75;
            const t = (Math.cos(light_angle) + 1) / 2;
            const r = Math.round(100 + t * 155);
            const g = Math.round(105 + t * 150);
            const b = Math.round(115 + t * 140);

            ctx.beginPath();
            ctx.arc(cx, cy, R, a0, a1);
            ctx.arc(cx, cy, R - rim_width, a1, a0, true);
            ctx.closePath();
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, R - rim_width + 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _draw_face(cx, cy, r) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.face;
        ctx.fill();
    }

    _draw_needle_cap(cx, cy, r) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        g.addColorStop(0, "#eeeeee");
        g.addColorStop(1, "#888888");
        ctx.fillStyle = g;
        ctx.fill();
    }

    // ── Core lamps (unchanged) ────────────────────────────────

    _draw_core_lamps(per_core) {
        const ctx = this.ctx;
        const { cx, cy, lamp_arc_r, lamp_r } = this.layout;
        const count = per_core.length;
        const bezel_r = lamp_r * 1.3;
        const lens_r = lamp_r * 0.92;

        for (let i = 0; i < count; i++) {
            const t = count > 1 ? i / (count - 1) : 0.5;
            const angle = LAMP_SWEEP_START + t * LAMP_SWEEP_RANGE;
            const lx = cx + lamp_arc_r * Math.cos(angle);
            const ly = cy + lamp_arc_r * Math.sin(angle);
            const b = per_core[i] / 100;

            if (b > 0.05) {
                ctx.save();
                ctx.globalAlpha = b * 0.8;
                const glow_r = lamp_r * 4.5;
                const glow = ctx.createRadialGradient(lx, ly, lamp_r * 0.1, lx, ly, glow_r);
                glow.addColorStop(0, "rgba(255, 170, 50, 0.8)");
                glow.addColorStop(0.25, "rgba(255, 140, 30, 0.4)");
                glow.addColorStop(0.5, "rgba(255, 120, 20, 0.15)");
                glow.addColorStop(1, "rgba(255, 100, 0, 0)");
                ctx.beginPath();
                ctx.arc(lx, ly, glow_r, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
            const bz_steps = 36;
            const bz_step_angle = (2 * Math.PI) / bz_steps;
            for (let s = 0; s < bz_steps; s++) {
                const a0 = s * bz_step_angle;
                const a1 = a0 + bz_step_angle + 0.02;
                const light = (Math.cos(a0 - 2.3) + 1) / 2;
                const bv = Math.round(80 + light * 170);
                ctx.beginPath();
                ctx.arc(lx, ly, bezel_r, a0, a1);
                ctx.arc(lx, ly, lens_r + 0.5, a1, a0, true);
                ctx.closePath();
                ctx.fillStyle = `rgb(${bv},${bv},${Math.round(bv * 0.97)})`;
                ctx.fill();
            }
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = 0.15;
            const knurl_steps = 24;
            for (let k = 0; k < knurl_steps; k++) {
                const ka = (k / knurl_steps) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(lx + bezel_r * Math.cos(ka), ly + bezel_r * Math.sin(ka));
                ctx.lineTo(lx + (lens_r + 1) * Math.cos(ka), ly + (lens_r + 1) * Math.sin(ka));
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(lx, ly, lens_r + 0.5, 0, Math.PI * 2);
            ctx.fillStyle = "#1a1a1a";
            ctx.fill();

            const dome_offset_x = lens_r * 0.3;
            const dome_offset_y = lens_r * 0.3;
            const dome_grad = ctx.createRadialGradient(
                lx - dome_offset_x, ly - dome_offset_y, lens_r * 0.05,
                lx + dome_offset_x * 0.3, ly + dome_offset_y * 0.3, lens_r,
            );
            const cr = Math.round(210 + b * 45);
            const cg = Math.round(130 + b * 125);
            const cb = Math.round(50 + b * 205);
            const mr = Math.round(190 + b * 65);
            const mg = Math.round(95 + b * 105);
            const mb = Math.round(20 + b * 30);
            const er = Math.round(140 + b * 115);
            const eg = Math.round(65 + b * 70);
            const eb = Math.round(15 + b * 10);
            dome_grad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
            dome_grad.addColorStop(0.5, `rgb(${mr},${mg},${mb})`);
            dome_grad.addColorStop(1, `rgb(${er},${eg},${eb})`);
            ctx.beginPath();
            ctx.arc(lx, ly, lens_r, 0, Math.PI * 2);
            ctx.fillStyle = dome_grad;
            ctx.fill();

            const edge_dark = 0.3 - b * 0.15;
            const edge_grad = ctx.createRadialGradient(lx, ly, lens_r * 0.5, lx, ly, lens_r);
            edge_grad.addColorStop(0, "rgba(0, 0, 0, 0)");
            edge_grad.addColorStop(0.7, "rgba(0, 0, 0, 0)");
            edge_grad.addColorStop(1, `rgba(0, 0, 0, ${edge_dark})`);
            ctx.beginPath();
            ctx.arc(lx, ly, lens_r, 0, Math.PI * 2);
            ctx.fillStyle = edge_grad;
            ctx.fill();

            ctx.save();
            const hl_x = lx - lens_r * 0.25;
            const hl_y = ly - lens_r * 0.3;
            const hl_r = lens_r * 0.45;
            const hl_grad = ctx.createRadialGradient(hl_x, hl_y, 0, hl_x, hl_y, hl_r);
            hl_grad.addColorStop(0, `rgba(255, 255, 255, ${0.35 + b * 0.25})`);
            hl_grad.addColorStop(0.5, `rgba(255, 255, 240, ${0.12 + b * 0.1})`);
            hl_grad.addColorStop(1, "rgba(255, 255, 255, 0)");
            ctx.beginPath();
            ctx.arc(hl_x, hl_y, hl_r, 0, Math.PI * 2);
            ctx.fillStyle = hl_grad;
            ctx.fill();
            ctx.restore();

            ctx.beginPath();
            const pin_x = lx - lens_r * 0.2;
            const pin_y = ly - lens_r * 0.28;
            const pin_r = lens_r * 0.12;
            ctx.arc(pin_x, pin_y, pin_r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + b * 0.3})`;
            ctx.fill();
        }
    }

    _draw_cores_label() {
        const ctx = this.ctx;
        const { cx, speedo_cy, speedo_r, font_label } = this.layout;

        const arc_r = speedo_r + font_label * 1.9;
        const arc_cy = speedo_cy;
        const letters = ["C", "O", "R", "E", "S"];
        const letter_spread = 0.1;
        const arc_center = -Math.PI / 2;

        ctx.save();
        ctx.font = `600 ${font_label}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < letters.length; i++) {
            const offset = (i - (letters.length - 1) / 2) * letter_spread;
            const angle = arc_center + offset;
            const lx = cx + arc_r * Math.cos(angle);
            const ly = arc_cy + arc_r * Math.sin(angle);

            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillText(letters[i], 0, 0);
            ctx.restore();
        }
        ctx.restore();
    }

    _draw_cpu_label() {
        const ctx = this.ctx;
        const { cx, speedo_cy, speedo_r, font_label } = this.layout;

        const label_y = speedo_cy + speedo_r + font_label * 1.3;
        ctx.font = `600 ${font_label}px "Jost", sans-serif`;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "0.15em";
        ctx.fillText("CPU", cx, label_y);
        ctx.letterSpacing = "0px";
    }

    _draw_speedometer(overall) {
        const ctx = this.ctx;
        const { speedo_cx: sx, speedo_cy: sy, speedo_r: sr, font_number } = this.layout;

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.speedo_face;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const tick_r_outer = sr * 0.88;
        const tick_r_minor = sr * 0.78;
        const tick_r_major = sr * 0.72;
        const number_r = sr * 0.58;

        for (let pct = 0; pct <= 100; pct += 5) {
            const angle = SWEEP_START + (pct / 100) * SWEEP_RANGE;
            const cos_a = Math.cos(angle);
            const sin_a = Math.sin(angle);
            const is_major = pct % 25 === 0;
            const inner_r = is_major ? tick_r_major : tick_r_minor;

            ctx.beginPath();
            ctx.moveTo(sx + tick_r_outer * cos_a, sy + tick_r_outer * sin_a);
            ctx.lineTo(sx + inner_r * cos_a, sy + inner_r * sin_a);
            ctx.strokeStyle = is_major ? COLORS.tick_major : COLORS.tick;
            ctx.lineWidth = is_major ? 2 : 1;
            ctx.stroke();

            if (is_major) {
                ctx.font = `${font_number}px system-ui, sans-serif`;
                ctx.fillStyle = COLORS.number;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(pct), sx + number_r * cos_a, sy + number_r * sin_a);
            }
        }

        const needle_angle = SWEEP_START + (Math.min(100, Math.max(0, overall)) / 100) * SWEEP_RANGE;
        const needle_len = sr * 0.82;
        const needle_half_w = Math.max(1.5, sr * 0.025);
        const cos_n = Math.cos(needle_angle);
        const sin_n = Math.sin(needle_angle);
        const perp_x = -sin_n * needle_half_w;
        const perp_y = cos_n * needle_half_w;

        ctx.beginPath();
        ctx.moveTo(sx + needle_len * cos_n, sy + needle_len * sin_n);
        ctx.lineTo(sx + perp_x, sy + perp_y);
        ctx.lineTo(sx - perp_x, sy - perp_y);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        const tail_len = sr * 0.15;
        const tail_half_w = needle_half_w * 2;
        const tail_px = -sin_n * tail_half_w;
        const tail_py = cos_n * tail_half_w;

        ctx.beginPath();
        ctx.moveTo(sx - tail_len * cos_n, sy - tail_len * sin_n);
        ctx.lineTo(sx + tail_px, sy + tail_py);
        ctx.lineTo(sx - tail_px, sy - tail_py);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        this._draw_needle_cap(sx, sy, Math.max(3, sr * 0.07));
    }

    _draw_odometer(instructions) {
        if (instructions == null) return;
        const ctx = this.ctx;
        const { speedo_cx: sx, speedo_cy: sy, speedo_r: sr } = this.layout;

        const billions = Math.floor(instructions / 1e9);
        const digits = String(billions).padStart(11, "0").slice(-11);

        const digit_count = 11;
        const digit_h = Math.max(8, Math.round(sr * 0.15));
        const digit_w = Math.round(digit_h * 0.65);
        const gap = Math.max(1, Math.round(digit_w * 0.08));
        const total_w = digit_count * digit_w + (digit_count - 1) * gap;
        const odo_x = sx - total_w / 2;
        const odo_y = sy + sr * 0.55;

        const pad = Math.round(digit_h * 0.15);
        round_rect(ctx,
            odo_x - pad, odo_y - pad,
            total_w + pad * 2, digit_h + pad * 2,
            3);
        ctx.fillStyle = "#111111";
        ctx.fill();

        const font_size = Math.round(digit_h * 0.85);
        ctx.font = `600 ${font_size}px "Jost", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < digit_count; i++) {
            const dx = odo_x + i * (digit_w + gap);
            const dy = odo_y;

            round_rect(ctx, dx, dy, digit_w, digit_h, 2);
            ctx.fillStyle = i % 2 === 0 ? "#1a1a1a" : "#1f1f1f";
            ctx.fill();

            ctx.fillStyle = "#ccddcc";
            ctx.fillText(digits[i], dx + digit_w / 2, dy + digit_h / 2 + 1);
        }

        const label_size = Math.max(6, Math.round(digit_h * 0.5));
        ctx.font = `600 ${label_size}px "Jost", sans-serif`;
        ctx.fillStyle = "#888888";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("\u00d7billion", sx, odo_y + digit_h + pad + 2);
    }
}
