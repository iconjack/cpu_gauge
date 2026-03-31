export function format_bytes(bytes) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

export default class GaugeStyle {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.data = null;
        this.status = "disconnected";
        this.w = 0;
        this.h = 0;
    }

    get orientation() { return "any"; }

    init() {}

    resize(width, height) {
        this.w = width;
        this.h = height;
        this.render();
    }

    set_status(state) {
        this.status = state;
        this.render();
    }

    update(data) {
        this.data = data;
        this.render();
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
}
