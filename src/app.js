"use strict";
const WORKER_SOURCE = /*__WORKER_SOURCE__*/"";
const SAMPLE_IMAGE_BASE64 = /*__SAMPLE_IMAGE__*/"";
const $ = selector => document.querySelector(selector);
let worker=null,config=PNG2ANSI.configFrom(),sourceFile=null,sourceUrl=null,resultUrls=[],refs=[],job=0,timer=0,lastResult=null,maxWorkUnits=PNG2ANSI.MAX_WORK_UNITS,forcedJob=0;
const workerStats={created:0,terminated:0,active:0,maxActive:0,started:0,completed:0};

const basic=[
  {path:"style",label:"Style",type:"select",options:["photographic","industrial"]},
  {path:"vocabulary",label:"Vocabulary",type:"select",options:Object.keys(PNG2ANSI.vocabularies())},
  {path:"canvas.columns",label:"Columns",min:16,max:512,step:1,integer:true},
  {path:"canvas.rows",label:"Rows",min:8,max:512,step:1,integer:true},
  {path:"image.brightness",label:"Brightness",min:0,max:4,step:.01,range:true},
  {path:"image.contrast",label:"Contrast",min:0,max:4,step:.01,range:true},
  {path:"image.saturation",label:"Saturation",min:0,max:4,step:.01,range:true},
  {path:"image.gamma",label:"Gamma",min:.1,max:4,step:.01,range:true},
  {path:"image.sharpness",label:"Sharpness",min:0,max:4,step:.01,range:true},
  {path:"nl_filter.enabled",label:"Enable NL Filter",type:"checkbox",hint:"Runs before tonal controls; enabled by default."},
  {path:"nl_filter.mode",label:"NL mode",type:"select",options:["alpha-trimmed-mean","optimal-estimation","edge-enhancement"]},
  {path:"nl_filter.radius",label:"NL radius",min:.33,max:1,step:.01,hint:"0.33–1.00; controls the seven-sample neighbourhood reach."},
  {path:"nl_filter.alpha",label:"NL alpha",min:0,max:1,step:.01,hint:"Mode-dependent strength; default 0.90."},
  {path:"industrial.sparsity_threshold",label:"Sparsity",min:0,max:.99,step:.01,range:true}
];
const advanced=[
  {path:"derez.enabled",label:"Enable Derez",type:"checkbox",hint:"Exact intermediate resize; never enlarges past the source."},
  {path:"derez.width",label:"Derez width",min:16,max:2048,step:1,integer:true,hint:"16–2048 px; width × height ≤ 4,194,304."},
  {path:"derez.height",label:"Derez height",min:16,max:2048,step:1,integer:true,hint:"May intentionally change source aspect ratio."},
  {path:"canvas.cell_width",label:"Cell width",min:4,max:32,step:1,integer:true},{path:"canvas.cell_height",label:"Cell height",min:8,max:64,step:1,integer:true},
  {path:"canvas.sample_width",label:"Sample width",min:1,max:16,step:1,integer:true},{path:"canvas.sample_height",label:"Sample height",min:1,max:32,step:1,integer:true},
  {path:"canvas.font_size",label:"Font size",min:4,max:64,step:1,integer:true},{path:"canvas.resampler",label:"Resampler",type:"select",options:["nearest","bilinear","bicubic","lanczos"]},
  {path:"fit.foreground_candidates",label:"Foreground candidates",min:1,max:12,step:1,integer:true,hint:"Safe range 1–12; more colours increase fitting work."},
  {path:"fit.background_candidates",label:"Background candidates",min:1,max:8,step:1,integer:true,hint:"Safe range 1–8; classic ANSI has eight backgrounds."},
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
const controls=[...basic,...advanced];
const THEMES=["industrial-chase","magical-forest","spectral-gremlin","cyber-fab","basic-bios"];
const getPath=(path,target=config)=>path.split(".").reduce((value,key)=>value[key],target);
function assignPath(target,path,value){const bits=path.split("."),key=bits.pop(),parent=bits.reduce((current,part)=>current[part],target);parent[key]=value;}
const escapeHtml=text=>String(text).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));

