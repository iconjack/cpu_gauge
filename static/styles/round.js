import GaugeStyle from "./base.js";

const DEG = Math.PI / 180;
const SWEEP_START = 150 * DEG;  // ~8 o'clock
const SWEEP_RANGE = 240 * DEG;  // to ~4 o'clock
const LAMP_SWEEP_RANGE = 120 * DEG;
const LAMP_SWEEP_START = (270 * DEG) - (LAMP_SWEEP_RANGE / 2);

const COLORS = {
    bg: "#2a2a3a",
    face: "#d4cfc2",
    speedo_face: "#e8e8ec",
    rim_light: "#d0d0d8",
    rim_mid: "#888890",
    rim_dark: "#3a3a42",
    rim_edge: "#222228",
    tick: "#666677",
    tick_major: "#444455",
    number: "#555566",
    lamp_on: "#ff8800",
    lamp_off: "#332200",
    needle: "#ee3333",
    needle_cap: "#cccccc",
    label: "#444455",
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
        const R = Math.floor((Math.min(width, height) - pad * 2) / 2);
        const cx = Math.round(width / 2);
        const cy = Math.round(height / 2);

        this.layout = {
            cx, cy, R,
            rim_width: Math.max(4, Math.round(R * 0.06)),
            lamp_r: Math.max(3, Math.round(R * 0.048)),
            lamp_arc_r: R * 0.75,
            speedo_cx: cx,
            speedo_cy: cy + Math.round(R * 0.15),
            speedo_r: Math.round(R * 0.52),
            font_label: Math.max(10, Math.round(R * 0.09)),
            font_number: Math.max(7, Math.round(R * 0.065)),
        };

        this.render();
    }

    render() {
        if (!this.data || !this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.w, this.h);

        this.render_cpu();
    }

    render_cpu() {
        const ctx = this.ctx;
        const L = this.layout;
        const cpu = this.data.cpu;

        this._draw_chrome_rim();
        this._draw_gauge_face();
        this._draw_core_lamps(cpu.per_core);
        this._draw_cores_label();
        this._draw_speedometer(cpu.overall);
        this._draw_odometer(cpu.instructions_retired);
        this._draw_cpu_label();
    }

    _draw_chrome_rim() {
        const ctx = this.ctx;
        const { cx, cy, R, rim_width } = this.layout;

        // Outer rim — conic-like gradient simulated with arc segments
        const steps = 120;
        const step_angle = (2 * Math.PI) / steps;
        for (let i = 0; i < steps; i++) {
            const a0 = i * step_angle - Math.PI / 2;
            const a1 = a0 + step_angle + 0.01;

            // Simulate light from upper-left: brightest at ~135° (10 o'clock),
            // darkest at ~315° (4 o'clock)
            const light_angle = a0 + Math.PI * 0.75;
            const t = (Math.cos(light_angle) + 1) / 2; // 0 = dark, 1 = bright

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

        // Subtle highlight line on inner edge
        ctx.beginPath();
        ctx.arc(cx, cy, R - rim_width + 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Subtle shadow line on outer edge
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _draw_gauge_face() {
        const ctx = this.ctx;
        const { cx, cy, R, rim_width } = this.layout;

        ctx.beginPath();
        ctx.arc(cx, cy, R - rim_width, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.face;
        ctx.fill();
    }

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
            const b = per_core[i] / 100; // brightness 0..1

            // --- Layer 1: Outer glow cast onto panel ---
            if (b > 0.05) {
                ctx.save();
                ctx.globalAlpha = b * 0.6;
                const glow_r = lamp_r * 3;
                const glow = ctx.createRadialGradient(lx, ly, lamp_r * 0.2, lx, ly, glow_r);
                glow.addColorStop(0, "rgba(255, 160, 40, 0.6)");
                glow.addColorStop(0.4, "rgba(255, 120, 20, 0.2)");
                glow.addColorStop(1, "rgba(255, 100, 0, 0)");
                ctx.beginPath();
                ctx.arc(lx, ly, glow_r, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
                ctx.restore();
            }

            // --- Layer 2: Chrome bezel (shiny threaded ring) ---
            // Conic metallic gradient simulated with arc segments
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 2;
            ctx.shadowOffsetY = 1;
            const bz_steps = 36;
            const bz_step_angle = (2 * Math.PI) / bz_steps;
            for (let s = 0; s < bz_steps; s++) {
                const a0 = s * bz_step_angle;
                const a1 = a0 + bz_step_angle + 0.02;
                // Light from upper-left
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

            // Knurled edge — fine radial lines on bezel
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

            // --- Layer 3: Dark recess between bezel and lens ---
            ctx.beginPath();
            ctx.arc(lx, ly, lens_r + 0.5, 0, Math.PI * 2);
            ctx.fillStyle = "#1a1a1a";
            ctx.fill();

            // --- Layer 4: Convex dome lens ---
            // Base fill — the dome color
            const dome_offset_x = lens_r * 0.3;
            const dome_offset_y = lens_r * 0.3;
            const dome_grad = ctx.createRadialGradient(
                lx - dome_offset_x, ly - dome_offset_y, lens_r * 0.05,
                lx + dome_offset_x * 0.3, ly + dome_offset_y * 0.3, lens_r,
            );
            // Off: warm orange glass. On: hot center fading to saturated orange
            const cr = Math.round(210 + b * 45);
            const cg = Math.round(130 + b * 110);
            const cb = Math.round(50 + b * 150);
            const mr = Math.round(190 + b * 65);
            const mg = Math.round(95 + b * 55);
            const mb = Math.round(20 + b * -5);
            const er = Math.round(130 + b * 80);
            const eg = Math.round(60 + b * 30);
            const eb = Math.round(15 + b * -5);
            dome_grad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
            dome_grad.addColorStop(0.5, `rgb(${mr},${mg},${mb})`);
            dome_grad.addColorStop(1, `rgb(${er},${eg},${eb})`);
            ctx.beginPath();
            ctx.arc(lx, ly, lens_r, 0, Math.PI * 2);
            ctx.fillStyle = dome_grad;
            ctx.fill();

            // Dome edge darkening — simulates curvature rolling away
            const edge_grad = ctx.createRadialGradient(lx, ly, lens_r * 0.5, lx, ly, lens_r);
            edge_grad.addColorStop(0, "rgba(0, 0, 0, 0)");
            edge_grad.addColorStop(0.7, "rgba(0, 0, 0, 0)");
            edge_grad.addColorStop(1, "rgba(0, 0, 0, 0.3)");
            ctx.beginPath();
            ctx.arc(lx, ly, lens_r, 0, Math.PI * 2);
            ctx.fillStyle = edge_grad;
            ctx.fill();

            // --- Layer 5: Primary specular highlight (dome reflection) ---
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

            // --- Layer 6: Small sharp specular (room light pinpoint) ---
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

        // Arc the letters "CORES" above the inner gauge
        const arc_r = speedo_r + font_label * 1.4;
        const arc_cy = speedo_cy;
        const letters = ["C", "O", "R", "E", "S"];
        const letter_spread = 0.1; // radians between letters
        const arc_center = -Math.PI / 2; // top of arc

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
        const L = this.layout;
        const { speedo_cx: sx, speedo_cy: sy, speedo_r: sr, font_number } = L;

        // Speedometer face
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.speedo_face;
        ctx.fill();

        // Subtle border
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tick marks
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

            // Numbers at major ticks
            if (is_major) {
                ctx.font = `${font_number}px system-ui, sans-serif`;
                ctx.fillStyle = COLORS.number;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(pct), sx + number_r * cos_a, sy + number_r * sin_a);
            }
        }

        // Needle
        const needle_angle = SWEEP_START + (Math.min(100, Math.max(0, overall)) / 100) * SWEEP_RANGE;
        const needle_len = sr * 0.82;
        const needle_half_w = Math.max(1.5, sr * 0.025);

        const cos_n = Math.cos(needle_angle);
        const sin_n = Math.sin(needle_angle);
        const perp_x = -sin_n * needle_half_w;
        const perp_y = cos_n * needle_half_w;

        // Needle triangle
        ctx.beginPath();
        ctx.moveTo(sx + needle_len * cos_n, sy + needle_len * sin_n);
        ctx.lineTo(sx + perp_x, sy + perp_y);
        ctx.lineTo(sx - perp_x, sy - perp_y);
        ctx.closePath();
        ctx.fillStyle = COLORS.needle;
        ctx.fill();

        // Tail (short counterweight)
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

        // Center cap
        const cap_r = Math.max(3, sr * 0.07);
        ctx.beginPath();
        ctx.arc(sx, sy, cap_r, 0, Math.PI * 2);
        const cap_grad = ctx.createRadialGradient(
            sx - cap_r * 0.3, sy - cap_r * 0.3, 0,
            sx, sy, cap_r,
        );
        cap_grad.addColorStop(0, "#eeeeee");
        cap_grad.addColorStop(1, "#888888");
        ctx.fillStyle = cap_grad;
        ctx.fill();
    }

    _draw_odometer(instructions) {
        if (instructions == null) return;
        const ctx = this.ctx;
        const { speedo_cx: sx, speedo_cy: sy, speedo_r: sr } = this.layout;

        // Show billions of instructions, 6 digits zero-padded
        const billions = Math.floor(instructions / 1e9);
        const digits = String(billions).padStart(12, "0").slice(-12);

        // Position in the dead zone at the bottom of the speedometer
        const digit_count = 12;
        const digit_h = Math.max(8, Math.round(sr * 0.13));
        const digit_w = Math.round(digit_h * 0.65);
        const gap = Math.max(1, Math.round(digit_w * 0.08));
        const total_w = digit_count * digit_w + (digit_count - 1) * gap;
        const odo_x = sx - total_w / 2;
        const odo_y = sy + sr * 0.55;

        // Odometer background
        const pad = Math.round(digit_h * 0.15);
        round_rect(ctx,
            odo_x - pad, odo_y - pad,
            total_w + pad * 2, digit_h + pad * 2,
            3);
        ctx.fillStyle = "#111111";
        ctx.fill();

        // Individual digit cells
        const font_size = Math.round(digit_h * 0.85);
        ctx.font = `600 ${font_size}px "Jost", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < digit_count; i++) {
            const dx = odo_x + i * (digit_w + gap);
            const dy = odo_y;

            // Cell background — alternating subtle shades
            round_rect(ctx, dx, dy, digit_w, digit_h, 2);
            ctx.fillStyle = i % 2 === 0 ? "#1a1a1a" : "#1f1f1f";
            ctx.fill();

            // Digit
            ctx.fillStyle = "#ccddcc";
            ctx.fillText(digits[i], dx + digit_w / 2, dy + digit_h / 2 + 1);
        }

        // "×billion" label underneath
        const label_size = Math.max(6, Math.round(digit_h * 0.5));
        ctx.font = `600 ${label_size}px "Jost", sans-serif`;
        ctx.fillStyle = "#888888";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText("\u00d7billion", sx, odo_y + digit_h + pad + 2);
    }
}
