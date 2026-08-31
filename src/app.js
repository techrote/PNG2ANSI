"use strict";
const WORKER_SOURCE = /*__WORKER_SOURCE__*/"";
const $ = selector => document.querySelector(selector);
let worker = null;
let config = PNG2ANSI.configFrom(), sourceFile = null, sourceUrl = null, resultUrls = [], refs = [], job = 0, timer = 0, lastResult = null;

const basic = [
  {path:"style",label:"Style",type:"select",options:["photographic","industrial"]},
  {path:"vocabulary",label:"Vocabulary",type:"select",options:Object.keys(PNG2ANSI.vocabularies())},
  {path:"canvas.columns",label:"Columns",min:16,max:512,step:1},
  {path:"canvas.rows",label:"Rows",min:8,max:512,step:1},
  {path:"image.brightness",label:"Brightness",min:0,max:4,step:.01,range:true},
  {path:"image.contrast",label:"Contrast",min:0,max:4,step:.01,range:true},
  {path:"image.saturation",label:"Saturation",min:0,max:4,step:.01,range:true},
  {path:"image.gamma",label:"Gamma",min:.1,max:4,step:.01,range:true},
  {path:"image.sharpness",label:"Sharpness",min:0,max:4,step:.01,range:true},
  {path:"industrial.sparsity_threshold",label:"Sparsity",min:0,max:.99,step:.01,range:true}
];
const advanced = [
  {path:"canvas.cell_width",label:"Cell width",min:4,max:32,step:1},{path:"canvas.cell_height",label:"Cell height",min:8,max:64,step:1},
  {path:"canvas.sample_width",label:"Sample width",min:1,max:16,step:1},{path:"canvas.sample_height",label:"Sample height",min:1,max:32,step:1},
  {path:"canvas.font_size",label:"Font size",min:4,max:64,step:1},{path:"canvas.resampler",label:"Resampler",type:"select",options:["nearest","bilinear","bicubic","lanczos"]},
  {path:"fit.foreground_candidates",label:"Foreground candidates",min:1,max:16,step:1},{path:"fit.background_candidates",label:"Background candidates",min:1,max:8,step:1},
  {path:"industrial.structure_blur",label:"Structure blur",min:0,max:8,step:.01},{path:"industrial.texture_blur",label:"Texture blur",min:0,max:12,step:.01},
  {path:"industrial.edge_threshold",label:"Edge threshold",min:0,max:255,step:.1},{path:"industrial.edge_range",label:"Edge range",min:.001,max:255,step:.1},
  {path:"industrial.texture_threshold",label:"Texture threshold",min:0,max:255,step:.1},{path:"industrial.texture_range",label:"Texture range",min:.001,max:255,step:.1},
  {path:"industrial.highlight_threshold",label:"Highlight threshold",min:0,max:255,step:.1},{path:"industrial.highlight_range",label:"Highlight range",min:.001,max:255,step:.1},
  {path:"industrial.highlight_exponent",label:"Highlight exponent",min:.1,max:8,step:.01},{path:"industrial.accent_luminance_scale",label:"Accent luminance",min:1,max:255,step:.1},
  {path:"industrial.edge_weight",label:"Edge weight",min:0,max:4,step:.01},{path:"industrial.texture_weight",label:"Texture weight",min:0,max:4,step:.01},
  {path:"industrial.highlight_weight",label:"Highlight weight",min:0,max:4,step:.01},{path:"industrial.accent_weight",label:"Accent weight",min:0,max:4,step:.01},
  {path:"industrial.sparsity_range",label:"Sparsity range",min:.001,max:1,step:.001},{path:"industrial.ink_exponent",label:"Ink exponent",min:.1,max:8,step:.01},
  {path:"industrial.saturation_threshold",label:"Saturation threshold",min:0,max:1,step:.01},{path:"industrial.saturation_range",label:"Saturation range",min:.001,max:1,step:.001}
];
const getPath = path => path.split(".").reduce((value,key)=>value[key],config);
const setPath = (path,value) => { const bits=path.split("."), key=bits.pop(), parent=bits.reduce((v,k)=>v[k],config); parent[key]=value; PNG2ANSI.validateConfig(config); };
const escapeHtml = text => String(text).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

