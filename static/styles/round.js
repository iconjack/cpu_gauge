import GaugeStyle from "./base.js";

const DEG = Math.PI / 180;
const SWEEP_START = 150 * DEG;  // ~8 o'clock
const SWEEP_RANGE = 240 * DEG;  // to ~4 o'clock

const COLORS = {
    bg: "#2a2a3a",
    face: "#c0c0c8",
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
            lamp_r: Math.max(3, Math.round(R * 0.055)),
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
        this._draw_label();
        this._draw_speedometer(cpu.overall);
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

            const r = Math.round(58 + t * 150);
            const g = Math.round(58 + t * 150);
            const b = Math.round(62 + t * 148);

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
        const bezel_r = lamp_r * 1.25;

        for (let i = 0; i < count; i++) {
            const t = count > 1 ? i / (count - 1) : 0.5;
            const angle = SWEEP_START + t * SWEEP_RANGE;
            const lx = cx + lamp_arc_r * Math.cos(angle);
            const ly = cy + lamp_arc_r * Math.sin(angle);
            const b = per_core[i] / 100; // brightness 0..1

            // --- Layer 1: Outer glow (behind everything) ---
            if (b > 0.05) {
                ctx.save();
                ctx.globalAlpha = b * 0.5;
                const glow_r = lamp_r * 2.5;
                const glow = ctx.createRadialGradient(lx, ly, lamp_r * 0.3, lx, ly, glow_r);
                glow.addColorStop(0, "rgba(255, 160, 40, 0.7)");
                glow.addColorStop(1, "rgba(255, 120, 0, 0)");
                ctx.beginPath();
                ctx.arc(lx, ly, glow_r, 0, Math.PI * 2);
                ctx.fillStyle = glow;
                ctx.fill();
                ctx.restore();
            }

            // --- Layer 2: Bezel (static metal housing) ---
            ctx.save();
            ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;
            ctx.beginPath();
            ctx.arc(lx, ly, bezel_r, 0, Math.PI * 2);
            const bezel_grad = ctx.createRadialGradient(
                lx - bezel_r * 0.3, ly - bezel_r * 0.3, 0,
                lx, ly, bezel_r,
            );
            bezel_grad.addColorStop(0, "#666666");
            bezel_grad.addColorStop(0.7, "#444444");
            bezel_grad.addColorStop(1, "#333333");
            ctx.fillStyle = bezel_grad;
            ctx.fill();
            ctx.restore();

            // --- Layer 3: Jewel lens (dynamic, brightness-dependent) ---
            // Off colors: center rgb(200, 120, 40), edge rgb(160, 80, 15)
            // On colors:  center rgb(255, 240, 200), edge rgb(255, 140, 0)
            const lens_offset = lamp_r * 0.25;
            const lens_grad = ctx.createRadialGradient(
                lx - lens_offset, ly - lens_offset, 0,
                lx, ly, lamp_r,
            );
            const cr = Math.round(200 + b * 55);
            const cg = Math.round(120 + b * 120);
            const cb = Math.round(40 + b * 160);
            const er = Math.round(160 + b * 95);
            const eg = Math.round(80 + b * 60);
            const eb = Math.round(15 + b * -15);
            lens_grad.addColorStop(0, `rgb(${cr},${cg},${cb})`);
            lens_grad.addColorStop(1, `rgb(${er},${eg},${eb})`);
            ctx.beginPath();
            ctx.arc(lx, ly, lamp_r, 0, Math.PI * 2);
            ctx.fillStyle = lens_grad;
            ctx.fill();

            // --- Layer 4: Glass specular highlight (always visible) ---
            ctx.save();
            ctx.beginPath();
            const spec_r = lamp_r * 0.35;
            const spec_x = lx - lamp_r * 0.2;
            const spec_y = ly - lamp_r * 0.35;
            ctx.ellipse(spec_x, spec_y, spec_r, spec_r * 0.6, -0.3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
            ctx.fill();
            ctx.restore();
        }
    }

    _draw_label() {
        const ctx = this.ctx;
        const { cx, cy, speedo_cy, speedo_r, font_label } = this.layout;

        // Arc the letters "C P U" above the inner gauge
        const arc_r = speedo_r + font_label * 1.4;
        const arc_cy = speedo_cy;
        const letters = ["C", "P", "U"];
        const letter_spread = 0.12; // radians between letters
        const arc_center = -Math.PI / 2; // top of arc

        ctx.save();
        ctx.font = `${font_label}px "Limelight", serif`;
        ctx.fillStyle = COLORS.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < letters.length; i++) {
            const offset = (i - 1) * letter_spread;
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
}
