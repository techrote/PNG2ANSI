import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [html,app,worker,quickstart,parameters,schema]=await Promise.all([
  read("../PNG2ANSI-web.html"),read("../src/app.js"),read("../src/worker.js"),read("../QUICKSTART.md"),read("../PARAMETERS.md"),read("../png2ansi.schema.json")
]);

test("tracked artifact is single-file and network-disabled",()=>{
  assert.match(html,/connect-src 'none'/);assert.match(html,/font\/ttf;base64,/);assert.equal((html.match(/<script>/g)||[]).length,2);
  assert.doesNotMatch(html,/<script[^>]+src=/i);assert.doesNotMatch(html,/<link[^>]+href=/i);assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("worker jobs and UI debounce reject stale work without accumulating workers",()=>{
  assert.match(worker,/if\(id!==latest\)return/);assert.match(app,/if\(message\.id!==job\)return/);assert.match(app,/timer=setTimeout\(\(\)=>convert\(id\),240\)/);
  assert.match(app,/function stopWorker\(\)\{if\(worker\)\{worker\.terminate\(\);worker=null/);assert.match(app,/const id=\+\+job;stopWorker\(\)/);assert.match(app,/maxActive:0/);
});

test("numeric controls commit transactionally and expose safe candidate limits",()=>{
  assert.match(app,/const candidate=PNG2ANSI\.clone\(config\);assignPath\(candidate/);assert.match(app,/PNG2ANSI\.validateConfig\(candidate\);config=candidate/);
  assert.match(app,/Math\.max\(item\.min,Math\.min\(item\.max,parsed\)\)/);assert.match(app,/foreground_candidates[^\n]+max:12/);assert.match(app,/background_candidates[^\n]+max:8/);
  assert.match(app,/item\.range\?"input":"change"/);assert.match(app,/addEventListener\("blur"/);assert.match(app,/value<item\.min\|\|value>item\.max/);assert.match(app,/PNG2ANSI\.validateWorkload\(config,currentCodes\(\)\.length\)/);
});

test("visible workflow, schema-v2 preprocessing, guidance, and help ship",()=>{
  for(const label of ["Source raster","ANSI preview","Conversion console","Download .ANS","Export profile","Advanced parameters","Enable Derez","Enable NL Filter","Estimated fitting load","Use safe 12×8 maximum","Offline help · quickstart"])assert.ok(html.includes(label),label);
  for(const field of ["derez.enabled","derez.width","nl_filter.enabled","nl_filter.mode","foreground_candidates","background_candidates","structure_blur","texture_blur","edge_threshold","texture_threshold","highlight_threshold","accent_luminance_scale","sparsity_range","saturation_range"])assert.ok(html.includes(field),field);
  assert.match(html,/PNG2ANSI-web v0\.2\.0/);assert.doesNotMatch(html,/\/\*__QUICKSTART__\*\//);
});

test("quickstart length and parameter documentation meet the release contract",()=>{
  const words=quickstart.trim().split(/\s+/).length;assert.ok(words>=380&&words<=430,`quickstart has ${words} words`);
  for(const name of ["canvas.columns","canvas.rows","image.brightness","fit.foreground_candidates","fit.background_candidates","derez.enabled","derez.width","derez.height","nl_filter.enabled","nl_filter.mode","nl_filter.radius","nl_filter.alpha","industrial.edge_weight","industrial.saturation_range"])assert.ok(parameters.includes(`\`${name}\``),name);
  const parsed=JSON.parse(schema);assert.equal(parsed.properties.schema_version.const,2);assert.equal(parsed.$defs.fit.properties.foreground_candidates.maximum,12);assert.equal(parsed.$defs.fit.properties.background_candidates.maximum,8);
});
