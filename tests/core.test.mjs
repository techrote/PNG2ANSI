import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/core.js", import.meta.url), "utf8");
const context = { console };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "core.js" });
const api = context.PNG2ANSI;

test("schema v1 defaults match the Python reference contract", () => {
  const value = api.configFrom();
  assert.equal(value.schema_version, 1);
  assert.equal(value.canvas.columns, 80);
  assert.equal(value.canvas.rows, 40);
  assert.deepEqual(JSON.parse(JSON.stringify(value.canvas)), {
    columns:80, rows:40, cell_width:8, cell_height:16,
    sample_width:4, sample_height:8, font_size:14, resampler:"lanczos"
  });
  assert.equal(value.image.sharpness, 1.18);
  assert.equal(value.industrial.accent_weight, 0.70);
});

test("configuration is strict and nested overrides preserve other defaults", () => {
  const value = api.configFrom({ canvas: { columns: 96 }, image: { gamma: 1.4 } });
  assert.equal(value.canvas.columns, 96);
  assert.equal(value.canvas.rows, 40);
  assert.equal(value.image.gamma, 1.4);
  assert.throws(() => api.configFrom({ canvas: { mystery: 1 } }), /unknown configuration key/);
  assert.throws(() => api.configFrom({ canvas: { columns: 4 } }), /columns/);
  assert.throws(() => api.configFrom({ industrial: { sparsity_range: 0 } }), /sparsity_range/);
});

test("all five vocabularies are CP437 byte codes", () => {
  const sets = api.vocabularies();
  assert.deepEqual(Object.keys(sets), ["full-cp437","ascii","box-block","industrial-sparse","industrial-dense"]);
  assert.equal(sets["full-cp437"].length, 224);
  assert.equal(sets.ascii.length, 95);
  for (const values of Object.values(sets)) for (const code of values) assert.ok(code >= 32 && code <= 255);
});

test("multiple ANSI references make a frequency-ordered union", () => {
  const esc = 27;
  const values = api.referenceVocabulary([
    new Uint8Array([esc,91,51,49,109,65,65,65,176]),
    new Uint8Array([esc,91,51,54,109,66,66,178])
  ]);
  assert.equal(values[0], 32);
  assert.ok(values.indexOf(65) < values.indexOf(66));
  assert.ok(values.includes(176));
  assert.ok(values.includes(178));
});

test("ANSI encoder emits classic SGR, one CP437 cell, reset, and no footer", () => {
  const bytes = api.ansiBytes(
    { codes: [65] },
    { chosen: new Uint16Array([0]), fg: new Uint8Array([9]), bg: new Uint8Array([0]) },
    api.configFrom({ canvas: { columns:16, rows:8 } })
  );
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /^\x1b\[1;31;40mA\x1b\[0m$/);
  assert.doesNotMatch(text, /(?:38|48);/);
  assert.ok(!Buffer.from(bytes).includes(Buffer.from("SAUCE00")));
});
