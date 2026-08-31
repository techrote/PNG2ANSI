import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const html = await readFile(new URL("../PNG2ANSI-web.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

test("tracked artifact is single-file and network-disabled", () => {
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /font\/ttf;base64,/);
  assert.equal((html.match(/<script>/g) || []).length, 2);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=/i);
  assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("worker jobs and UI debounce reject stale work", () => {
  assert.match(worker, /if\(id!==latest\)return/);
  assert.match(app, /if\(message\.id!==job\)return/);
  assert.match(app, /setTimeout\(convert,240\)/);
});

test("visible workflow and every schema field ship in the artifact", () => {
  for (const label of ["Source raster","ANSI preview","Conversion console","Download .ANS","Export profile","Advanced parameters"]) assert.ok(html.includes(label), label);
  for (const field of ["structure_blur","texture_blur","edge_threshold","texture_threshold","highlight_threshold","accent_luminance_scale","sparsity_range","saturation_range"]) assert.ok(html.includes(field), field);
});
