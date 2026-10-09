#!/usr/bin/env bun
/**
 * serve.mjs — serve the prototype on loopback. Bun only, no dependencies.
 *
 *   bun prototypes/dashboard-ui-rework/serve.mjs            # http://127.0.0.1:3013
 *   bun prototypes/dashboard-ui-rework/serve.mjs --port 3014
 *
 * Static, self-contained files from this directory. It never contacts a Nakama instance, holds no
 * credentials and performs no writes; the page renders the frozen export only. `/healthz` returns a
 * tiny JSON readiness body so a startup check does not have to fetch the HTML.
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i === -1 ? fallback : args[i + 1]; };

const PORT = Number(flag("port", process.env.PROTOTYPE_PORT ?? "3013"));
const HOST = flag("host", "127.0.0.1");
const ROOT = import.meta.dir;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, service: "dashboard-ui-rework-prototype", dir: ROOT });
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const filePath = new URL("." + rel, import.meta.url);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    const ext = rel.slice(rel.lastIndexOf("."));
    return new Response(file, { headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" } });
  },
});

console.log(`dashboard-ui-rework prototype serving at http://${HOST}:${server.port}/ (dir ${ROOT})`);