function controlMarkup(item){
  const value=getPath(item.path),id=`field-${item.path.replaceAll(".","-")}`,title=item.hint?` title="${escapeHtml(item.hint)}"`:"";
  if(item.type==="select")return `<div class="field select-field"${title}><label for="${id}">${item.label}</label><select id="${id}" data-path="${item.path}">${item.options.map(option=>`<option${option===value?" selected":""}>${option}</option>`).join("")}</select></div>`;
  if(item.type==="checkbox")return `<div class="field checkbox-field"${title}><label for="${id}"><span>${item.label}</span><input id="${id}" data-path="${item.path}" type="checkbox"${value?" checked":""}></label></div>`;
  if(item.range)return `<div class="field range-field"${title}><label for="${id}">${item.label}</label><div class="range-edit"><input id="${id}" data-path="${item.path}" type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}"><input id="${id}-value" class="range-number" data-path="${item.path}" aria-label="${item.label} value" type="number" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}"></div></div>`;
  return `<div class="field number-field"${title}><label for="${id}">${item.label}</label><input id="${id}" data-path="${item.path}" type="number" min="${item.min}" max="${item.max}" step="${item.step}" value="${value}"></div>`;
}
function readControl(input,item){
  if(item.type==="select")return{value:input.value,clamped:false};
  if(item.type==="checkbox")return{value:input.checked,clamped:false};
  const parsed=Number(input.value);if(!Number.isFinite(parsed))throw new Error(`${item.label} must be a number`);
  let value=Math.max(item.min,Math.min(item.max,parsed));if(item.integer)value=Math.round(value);
  return{value,clamped:value!==parsed};
}
function syncControl(input,item,value){const peers=input.closest(".field")?.querySelectorAll("[data-path]")||[input];for(const peer of peers){if(peer.dataset.path!==item.path)continue;if(item.type==="checkbox")peer.checked=value;else peer.value=value;}}
function commitControl(input,item){
  const previous=getPath(item.path);let read;
  try{read=readControl(input,item);if(Object.is(previous,read.value)){syncControl(input,item,previous);return;}const candidate=PNG2ANSI.clone(config);assignPath(candidate,item.path,read.value);PNG2ANSI.validateConfig(candidate);config=candidate;syncControl(input,item,read.value);updateVocabulary();updateGuidance();schedule(read.clamped?`${item.label} limited to ${read.value}. `:"");}
  catch(error){syncControl(input,item,previous);setStatus(`${item.label}: ${error.message}` ,"error");}
}
function renderControls(){
  $("#basic-controls").innerHTML=basic.map(controlMarkup).join("");$("#advanced-controls").innerHTML=advanced.map(controlMarkup).join("");
  document.querySelectorAll("[data-path]").forEach(input=>{const item=controls.find(control=>control.path===input.dataset.path),isSlider=input.type==="range",event=isSlider?"input":"change";input.addEventListener(event,()=>commitControl(input,item));if(!isSlider&&item.type!=="select"&&item.type!=="checkbox"){input.addEventListener("blur",()=>commitControl(input,item));input.addEventListener("keydown",event=>{if(event.key==="Enter")commitControl(input,item);});input.addEventListener("input",()=>{const value=Number(input.value);if(input.value!==""&&Number.isFinite(value)&&(value<item.min||value>item.max))commitControl(input,item);});}});
  updateVocabulary();updateGuidance();
}
function currentCodes(){return refs.length?PNG2ANSI.referenceVocabulary(refs.map(ref=>ref.bytes)):PNG2ANSI.vocabularies()[config.vocabulary];}
function workloadText(units){return `${(units/1000000).toFixed(1)}M / ${(maxWorkUnits/1000000).toFixed(maxWorkUnits<10000000?1:0)}M work units`;}
function updateWorkload(){const units=PNG2ANSI.workloadUnits(config,currentCodes().length),host=$("#workload-estimate"),over=units>maxWorkUnits;host.textContent=workloadText(units);host.classList.toggle("over-budget",over);$("#override-go").classList.toggle("required",over);return units;}
function updateVocabulary(){const codes=currentCodes();$("#glyph-strip").textContent=PNG2ANSI.glyphStrip(codes);$("#glyph-count").textContent=`${codes.length} source glyphs${refs.length?" · references override preset":""}`;updateWorkload();}
function updateGuidance(){
  $("#derez-guidance").textContent=config.derez.enabled?`Derez ${config.derez.width}×${config.derez.height}; each dimension is capped at the source size.`:"Derez off; source proceeds at the normal sampling stage.";
  const mode=config.nl_filter.mode,guidance=mode==="alpha-trimmed-mean"?"Alpha trims high and low outliers; useful for impulse noise.":mode==="optimal-estimation"?"Alpha estimates noise strength; useful for general smoothing.":"Alpha boosts the centre against its local mean; watch for halos.";
  $("#nl-guidance").textContent=config.nl_filter.enabled?`${mode}, radius ${config.nl_filter.radius}, alpha ${config.nl_filter.alpha}. ${guidance}`:`NL Filter off. ${guidance}`;
}
function setStatus(text,kind=""){$("#status").textContent=text;$("#status-dot").className=`status-dot ${kind}`;}
function publishWorkerHealth(){const host=$("#worker-health");host.textContent=workerStats.active?"worker running":"worker idle";for(const [key,value] of Object.entries(workerStats))host.dataset[key]=value;}
function stopWorker(){if(worker){worker.terminate();worker=null;workerStats.terminated++;workerStats.active=0;publishWorkerHealth();}}
function makeWorker(id){
  const url=URL.createObjectURL(new Blob([WORKER_SOURCE],{type:"text/javascript"})),instance=new Worker(url);URL.revokeObjectURL(url);workerStats.created++;workerStats.active=1;workerStats.maxActive=Math.max(workerStats.maxActive,workerStats.active);publishWorkerHealth();
  instance.onmessage=handleWorkerMessage;instance.onerror=event=>{if(id!==job)return;stopWorker();setStatus(`Conversion worker stopped: ${event.message||"unknown error"}`,"error");$("#progress").style.width="0";};return instance;
}
function schedule(notice="",override=false){
  clearTimeout(timer);if(!sourceFile)return;
  const id=++job;forcedJob=override?id:0;stopWorker();lastResult=null;toggleDownloads(false);$("#progress").style.width="1%";
  if(!override)try{PNG2ANSI.validateWorkload(config,currentCodes().length,maxWorkUnits);}catch(error){setStatus(error.message,"error");$("#progress").style.width="0";return;}
  setStatus(override?`${notice}Work-limit override armed — processing regardless of estimate…`:`${notice}Queued latest settings…`,override?"override":"busy");timer=setTimeout(()=>convert(id,override),240);
}
async function convert(id,override=false){
  if(id!==job)return;setStatus(override?"Override active · preparing worker…":"Preparing worker…",override?"override":"busy");$("#progress").style.width="2%";
  try{const bitmap=await createImageBitmap(sourceFile);if(id!==job){bitmap.close();return;}worker=makeWorker(id);workerStats.started++;worker.postMessage({id,bitmap,config:PNG2ANSI.clone(config),codes:currentCodes(),maxWorkUnits,overrideWorkLimit:override},[bitmap]);}
  catch(error){if(id===job){stopWorker();setStatus(error.message,"error");$("#progress").style.width="0";}}
}
function handleWorkerMessage(event){
  const message=event.data;if(message.id!==job)return;
  if(message.type==="progress"){$("#progress").style.width=`${5+Math.round(message.value*88)}%`;setStatus(`${message.id===forcedJob?"OVERRIDE · ":""}Fitting cells · ${Math.round(message.value*100)}%`,message.id===forcedJob?"override":"busy");return;}
  if(message.type==="error"){stopWorker();setStatus(message.message,"error");$("#progress").style.width="0";return;}
  stopWorker();resultUrls.forEach(URL.revokeObjectURL);resultUrls=[];const ansiBlob=new Blob([message.ansi],{type:"application/octet-stream"}),pngBlob=new Blob([message.png],{type:"image/png"}),previewUrl=URL.createObjectURL(pngBlob),wasForced=message.id===forcedJob;resultUrls.push(previewUrl);$("#ansi-preview").src=previewUrl;$("#output-stage").classList.remove("empty");$("#progress").style.width="100%";setStatus(`${wasForced?"OVERRIDE complete · ":""}${config.canvas.columns}×${config.canvas.rows} · ${message.glyphCount} masks · ${workloadText(message.workUnits)}`,"ready");lastResult={ansiBlob,pngBlob};toggleDownloads(true);workerStats.completed++;publishWorkerHealth();
}
function toggleDownloads(enabled){$("#download-ansi").disabled=!enabled;$("#download-png").disabled=!enabled;}
function stem(name){return name.replace(/\.[^.]+$/i,"").toLowerCase();}
async function loadSource(file){if(!file)return;sourceFile=file;$("#override-go").disabled=false;if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(file);$("#source-preview").src=sourceUrl;$("#source-stage").classList.remove("empty");try{const bitmap=await createImageBitmap(file);$("#source-meta").firstElementChild.textContent=`${file.name} · ${bitmap.width}×${bitmap.height}`;bitmap.close();schedule();}catch(error){setStatus(`Image error: ${error.message}`,"error");}}
async function loadReferences(files){const all=[...files],ans=all.filter(file=>/\.ans$/i.test(file.name)),pngs=all.filter(file=>file.type==="image/png"||/\.png$/i.test(file.name));for(const file of ans){const match=pngs.find(png=>stem(png.name)===stem(file.name));refs.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer()),preview:match?URL.createObjectURL(match):null});}renderReferences();updateVocabulary();schedule();}
function renderReferences(){const host=$("#reference-cards");host.innerHTML=refs.map(ref=>`<article class="ref-card">${ref.preview?`<img src="${ref.preview}" alt="">`:"<span class=terminal-glyph>≡</span>"}<div><strong title="${escapeHtml(ref.name)}">${escapeHtml(ref.name)}</strong><small>${ref.bytes.length.toLocaleString()} bytes</small></div></article>`).join("");$("#clear-references").hidden=!refs.length;}
function clearReferences(){refs.forEach(ref=>ref.preview&&URL.revokeObjectURL(ref.preview));refs=[];renderReferences();updateVocabulary();schedule();}
function download(blob,name){const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function basename(){return(sourceFile?.name||"conversion").replace(/\.[^.]+$/,"");}
function bundledSampleFile(){const raw=atob(SAMPLE_IMAGE_BASE64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],"panel_box_cyberpunk_machinery_6LKC6GX0.png",{type:"image/png"});}
function applyTheme(value){const theme=THEMES.includes(value)?value:"cyber-fab";document.documentElement.dataset.theme=theme;$("#theme-select").value=theme;try{localStorage.setItem("png2ansi-theme",theme);}catch{}return theme;}
function commitMaxWorkUnits(){
  const input=$("#max-work-units"),parsed=Number(input.value),previous=maxWorkUnits;
  if(!Number.isFinite(parsed)||parsed<1){input.value=previous;setStatus("Max work units must be a positive number","error");return;}
  const next=Math.min(Number.MAX_SAFE_INTEGER,Math.max(1,Math.round(parsed)));input.value=next;if(next===previous){updateWorkload();return;}maxWorkUnits=next;try{localStorage.setItem("png2ansi-max-work-units",String(maxWorkUnits));}catch{}updateWorkload();if(sourceFile)schedule("Work ceiling updated. ");
}

