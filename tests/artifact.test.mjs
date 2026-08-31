import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [html,app,worker,css,quickstart,parameters,schema]=await Promise.all([
  read("../PNG2ANSI-web.html"),read("../src/app.js"),read("../src/worker.js"),read("../src/styles.css"),read("../QUICKSTART.md"),read("../PARAMETERS.md"),read("../png2ansi.schema.json")
]);
const sample=await readFile(new URL("../assets/panel_box_cyberpunk_machinery_6LKC6GX0.png",import.meta.url));

test("tracked artifact is single-file and network-disabled",()=>{
  assert.match(html,/connect-src 'none'/);assert.match(html,/font\/ttf;base64,/);assert.equal((html.match(/<script>/g)||[]).length,2);
  assert.doesNotMatch(html,/<script[^>]+src=/i);assert.doesNotMatch(html,/<link[^>]+href=/i);assert.doesNotMatch(html,/\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("worker jobs and UI debounce reject stale work without accumulating workers",()=>{
  assert.match(worker,/if\(id!==latest\)return/);assert.match(app,/if\(message\.id!==job\)return/);assert.match(app,/timer=setTimeout\(\(\)=>convert\(id,override\),240\)/);
  assert.match(app,/function stopWorker\(\)\{if\(worker\)\{worker\.terminate\(\);worker=null/);assert.match(app,/const id=\+\+job;forcedJob=override\?id:0;stopWorker\(\)/);assert.match(app,/maxActive:0/);
});

test("numeric controls commit transactionally and expose safe candidate limits",()=>{
  assert.match(app,/const candidate=PNG2ANSI\.clone\(config\);assignPath\(candidate/);assert.match(app,/PNG2ANSI\.validateConfig\(candidate\);config=candidate/);
  assert.match(app,/Math\.max\(item\.min,Math\.min\(item\.max,parsed\)\)/);assert.match(app,/foreground_candidates[^\n]+max:12/);assert.match(app,/background_candidates[^\n]+max:8/);
  assert.match(app,/const item=controls\.find[^\n]+isSlider=input\.type==="range",event=isSlider\?"input":"change"/);assert.match(app,/addEventListener\("blur"/);assert.match(app,/value<item\.min\|\|value>item\.max/);assert.match(app,/class="range-number"[^>]+type="number"/);assert.match(app,/PNG2ANSI\.validateWorkload\(config,currentCodes\(\)\.length,maxWorkUnits\)/);
});

test("compact ANSI themes and explicit work-limit override ship",()=>{
  for(const theme of ["industrial-chase","magical-forest","spectral-gremlin","cyber-fab","basic-bios"]){assert.match(html,new RegExp(`value="${theme}"`));assert.match(css,new RegExp(`data-theme="${theme}"`));}
  assert.match(css,/font-family:PNG2ANSI/);assert.match(css,/\.number-field input\{width:7\.2ch/);assert.match(html,/id="max-work-units"/);assert.match(html,/id="override-go"[^>]+>GO \/ OVERRIDE</);
  assert.match(css,/\.override-go\{[^}]+background:#b50000!important/);assert.match(app,/schedule\("RED GO · ",true\)/);assert.match(app,/overrideWorkLimit:override/);assert.match(worker,/\{maxWorkUnits,overrideWorkLimit\}/);
});

test("side-by-side spacing, console reflow, editable values, and bundled sample ship",()=>{
  assert.match(css,/\.workbench\{[^}]+gap:0\}/);assert.match(css,/\.source-panel\{padding-right:4px\}\.output-panel\{padding-left:4px\}/);assert.match(css,/\.source-panel \.stage:not\(\.empty\)\{justify-content:flex-end\}\.output-panel \.stage:not\(\.empty\)\{justify-content:flex-start\}/);assert.match(css,/\.output-panel \.stage:not\(\.empty\) img\{position:absolute;left:0;top:50%;transform:translateY\(-50%\);margin:0;object-position:left center\}/);assert.match(css,/\.field label\{[^}]+text-transform:uppercase[^}]+font-weight:700/);
  assert.ok(html.indexOf("Conversion console")<html.indexOf("id=\"workload-estimate\""));assert.ok(html.indexOf("id=\"workload-estimate\"")<html.indexOf("Import profile"));
  assert.match(html,/id="reference-files"[^>]+title="Add local ANSI references/);assert.doesNotMatch(html,/class="reference-drop"/);assert.match(html,/id="load-sample"/);
  assert.ok(sample.length>400000);assert.ok(html.includes(sample.toString("base64").slice(0,160)));assert.doesNotMatch(html,/\/\*__SAMPLE_IMAGE__\*\//);
});

test("header and console preserve ANSI detail at reduced vertical density",()=>{
  assert.match(css,/\.masthead\{height:41px/);assert.match(css,/\.brand>div\{display:flex;align-items:baseline/);assert.match(css,/\.brand-mark\{[^}]+width:33px;height:33px/);assert.match(css,/\.theme-control select\{[^}]+margin:4px 0/);
  assert.doesNotMatch(html,/<h3>Basic<\/h3>/);assert.match(css,/\.panel-head\{min-height:27px;margin-bottom:2px\}/);assert.match(css,/\.control-deck\{margin-top:4px;padding:4px\}/);
});

test("visible workflow, schema-v2 preprocessing, guidance, and help ship",()=>{
  for(const label of ["Source raster","ANSI preview","Conversion console","LOAD SAMPLE","Download .ANS","Export profile","Advanced parameters","Enable Derez","Enable NL Filter","LOAD ESTIMATE","SAFE 12×8","Offline help · quickstart"])assert.ok(html.includes(label),label);
  for(const field of ["derez.enabled","derez.width","nl_filter.enabled","nl_filter.mode","foreground_candidates","background_candidates","structure_blur","texture_blur","edge_threshold","texture_threshold","highlight_threshold","accent_luminance_scale","sparsity_range","saturation_range"])assert.ok(html.includes(field),field);
  assert.match(html,/PNG2ANSI-web v0\.4\.0/);assert.doesNotMatch(html,/\/\*__QUICKSTART__\*\//);
});

test("quickstart length and parameter documentation meet the release contract",()=>{
  const words=quickstart.trim().split(/\s+/).length;assert.ok(words>=380&&words<=430,`quickstart has ${words} words`);
  for(const name of ["canvas.columns","canvas.rows","image.brightness","fit.foreground_candidates","fit.background_candidates","derez.enabled","derez.width","derez.height","nl_filter.enabled","nl_filter.mode","nl_filter.radius","nl_filter.alpha","industrial.edge_weight","industrial.saturation_range"])assert.ok(parameters.includes(`\`${name}\``),name);
  const parsed=JSON.parse(schema);assert.equal(parsed.properties.schema_version.const,2);assert.equal(parsed.$defs.fit.properties.foreground_candidates.maximum,12);assert.equal(parsed.$defs.fit.properties.background_candidates.maximum,8);
});
