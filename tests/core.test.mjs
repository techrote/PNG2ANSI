import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source=await readFile(new URL("../src/core.js",import.meta.url),"utf8");
const context={console};context.globalThis=context;vm.runInNewContext(source,context,{filename:"core.js"});
const api=context.PNG2ANSI;
const plain=value=>JSON.parse(JSON.stringify(value));

test("schema v2 defaults match the Python reference contract",()=>{
  const value=api.configFrom();
  assert.equal(value.schema_version,2);assert.equal(value.canvas.columns,80);assert.equal(value.canvas.rows,40);
  assert.deepEqual(plain(value.canvas),{columns:80,rows:40,cell_width:8,cell_height:16,sample_width:4,sample_height:8,font_size:14,resampler:"lanczos"});
  assert.deepEqual(plain(value.fit),{foreground_candidates:6,background_candidates:5});
  assert.deepEqual(plain(value.derez),{enabled:false,width:160,height:160});
  assert.deepEqual(plain(value.nl_filter),{enabled:false,mode:"edge-enhancement",radius:1,alpha:.9});
  assert.equal(value.image.sharpness,1.18);assert.equal(value.industrial.accent_weight,.70);
});

test("v1 profiles migrate while strict nested validation remains transactional",()=>{
  const value=api.configFrom({schema_version:1,canvas:{columns:96},image:{gamma:1.4},fit:{background_candidates:4}});
  assert.equal(value.schema_version,2);assert.equal(value.canvas.columns,96);assert.equal(value.canvas.rows,40);assert.equal(value.image.gamma,1.4);assert.equal(value.fit.background_candidates,4);assert.equal(value.derez.enabled,false);
  assert.throws(()=>api.configFrom({canvas:{mystery:1}}),/unknown configuration key/);
  assert.throws(()=>api.configFrom({canvas:{columns:4}}),/columns/);
  assert.throws(()=>api.configFrom({fit:{background_candidates:12}}),/background_candidates/);
  assert.doesNotThrow(()=>api.configFrom({derez:{width:2048,height:2048},canvas:{columns:80}}));
  assert.throws(()=>api.configFrom({industrial:{sparsity_range:0}}),/sparsity_range/);
});

test("candidate ranges and deterministic workload ceiling are safe",()=>{
  const value=api.configFrom(),glyphs=218,oldBaseline=80*40*(glyphs*(4*8*3+12)+glyphs*3*3*3);
  assert.ok(api.workloadUnits(value,glyphs)<=oldBaseline);
  const maximum=api.configFrom({fit:{foreground_candidates:12,background_candidates:8}});
  assert.ok(api.workloadUnits(maximum,glyphs)<=oldBaseline*1.5);assert.doesNotThrow(()=>api.validateWorkload(maximum,glyphs));
  const oversized=api.configFrom({canvas:{columns:512,rows:512},fit:{foreground_candidates:12,background_candidates:8}});
  assert.throws(()=>api.validateWorkload(oversized,glyphs),/safe limit.*reduce columns, rows, sample grid, vocabulary size, or colour candidates/i);
  assert.doesNotThrow(()=>api.validateWorkload(api.configFrom({canvas:{columns:32,rows:16}}),glyphs));
});

test("all five vocabularies are CP437 byte codes",()=>{
  const sets=api.vocabularies();assert.deepEqual(Object.keys(sets),["full-cp437","ascii","box-block","industrial-sparse","industrial-dense"]);assert.equal(sets["full-cp437"].length,224);assert.equal(sets.ascii.length,95);
  for(const values of Object.values(sets))for(const code of values)assert.ok(code>=32&&code<=255);
});

test("multiple ANSI references make a frequency-ordered union",()=>{
  const esc=27,values=api.referenceVocabulary([new Uint8Array([esc,91,51,49,109,65,65,65,176]),new Uint8Array([esc,91,51,54,109,66,66,178])]);
  assert.equal(values[0],32);assert.ok(values.indexOf(65)<values.indexOf(66));assert.ok(values.includes(176));assert.ok(values.includes(178));
});

test("all NL modes match Python deterministic pixel fixtures",()=>{
  const rgba=new Uint8ClampedArray(5*5*4);
  for(let y=0;y<5;y++)for(let x=0;x<5;x++){const at=(y*5+x)*4;for(let c=0;c<3;c++)rgba[at+c]=(y*37+x*19+c*53)%256;rgba[at+3]=255;}
  const expected={
    "alpha-trimmed-mean":"853933e64b719850991db0c22321a4e0d1ae07dc8ea24ee3b06f08851df62850",
    "optimal-estimation":"7b239b1f5749d8da368001fc5ce3d2ae4ae73eb61356b5ce18f636578e15b0b5",
    "edge-enhancement":"11671479f051434aea162de35aaadd07e54f1a957dddda6c98746e352ddc162f"
  };
  for(const [mode,hash] of Object.entries(expected)){const filtered=api.nlFilterPixels(rgba,5,5,mode,.8,.6),rgb=[];for(let i=0;i<filtered.length;i+=4)rgb.push(filtered[i],filtered[i+1],filtered[i+2]);assert.equal(createHash("sha256").update(Uint8Array.from(rgb)).digest("hex"),hash,mode);}
  const flat=new Uint8ClampedArray(7*7*4);for(let i=0;i<flat.length;i+=4){flat[i]=flat[i+1]=flat[i+2]=91;flat[i+3]=255;}
  for(const mode of Object.keys(expected))assert.deepEqual(Array.from(api.nlFilterPixels(flat,7,7,mode,1,.9)),Array.from(flat));
});

test("ANSI encoder emits classic SGR, one CP437 cell, reset, and no footer",()=>{
  const bytes=api.ansiBytes({codes:[65]},{chosen:new Uint16Array([0]),fg:new Uint8Array([9]),bg:new Uint8Array([0])},api.configFrom({canvas:{columns:16,rows:8}})),text=Buffer.from(bytes).toString("latin1");
  assert.match(text,/^\x1b\[1;31;40mA\x1b\[0m$/);assert.doesNotMatch(text,/(?:38|48);/);assert.ok(!Buffer.from(bytes).includes(Buffer.from("SAUCE00")));
});