function controlMarkup(item) {
  const value=getPath(item.path),id=`field-${item.path.replaceAll(".","-")}`;
  if(item.type==="select") return `<div class="field"><label for="${id}">${item.label}</label><select id="${id}" data-path="${item.path}">${item.options.map(v=>`<option${v===value?" selected":""}>${v}</option>`).join("")}</select></div>`;
  return `<div class="field"><label for="${id}"><span>${item.label}</span><output>${value}</output></label><input id="${id}" data-path="${item.path}" type="${item.range?"range":"number"}" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}"></div>`;
}
function renderControls() {
  $("#basic-controls").innerHTML=basic.map(controlMarkup).join(""); $("#advanced-controls").innerHTML=advanced.map(controlMarkup).join("");
  document.querySelectorAll("[data-path]").forEach(input=>input.addEventListener("input",()=>{
    try { const item=[...basic,...advanced].find(x=>x.path===input.dataset.path),value=item.type==="select"?input.value:Number(input.value);setPath(input.dataset.path,value);const output=input.parentElement.querySelector("output");if(output)output.value=value;updateVocabulary();schedule(); }
    catch(error){setStatus(error.message,"error");}
  })); updateVocabulary();
}
function currentCodes(){return refs.length?PNG2ANSI.referenceVocabulary(refs.map(ref=>ref.bytes)):PNG2ANSI.vocabularies()[config.vocabulary];}
function updateVocabulary(){const codes=currentCodes();$("#glyph-strip").textContent=PNG2ANSI.glyphStrip(codes);$("#glyph-count").textContent=`${codes.length} source glyphs${refs.length?" · references override preset":""}`;}
function setStatus(text,kind=""){$("#status").textContent=text;$("#status-dot").className=`status-dot ${kind}`;}
function stopWorker(){if(worker){worker.terminate();worker=null;}}
function makeWorker(id){
  const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:"text/javascript"})),instance=new Worker(url);URL.revokeObjectURL(url);
  instance.onmessage=handleWorkerMessage;
  instance.onerror=event=>{if(id!==job)return;stopWorker();setStatus(`Conversion worker stopped: ${event.message||"unknown error"}`,"error");$("#progress").style.width="0";};
  return instance;
}
function schedule(){
  clearTimeout(timer);if(!sourceFile)return;
  const id=++job;stopWorker();lastResult=null;toggleDownloads(false);setStatus("Queued latest settings…","busy");$("#progress").style.width="1%";
  timer=setTimeout(()=>convert(id),240);
}
async function convert(id){
  if(id!==job)return;setStatus("Preparing worker…","busy");$("#progress").style.width="2%";
  try{
    const bitmap=await createImageBitmap(sourceFile);
    if(id!==job){bitmap.close();return;}
    worker=makeWorker(id);worker.postMessage({id,bitmap,config:PNG2ANSI.clone(config),codes:currentCodes()},[bitmap]);
  }catch(error){if(id===job){stopWorker();setStatus(error.message,"error");$("#progress").style.width="0";}}
}
function handleWorkerMessage(event){
  const message=event.data;if(message.id!==job)return;
  if(message.type==="progress"){$("#progress").style.width=`${5+Math.round(message.value*88)}%`;setStatus(`Fitting cells · ${Math.round(message.value*100)}%`,"busy");return;}
  if(message.type==="error"){stopWorker();setStatus(message.message,"error");$("#progress").style.width="0";return;}
  stopWorker();
  resultUrls.forEach(URL.revokeObjectURL);resultUrls=[];const ansiBlob=new Blob([message.ansi],{type:"application/octet-stream"}),pngBlob=new Blob([message.png],{type:"image/png"}),previewUrl=URL.createObjectURL(pngBlob);resultUrls.push(previewUrl);$("#ansi-preview").src=previewUrl;$("#output-stage").classList.remove("empty");$("#progress").style.width="100%";setStatus(`${config.canvas.columns}×${config.canvas.rows} · ${message.glyphCount} masks`,"ready");lastResult={ansiBlob,pngBlob};toggleDownloads(true);window.__PNG2ANSI_TEST__.completed=(window.__PNG2ANSI_TEST__.completed||0)+1;
}
function toggleDownloads(enabled){$("#download-ansi").disabled=!enabled;$("#download-png").disabled=!enabled;}
function stem(name){return name.replace(/\.[^.]+$/i,"").toLowerCase();}
async function loadSource(file){if(!file)return;sourceFile=file;if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);$("#source-preview").src=sourceUrl;$("#source-stage").classList.remove("empty");try{const bitmap=await createImageBitmap(file);$("#source-meta").firstElementChild.textContent=`${file.name} · ${bitmap.width}×${bitmap.height}`;bitmap.close();schedule();}catch(error){setStatus(`Image error: ${error.message}`,"error");}}
async function loadReferences(files){
  const all=[...files],ans=all.filter(file=>/\.ans$/i.test(file.name)),pngs=all.filter(file=>file.type==="image/png"||/\.png$/i.test(file.name));
  for(const file of ans){const match=pngs.find(png=>stem(png.name)===stem(file.name));refs.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),preview:match?URL.createObjectURL(match):null});}
  renderReferences();updateVocabulary();schedule();
}
function renderReferences(){const host=$("#reference-cards");host.innerHTML=refs.map(ref=>`<article class="ref-card">${ref.preview?`<img src="${ref.preview}" alt="">`:"<span class=terminal-glyph>≡</span>"}<div><strong title="${escapeHtml(ref.name)}">${escapeHtml(ref.name)}</strong><small>${ref.bytes.length.toLocaleString()} bytes</small></div></article>`).join("");$("#clear-references").hidden=!refs.length;}
function clearReferences(){refs.forEach(ref=>ref.preview&&URL.revokeObjectURL(ref.preview));refs=[];renderReferences();updateVocabulary();schedule();}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function basename(){return (sourceFile?.name||"conversion").replace(/\.[^.]+$/,"");}

