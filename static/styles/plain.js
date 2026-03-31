import GaugeStyle, { format_bytes } from "./base.js";

const CHIP_NAMES = {
    k10temp: "CPU",
    coretemp: "CPU",
    amdgpu: "GPU",
    nvme: "NVMe",
};

const COLORS = {
    bg: "#0f0f1a",
    card: "#1a1a2e",
    bar_track: "#2a2a3e",
    text: "#e0e0e0",
    text_dim: "#8888aa",
    text_bright: "#ffffff",
    green: "#4ade80",
    yellow: "#facc15",
    red: "#f87171",
    blue: "#60a5fa",
};

function level_color(value, thresholds) {
    if (value < thresholds[0]) return COLORS.green;
    if (value < thresholds[1]) return COLORS.yellow;
    return COLORS.red;
}

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

export default class PlainStyle extends GaugeStyle {
    init() {
        this.layout = {};
    }

    resize(width, height) {
        this.w = width;
        this.h = height;

        const pad = Math.round(width * 0.04);
        const content_w = width - pad * 2;

        this.layout = {
            pad,
            content_w,
            card_pad: Math.round(width * 0.04),
            card_radius: Math.round(width * 0.03),
            font_header: Math.max(11, Math.round(height * 0.018)),
            font_big: Math.max(24, Math.round(height * 0.055)),
            font_section: Math.max(10, Math.round(height * 0.014)),
            font_detail: Math.max(11, Math.round(height * 0.017)),
            font_core_label: Math.max(8, Math.round(height * 0.012)),
            font_temp: Math.max(13, Math.round(height * 0.022)),
            font_footer: Math.max(10, Math.round(height * 0.016)),
            bar_height: Math.max(16, Math.round(height * 0.028)),
            bar_radius: 4,
            mem_bar_height: Math.max(10, Math.round(height * 0.015)),
            core_cols: 6,
            core_gap: Math.max(3, Math.round(width * 0.012)),
        };

        this.render();
    }

    render() {
        if (!this.data || !this.w) return;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Fill background
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let y = this.layout.pad;
        y = this.render_header(y);
        y += this.layout.pad;
        y = this.render_cpu(y);
        y += this.layout.pad;
        y = this.render_memory(y);
        y += this.layout.pad;
        y = this.render_temperatures(y);
        this.render_footer();

        return y;
    }

    render_header(y) {
        const ctx = this.ctx;
        const L = this.layout;
        const font_size = L.font_header;

        // Hostname
        ctx.font = `600 ${font_size}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const hostname = (this.data.hostname || "---").toUpperCase();
        ctx.fillText(hostname, L.pad, y + font_size / 2);

        // Connection status
        const dot_r = Math.round(font_size * 0.4);
        const status_text = this.status === "connected" ? "Connected" : "Reconnecting...";
        ctx.font = `${Math.round(font_size * 0.85)}px system-ui, sans-serif`;
        const text_w = ctx.measureText(status_text).width;
        const right_x = this.w - L.pad;

        ctx.fillStyle = COLORS.text_dim;
        ctx.textAlign = "right";
        ctx.fillText(status_text, right_x, y + font_size / 2);

        // Status dot
        const dot_x = right_x - text_w - dot_r - 6;
        ctx.beginPath();
        ctx.arc(dot_x, y + font_size / 2, dot_r, 0, Math.PI * 2);
        ctx.fillStyle = this.status === "connected" ? COLORS.green : COLORS.red;
        ctx.fill();

        return y + font_size + 4;
    }

    render_cpu(y) {
        const ctx = this.ctx;
        const L = this.layout;
        const cpu = this.data.cpu;
        const start_y = y;

        // Card background
        const cores = cpu.per_core;
        const rows = Math.ceil(cores.length / L.core_cols);
        const core_cell_h = L.bar_height + L.font_core_label + 6;
        const card_h =
            L.card_pad +
            L.font_section + 8 +
            L.font_big + 12 +
            rows * (core_cell_h + L.core_gap) - L.core_gap +
            L.card_pad;

        this._draw_card(L.pad, y, L.content_w, card_h);
        y += L.card_pad;

        // Section label
        ctx.font = `600 ${L.font_section}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("CPU", L.pad + L.card_pad, y);
        y += L.font_section + 8;

        // Big number
        ctx.font = `700 ${L.font_big}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_bright;
        ctx.fillText(Math.round(cpu.overall) + "%", L.pad + L.card_pad, y);
        y += L.font_big + 12;

        // Core bars
        const grid_x = L.pad + L.card_pad;
        const grid_w = L.content_w - L.card_pad * 2;
        const cell_w = (grid_w - (L.core_cols - 1) * L.core_gap) / L.core_cols;

        for (let i = 0; i < cores.length; i++) {
            const col = i % L.core_cols;
            const row = Math.floor(i / L.core_cols);
            const cx = grid_x + col * (cell_w + L.core_gap);
            const cy = y + row * (core_cell_h + L.core_gap);
            const val = cores[i];

            // Bar track
            round_rect(ctx, cx, cy, cell_w, L.bar_height, L.bar_radius);
            ctx.fillStyle = COLORS.bar_track;
            ctx.fill();

            // Bar fill
            const fill_w = Math.max(0, (val / 100) * cell_w);
            if (fill_w > 0) {
                ctx.save();
                round_rect(ctx, cx, cy, cell_w, L.bar_height, L.bar_radius);
                ctx.clip();
                ctx.fillStyle = level_color(val, [50, 80]);
                ctx.fillRect(cx, cy, fill_w, L.bar_height);
                ctx.restore();
            }

            // Core label
            ctx.font = `${L.font_core_label}px system-ui, sans-serif`;
            ctx.fillStyle = COLORS.text_dim;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(String(i), cx + cell_w / 2, cy + L.bar_height + 2);
        }

        return start_y + card_h;
    }

    render_memory(y) {
        const ctx = this.ctx;
        const L = this.layout;
        const mem = this.data.memory;
        const start_y = y;

        const card_h =
            L.card_pad +
            L.font_section + 8 +
            L.font_big + 4 +
            L.font_detail + 12 +
            L.mem_bar_height +
            L.card_pad;

        this._draw_card(L.pad, y, L.content_w, card_h);
        y += L.card_pad;

        // Section label
        ctx.font = `600 ${L.font_section}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("MEMORY", L.pad + L.card_pad, y);
        y += L.font_section + 8;

        // Big number
        ctx.font = `700 ${L.font_big}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_bright;
        ctx.fillText(mem.percent.toFixed(1) + "%", L.pad + L.card_pad, y);
        y += L.font_big + 4;

        // Detail
        ctx.font = `${L.font_detail}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.fillText(
            format_bytes(mem.used_bytes) + " / " + format_bytes(mem.total_bytes),
            L.pad + L.card_pad,
            y,
        );
        y += L.font_detail + 12;

        // Bar track
        const bar_x = L.pad + L.card_pad;
        const bar_w = L.content_w - L.card_pad * 2;
        round_rect(ctx, bar_x, y, bar_w, L.mem_bar_height, L.mem_bar_height / 2);
        ctx.fillStyle = COLORS.bar_track;
        ctx.fill();

        // Bar fill
        const fill_w = Math.max(0, (mem.percent / 100) * bar_w);
        if (fill_w > 0) {
            ctx.save();
            round_rect(ctx, bar_x, y, bar_w, L.mem_bar_height, L.mem_bar_height / 2);
            ctx.clip();
            ctx.fillStyle = COLORS.blue;
            ctx.fillRect(bar_x, y, fill_w, L.mem_bar_height);
            ctx.restore();
        }

        return start_y + card_h;
    }

