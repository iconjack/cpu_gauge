const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

let ws = null;
let reconnect_delay = RECONNECT_BASE_MS;
let reconnect_timer = null;
let style = null;
let canvas = null;

function get_style_name() {
    const path = location.pathname.replace(/^\/+|\/+$/g, "");
    if (!path || !/^[a-z0-9_-]+$/.test(path)) return "plain";
    return path;
}

function build_ws_url() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/ws`;
}

function resize_canvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (style) style.resize(w, h);
}

function connect() {
    if (reconnect_timer) {
        clearTimeout(reconnect_timer);
        reconnect_timer = null;
    }

    ws = new WebSocket(build_ws_url());

    ws.onopen = function () {
        reconnect_delay = RECONNECT_BASE_MS;
        if (style) style.set_status("connected");
    };

    ws.onmessage = function (event) {
        if (style) style.update(JSON.parse(event.data));
    };

    ws.onclose = function () {
        schedule_reconnect();
    };

    ws.onerror = function () {
        // onclose fires after onerror, so reconnect is handled there
    };
}

function schedule_reconnect() {
    if (style) style.set_status("disconnected");
    reconnect_timer = setTimeout(function () {
        connect();
    }, reconnect_delay);
    reconnect_delay = Math.min(reconnect_delay * 1.5, RECONNECT_MAX_MS);
}

async function init() {
    canvas = document.getElementById("gauge-canvas");
    resize_canvas();
    window.addEventListener("resize", resize_canvas);

    const style_name = get_style_name();

    try {
        const module = await import(`./styles/${style_name}.js`);
        style = new module.default(canvas);
    } catch (err) {
        console.warn(`Style "${style_name}" not found, falling back to plain.`, err);
        const module = await import("./styles/plain.js");
        style = new module.default(canvas);
    }

    style.init();
    style.resize(window.innerWidth, window.innerHeight);
    connect();
}

init();
