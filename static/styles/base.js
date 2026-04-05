export function format_bytes(bytes) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

const DEFAULT_ANIMATION_MS = 1000;
const MIN_ANIMATION_MS = 200;
const MAX_ANIMATION_MS = 5000;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function is_plain_object(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function clone_value(value) {
    if (Array.isArray(value)) {
        return value.map(clone_value);
    }

    if (is_plain_object(value)) {
        const result = {};
        for (const [key, child] of Object.entries(value)) {
            result[key] = clone_value(child);
        }
        return result;
    }

    return value;
}

function interpolate_value(from, to, progress) {
    if (
        typeof from === "number" &&
        typeof to === "number" &&
        Number.isFinite(from) &&
        Number.isFinite(to)
    ) {
        return from + (to - from) * progress;
    }

    if (Array.isArray(to)) {
        const from_array = Array.isArray(from) ? from : [];
        return to.map((value, index) => interpolate_value(from_array[index], value, progress));
    }

    if (is_plain_object(to)) {
        const from_object = is_plain_object(from) ? from : {};
        const result = {};
        for (const [key, value] of Object.entries(to)) {
            result[key] = interpolate_value(from_object[key], value, progress);
        }
        return result;
    }

    return clone_value(to);
}

export default class GaugeStyle {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.data = null;
        this.status = "disconnected";
        this.w = 0;
        this.h = 0;
        this.animation_frame = null;
        this.animation_from = null;
        this.animation_to = null;
        this.animation_started_at = 0;
        this.animation_duration_ms = DEFAULT_ANIMATION_MS;
        this.last_update_at = null;
        this._animate_frame = this._animate_frame.bind(this);
    }

    get orientation() { return "any"; }

    init() {}

    resize(width, height) {
        this.w = width;
        this.h = height;
        this._sync_animation(performance.now());
        this.render();
    }

    set_status(state) {
        this.status = state;
        this._sync_animation(performance.now());
        this.render();
    }

    update(data) {
        const now = performance.now();

        if (!this.data) {
            this.data = clone_value(data);
            this.animation_from = null;
            this.animation_to = null;
            this.last_update_at = now;
            this.render();
            return;
        }

        this._sync_animation(now);

        const duration_ms = this.last_update_at == null
            ? DEFAULT_ANIMATION_MS
            : clamp(now - this.last_update_at, MIN_ANIMATION_MS, MAX_ANIMATION_MS);

        this.animation_from = clone_value(this.data);
        this.animation_to = clone_value(data);
        this.animation_started_at = now;
        this.animation_duration_ms = duration_ms;
        this.last_update_at = now;
        this.data = interpolate_value(this.animation_from, this.animation_to, 0);
        this.render();
        this._ensure_animation_frame();
    }

    render() {
        if (!this.data || !this.w) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.render_header();
        this.render_cpu();
        this.render_memory();
        this.render_temperatures();
        this.render_footer();
    }

    render_header() {}
    render_cpu() {}
    render_memory() {}
    render_temperatures() {}
    render_footer() {}

    _ensure_animation_frame() {
        if (this.animation_frame != null || !this.animation_to) return;
        this.animation_frame = requestAnimationFrame(this._animate_frame);
    }

    _sync_animation(now) {
        if (!this.animation_to) return;

        const elapsed = now - this.animation_started_at;
        const progress = this.animation_duration_ms <= 0
            ? 1
            : clamp(elapsed / this.animation_duration_ms, 0, 1);

        this.data = interpolate_value(this.animation_from, this.animation_to, progress);

        if (progress >= 1) {
            this.data = clone_value(this.animation_to);
            this.animation_from = null;
            this.animation_to = null;
        }
    }

    _animate_frame(now) {
        this.animation_frame = null;
        this._sync_animation(now);
        this.render();

        if (this.animation_to) {
            this._ensure_animation_frame();
        }
    }
}