    render_temperatures(y) {
        const ctx = this.ctx;
        const L = this.layout;
        const temps = this.data.temperatures;
        const start_y = y;

        // Count rows
        let row_count = 0;
        for (const readings of Object.values(temps)) {
            row_count += readings.length;
        }
        if (row_count === 0) return y;

        const row_h = L.font_temp + 10;
        const card_h =
            L.card_pad +
            L.font_section + 8 +
            row_count * row_h +
            L.card_pad;

        this._draw_card(L.pad, y, L.content_w, card_h);
        y += L.card_pad;

        // Section label
        ctx.font = `600 ${L.font_section}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText("TEMPERATURES", L.pad + L.card_pad, y);
        y += L.font_section + 8;

        // Temp rows
        for (const [chip, readings] of Object.entries(temps)) {
            const friendly = CHIP_NAMES[chip] || chip;

            for (const reading of readings) {
                const label = friendly + " " + reading.label;
                const temp = reading.current;
                const temp_text = temp.toFixed(1) + "\u00b0C";

                // Label
                ctx.font = `${L.font_detail}px system-ui, sans-serif`;
                ctx.fillStyle = COLORS.text_dim;
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillText(label, L.pad + L.card_pad, y);

                // Value
                ctx.font = `600 ${L.font_temp}px system-ui, sans-serif`;
                ctx.fillStyle = level_color(temp, [60, 80]);
                ctx.textAlign = "right";
                ctx.fillText(temp_text, L.pad + L.content_w - L.card_pad, y);

                y += row_h;
            }
        }

        return start_y + card_h;
    }

    render_footer() {
        const ctx = this.ctx;
        const L = this.layout;
        const seconds = this.data.uptime_seconds;

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let parts = [];
        if (days > 0) parts.push(days + "d");
        if (hours > 0 || days > 0) parts.push(hours + "h");
        parts.push(minutes + "m");

        const text = "Uptime: " + parts.join(" ");

        ctx.font = `${L.font_footer}px system-ui, sans-serif`;
        ctx.fillStyle = COLORS.text_dim;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(text, this.w / 2, this.h - L.pad);
    }

    _draw_card(x, y, w, h) {
        const ctx = this.ctx;
        round_rect(ctx, x, y, w, h, this.layout.card_radius);
        ctx.fillStyle = COLORS.card;
        ctx.fill();
    }
}