$("#source-file").addEventListener("change",event=>loadSource(event.target.files[0]));
$("#load-sample").addEventListener("click",()=>loadSource(bundledSampleFile()));
$("#source-stage").addEventListener("dragover",event=>{event.preventDefault();event.dataTransfer.dropEffect="copy";});
$("#source-stage").addEventListener("drop",event=>{event.preventDefault();loadSource([...event.dataTransfer.files].find(file=>file.type.startsWith("image/")));});
$("#reference-files").addEventListener("change",event=>loadReferences(event.target.files));$("#clear-references").addEventListener("click",clearReferences);
$("#download-ansi").addEventListener("click",()=>download(lastResult.ansiBlob,`${basename()}.ans`));$("#download-png").addEventListener("click",()=>download(lastResult.pngBlob,`${basename()}.ans.png`));
$("#download-config").addEventListener("click",()=>download(new Blob([JSON.stringify(config,null,2)+"\n"],{type:"application/json"}),`${basename()}.png2ansi.json`));
$("#config-file").addEventListener("change",async event=>{try{config=PNG2ANSI.configFrom(JSON.parse(await event.target.files[0].text()));renderControls();if(sourceFile)schedule("Profile imported. ");else setStatus("Profile imported","ready");}catch(error){setStatus(`Profile error: ${error.message}`,"error");}});
$("#reset-config").addEventListener("click",()=>{config=PNG2ANSI.configFrom();renderControls();schedule();});
$("#safe-max-candidates").addEventListener("click",()=>{const candidate=PNG2ANSI.clone(config);candidate.fit.foreground_candidates=12;candidate.fit.background_candidates=8;PNG2ANSI.validateConfig(candidate);config=candidate;renderControls();schedule("Candidates set to the safe 12×8 maximum. ");});
$("#override-go").addEventListener("click",()=>schedule("RED GO · ",true));
$("#max-work-units").addEventListener("change",commitMaxWorkUnits);$("#max-work-units").addEventListener("blur",commitMaxWorkUnits);$("#max-work-units").addEventListener("keydown",event=>{if(event.key==="Enter")commitMaxWorkUnits();});
$("#theme-select").addEventListener("change",event=>applyTheme(event.target.value));
let savedTheme="cyber-fab";try{savedTheme=localStorage.getItem("png2ansi-theme")||savedTheme;}catch{}applyTheme(savedTheme);
try{const savedMax=Number(localStorage.getItem("png2ansi-max-work-units"));if(Number.isSafeInteger(savedMax)&&savedMax>0)maxWorkUnits=savedMax;}catch{}$("#max-work-units").value=maxWorkUnits;
renderControls();publishWorkerHealth();
window.__PNG2ANSI_TEST__={offline:true,version:"0.4.0",defaults:PNG2ANSI.clone(PNG2ANSI.DEFAULTS),loadSource,bundledSampleFile,schedule,applyTheme,get theme(){return document.documentElement.dataset.theme;},get maxWorkUnits(){return maxWorkUnits;},get config(){return PNG2ANSI.clone(config);},get references(){return refs.length;},get job(){return job;},get workerStats(){return{...workerStats};}};