$("#source-file").addEventListener("change",event=>loadSource(event.target.files[0]));
$("#source-stage").addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="copy"});
$("#source-stage").addEventListener("drop",event=>{event.preventDefault();loadSource([...event.dataTransfer.files].find(file=>file.type.startsWith("image/")))});
$("#reference-files").addEventListener("change",event=>loadReferences(event.target.files));$("#clear-references").addEventListener("click",clearReferences);
$("#download-ansi").addEventListener("click",()=>download(lastResult.ansiBlob,`${basename()}.ans`));$("#download-png").addEventListener("click",()=>download(lastResult.pngBlob,`${basename()}.ans.png`));
$("#download-config").addEventListener("click",()=>download(new Blob([JSON.stringify(config,null,2)+"\n"],{type:"application/json"}),`${basename()}.png2ansi.json`));
$("#config-file").addEventListener("change",async event=>{try{config=PNG2ANSI.configFrom(JSON.parse(await event.target.files[0].text()));renderControls();schedule();setStatus("Profile imported",sourceFile?"busy":"ready");}catch(error){setStatus(`Profile error: ${error.message}`,"error");}});
$("#reset-config").addEventListener("click",()=>{config=PNG2ANSI.configFrom();renderControls();schedule();});
renderControls();
window.__PNG2ANSI_TEST__={offline:true,version:"0.1.1",defaults:PNG2ANSI.clone(PNG2ANSI.DEFAULTS),get config(){return PNG2ANSI.clone(config)},get references(){return refs.length},get job(){return job},completed:0};
