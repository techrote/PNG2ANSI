(function (scope) {
  "use strict";

  const FONT_BASE64 = "__FONT_BASE64__";
  const CP437 = "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\x7fÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";
  const PALETTE = [
    [12,12,12],[197,15,31],[19,161,14],[193,156,0],[0,55,218],[136,23,152],[58,150,221],[204,204,204],
    [118,118,118],[231,72,86],[22,198,12],[249,241,165],[59,120,255],[180,0,158],[97,214,214],[242,242,242]
  ];
  const DEFAULTS = {
    schema_version: 1, style: "photographic", vocabulary: "full-cp437",
    canvas: { columns:80, rows:40, cell_width:8, cell_height:16, sample_width:4, sample_height:8, font_size:14, resampler:"lanczos" },
    image: { brightness:1, contrast:1, saturation:1, gamma:1, sharpness:1.18 },
    fit: { foreground_candidates:3, background_candidates:3 },
    industrial: {
      structure_blur:0.85, texture_blur:1.85, edge_threshold:11, edge_range:57,
      texture_threshold:24, texture_range:62, highlight_threshold:138, highlight_range:110,
      highlight_exponent:2.2, accent_luminance_scale:145, edge_weight:0.92,
      texture_weight:0.18, highlight_weight:0.05, accent_weight:0.70,
      sparsity_threshold:0.14, sparsity_range:0.86, ink_exponent:0.92,
      saturation_threshold:0.10, saturation_range:0.34
    }
  };
  const LIMITS = {
    "canvas.columns":[16,512,1], "canvas.rows":[8,512,1], "canvas.cell_width":[4,32,1], "canvas.cell_height":[8,64,1],
    "canvas.sample_width":[1,16,1], "canvas.sample_height":[1,32,1], "canvas.font_size":[4,64,1],
    "image.brightness":[0,4], "image.contrast":[0,4], "image.saturation":[0,4], "image.gamma":[0.1,4], "image.sharpness":[0,4],
    "fit.foreground_candidates":[1,16,1], "fit.background_candidates":[1,8,1],
    "industrial.structure_blur":[0,8], "industrial.texture_blur":[0,12], "industrial.edge_threshold":[0,255],
    "industrial.edge_range":[0.001,255], "industrial.texture_threshold":[0,255], "industrial.texture_range":[0.001,255],
    "industrial.highlight_threshold":[0,255], "industrial.highlight_range":[0.001,255], "industrial.highlight_exponent":[0.1,8],
    "industrial.accent_luminance_scale":[1,255], "industrial.edge_weight":[0,4], "industrial.texture_weight":[0,4],
    "industrial.highlight_weight":[0,4], "industrial.accent_weight":[0,4], "industrial.sparsity_threshold":[0,0.99],
    "industrial.sparsity_range":[0.001,1], "industrial.ink_exponent":[0.1,8], "industrial.saturation_threshold":[0,1],
    "industrial.saturation_range":[0.001,1]
  };
  const SPARSE = " _─═│▐▀~\"▌║▄-∙█╫.=┐/╤j\\≡╞╥≤`├πΓ╡Hⁿ]¬|}'┬■√÷%:┤╨╪Æτ╒╕└┘µ";
  const DENSE = SPARSE + "░▒▓╔╗╚╝╬╦╩╠╣╧╪╫╭╮╯╰≈≥«»⌠⌡φΩΣ₧,![0123456789abcdefghijklnopqrstuvwxyz";
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, low=0, high=1) => Math.max(low, Math.min(high, value));
  const codeOf = char => CP437.indexOf(char);

  function mergeConfig(base, update, path="") {
    if (!update || Array.isArray(update) || typeof update !== "object") throw new Error("configuration root must be an object");
    for (const [key, value] of Object.entries(update)) {
      if (!(key in base)) throw new Error(`unknown configuration key: ${path}${key}`);
      if (base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
        if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${path}${key} must be an object`);
        mergeConfig(base[key], value, `${path}${key}.`);
      } else base[key] = value;
    }
    return base;
  }
  function validateConfig(config) {
    if (config.schema_version !== 1) throw new Error("schema_version must be 1");
    if (!["photographic","industrial"].includes(config.style)) throw new Error("style must be photographic or industrial");
    if (!Object.keys(vocabularies()).includes(config.vocabulary)) throw new Error("unknown vocabulary");
    if (!["nearest","bilinear","bicubic","lanczos"].includes(config.canvas.resampler)) throw new Error("invalid resampler");
    for (const [path, [low, high, integer]] of Object.entries(LIMITS)) {
      const [group,key] = path.split("."); const value = config[group][key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value)))
        throw new Error(`${path} must be ${integer ? "an integer " : ""}between ${low} and ${high}`);
    }
    return config;
  }
  function configFrom(value={}) { return validateConfig(mergeConfig(clone(DEFAULTS), value)); }
  function uniqueCodes(text) {
    const result=[]; for (const char of text) { const code=codeOf(char); if (code >= 0 && !result.includes(code)) result.push(code); } return result;
  }
  function vocabularies() {
    return {
      "full-cp437": Array.from({length:224},(_,i)=>i+32),
      ascii: Array.from({length:95},(_,i)=>i+32),
      "box-block": uniqueCodes(" .,:;+-=/\\_|" + CP437.slice(176,224)),
      "industrial-sparse": uniqueCodes(SPARSE),
      "industrial-dense": uniqueCodes(DENSE)
    };
  }
  function stripSauce(bytes) {
    if (bytes.length < 128) return bytes;
    const tag=String.fromCharCode(...bytes.slice(bytes.length-128,bytes.length-121));
    if (tag !== "SAUCE00") return bytes;
    let end=bytes.length-128, comments=bytes[bytes.length-24];
    if (comments) { const start=end-(5+comments*64); if (start>=0 && String.fromCharCode(...bytes.slice(start,start+5))==="COMNT") end=start; }
    if (end && bytes[end-1]===0x1a) end--;
    return bytes.slice(0,end);
  }
  function referenceVocabulary(inputs) {
    const counts=new Map(), first=new Map(); let order=0;
    for (const input of inputs) {
      const bytes=stripSauce(input); let i=0;
      while (i<bytes.length) {
        if (bytes[i]===27) { i++; if (bytes[i]===91) { i++; while (i<bytes.length && !(bytes[i]>=64&&bytes[i]<=126)) i++; i++; } else i++; continue; }
        const value=bytes[i++]; if (value<32) continue;
        counts.set(value,(counts.get(value)||0)+1); if (!first.has(value)) first.set(value,order++);
      }
    }
    return [32,...[...counts.keys()].filter(v=>v!==32).sort((a,b)=>counts.get(b)-counts.get(a)||first.get(a)-first.get(b))];
  }
  function glyphStrip(codes) { return codes.slice(0,96).map(code=>CP437[code]).join(""); }
  function nearest(color, count, allowed=null) {
    const ids=allowed || PALETTE.map((_,i)=>i);
    return ids.map(i=>[i,(color[0]-PALETTE[i][0])**2+(color[1]-PALETTE[i][1])**2+(color[2]-PALETTE[i][2])**2])
      .sort((a,b)=>a[1]-b[1]).slice(0,count).map(x=>x[0]);
  }

  async function loadFont() {
    if (scope.__png2ansiFont) return scope.__png2ansiFont;
    const raw=atob(FONT_BASE64), bytes=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    const face=new FontFace("PNG2ANSI DejaVu",bytes.buffer); await face.load(); scope.fonts.add(face); scope.__png2ansiFont=face; return face;
  }
  function maskCacheKey(codes,c) { return `${codes.join(",")}|${c.cell_width}x${c.cell_height}|${c.sample_width}x${c.sample_height}|${c.font_size}`; }
  const maskCache=new Map();
  async function glyphMasks(codes, canvas) {
    const key=maskCacheKey(codes,canvas); if(maskCache.has(key)) return maskCache.get(key);
    await loadFont(); const kept=[], hi=[], low=[], signatures=new Set();
    const tile=new OffscreenCanvas(canvas.cell_width,canvas.cell_height), ctx=tile.getContext("2d",{willReadFrequently:true});
    for(const code of codes) {
      ctx.clearRect(0,0,tile.width,tile.height); ctx.fillStyle="#fff"; ctx.font=`${canvas.font_size}px 'PNG2ANSI DejaVu'`; ctx.textBaseline="top";
      const char=CP437[code], metrics=ctx.measureText(char), x=Math.floor((tile.width-metrics.width)/2); ctx.fillText(char,x,0);
      const pixels=ctx.getImageData(0,0,tile.width,tile.height).data, mask=new Float32Array(tile.width*tile.height); let sig="";
      for(let i=0;i<mask.length;i++){mask[i]=pixels[i*4+3]/255; sig+=String.fromCharCode(Math.round(mask[i]*31));}
      if(signatures.has(sig)) continue; signatures.add(sig); kept.push(code); hi.push(mask);
      const sm=new Float32Array(canvas.sample_width*canvas.sample_height);
      for(let sy=0;sy<canvas.sample_height;sy++) for(let sx=0;sx<canvas.sample_width;sx++) {
        const x0=sx*canvas.cell_width/canvas.sample_width,x1=(sx+1)*canvas.cell_width/canvas.sample_width;
        const y0=sy*canvas.cell_height/canvas.sample_height,y1=(sy+1)*canvas.cell_height/canvas.sample_height;
        let sum=0,n=0; for(let y=Math.floor(y0);y<Math.ceil(y1);y++) for(let x2=Math.floor(x0);x2<Math.ceil(x1);x2++){sum+=mask[clamp(y,0,canvas.cell_height-1)*canvas.cell_width+clamp(x2,0,canvas.cell_width-1)];n++;}
        sm[sy*canvas.sample_width+sx]=sum/n;
      }
      low.push(sm);
    }
    const result={codes:kept,hi,low}; maskCache.set(key,result); return result;
  }
  function preprocess(bitmap, config) {
    const c=config.canvas,w=c.columns*c.sample_width,h=c.rows*c.sample_height;
    const cv=new OffscreenCanvas(w,h),ctx=cv.getContext("2d",{willReadFrequently:true});
    ctx.imageSmoothingEnabled=c.resampler!=="nearest"; ctx.imageSmoothingQuality=c.resampler==="lanczos"?"high":c.resampler==="bilinear"?"low":"medium";
    ctx.drawImage(bitmap,0,0,w,h); const data=ctx.getImageData(0,0,w,h),p=data.data,v=config.image;
    for(let i=0;i<p.length;i+=4){let r=p[i]*v.brightness,g=p[i+1]*v.brightness,b=p[i+2]*v.brightness; r=(r-128)*v.contrast+128;g=(g-128)*v.contrast+128;b=(b-128)*v.contrast+128;const y=.2126*r+.7152*g+.0722*b;r=y+(r-y)*v.saturation;g=y+(g-y)*v.saturation;b=y+(b-y)*v.saturation;p[i]=255*(clamp(r/255)**(1/v.gamma));p[i+1]=255*(clamp(g/255)**(1/v.gamma));p[i+2]=255*(clamp(b/255)**(1/v.gamma));}
    if(v.sharpness!==1){const src=new Uint8ClampedArray(p),amount=(v.sharpness-1)*.42;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const q=(y*w+x)*4;for(let k=0;k<3;k++){const blur=(src[q-4+k]+src[q+4+k]+src[q-w*4+k]+src[q+w*4+k]+src[q+k]*4)/8;p[q+k]=clamp(src[q+k]+amount*(src[q+k]-blur),0,255);}}}
    return {pixels:p,width:w,height:h};
  }
  function cellPixels(source, config, index) {
    const c=config.canvas,n=c.sample_width*c.sample_height,out=new Float32Array(n*3),cx=index%c.columns,cy=Math.floor(index/c.columns);let q=0;
    for(let y=0;y<c.sample_height;y++)for(let x=0;x<c.sample_width;x++){const at=((cy*c.sample_height+y)*source.width+cx*c.sample_width+x)*4;out[q++]=source.pixels[at];out[q++]=source.pixels[at+1];out[q++]=source.pixels[at+2];}return out;
  }
  function photoFit(source,masks,config,progress) {
    const count=config.canvas.columns*config.canvas.rows,n=config.canvas.sample_width*config.canvas.sample_height,gc=masks.low.length;
    const chosen=new Uint16Array(count),fg=new Uint8Array(count),bg=new Uint8Array(count);
    const meanM=new Float32Array(gc),ssM=new Float32Array(gc),sumM2=new Float32Array(gc);
    for(let g=0;g<gc;g++){let s=0,s2=0;for(const m of masks.low[g]){s+=m;s2+=m*m;}meanM[g]=s/n;sumM2[g]=s2;ssM[g]=Math.max(s2-s*s/n,1e-8);}
    for(let cell=0;cell<count;cell++){
      const p=cellPixels(source,config,cell),sum=[0,0,0],sumP2=p.reduce((a,x)=>a+x*x,0),dot=Array.from({length:gc},()=>[0,0,0]);
      for(let i=0;i<n;i++){for(let k=0;k<3;k++){const value=p[i*3+k];sum[k]+=value;for(let g=0;g<gc;g++)dot[g][k]+=value*masks.low[g][i];}}
      let seed=0,bestSeed=Infinity,seedFg=[0,0,0],seedBg=[0,0,0];
      for(let g=0;g<gc;g++){let explained=0,cov=[0,0,0];for(let k=0;k<3;k++){cov[k]=dot[g][k]-sum[k]*meanM[g];explained+=cov[k]*cov[k]/ssM[g];}if(-explained<bestSeed){bestSeed=-explained;seed=g;const beta=cov.map(x=>x/ssM[g]);seedBg=sum.map((x,k)=>clamp(x/n-beta[k]*meanM[g],0,255));seedFg=seedBg.map((x,k)=>clamp(x+beta[k],0,255));}}
      const fgs=nearest(seedFg,config.fit.foreground_candidates),bgs=nearest(seedBg,config.fit.background_candidates,Array.from({length:8},(_,i)=>i));let best=Infinity;
      for(const fi of fgs)for(const bi of bgs){const f=PALETTE[fi],b=PALETTE[bi],d=f.map((x,k)=>x-b[k]);for(let g=0;g<gc;g++){let e=sumP2;for(let k=0;k<3;k++)e+=n*b[k]*b[k]+2*b[k]*d[k]*meanM[g]*n+d[k]*d[k]*sumM2[g]-2*b[k]*sum[k]-2*d[k]*dot[g][k];if(e<best){best=e;chosen[cell]=g;fg[cell]=fi;bg[cell]=bi;}}}
      if(progress&&cell%80===0)progress(cell/count);
    }
    return {chosen,fg,bg};
  }
  function gaussian(values,w,h,radius){if(radius<=0)return new Float32Array(values);const rad=Math.max(1,Math.ceil(radius*2)),sigma=Math.max(radius,.01),kernel=[];let ks=0;for(let i=-rad;i<=rad;i++){const x=Math.exp(-(i*i)/(2*sigma*sigma));kernel.push(x);ks+=x;}for(let i=0;i<kernel.length;i++)kernel[i]/=ks;let tmp=new Float32Array(values.length),out=new Float32Array(values.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let k=-rad;k<=rad;k++)s+=values[y*w+clamp(x+k,0,w-1)]*kernel[k+rad];tmp[y*w+x]=s;}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let k=-rad;k<=rad;k++)s+=tmp[clamp(y+k,0,h-1)*w+x]*kernel[k+rad];out[y*w+x]=s;}return out;}
  function industrialFit(source,masks,config,progress){
    const {width:w,height:h,pixels:p}=source,v=config.industrial,lum=new Float32Array(w*h),sat=new Float32Array(w*h),maxc=new Float32Array(w*h);for(let i=0;i<w*h;i++){const r=p[i*4],g=p[i*4+1],b=p[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);lum[i]=.2126*r+.7152*g+.0722*b;sat[i]=(mx-mn)/Math.max(mx,1);maxc[i]=mx;}
    const structure=gaussian(lum,w,h,v.structure_blur),blurred=gaussian(lum,w,h,v.texture_blur),stylized=new Float32Array(w*h*3);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,gx=(structure[y*w+clamp(x+1,0,w-1)]-structure[y*w+clamp(x-1,0,w-1)])/2,gy=(structure[clamp(y+1,0,h-1)*w+x]-structure[clamp(y-1,0,h-1)*w+x])/2;const edge=clamp((Math.hypot(gx,gy)-v.edge_threshold)/v.edge_range),texture=clamp((Math.abs(lum[i]-blurred[i])-v.texture_threshold)/v.texture_range),highlight=clamp((lum[i]-v.highlight_threshold)/v.highlight_range)**v.highlight_exponent,accent=sat[i]*clamp(lum[i]/v.accent_luminance_scale);const ink=clamp((clamp(v.edge_weight*edge+v.texture_weight*texture+v.highlight_weight*highlight+v.accent_weight*accent)-v.sparsity_threshold)/v.sparsity_range)**v.ink_exponent,mix=clamp((sat[i]-v.saturation_threshold)/v.saturation_range);for(let k=0;k<3;k++)stylized[i*3+k]=((1-mix)+mix*p[i*4+k]/Math.max(maxc[i],1))*ink*255;}
    const count=config.canvas.columns*config.canvas.rows,n=config.canvas.sample_width*config.canvas.sample_height,chosen=new Uint16Array(count),fg=new Uint8Array(count),bg=new Uint8Array(count);
    for(let cell=0;cell<count;cell++){const cx=cell%config.canvas.columns,cy=Math.floor(cell/config.canvas.columns);let best=Infinity;for(let color=1;color<16;color++)for(let g=0;g<masks.low.length;g++){let e=0,q=0;for(let y=0;y<config.canvas.sample_height;y++)for(let x=0;x<config.canvas.sample_width;x++){const pi=((cy*config.canvas.sample_height+y)*w+cx*config.canvas.sample_width+x)*3,m=masks.low[g][q++];for(let k=0;k<3;k++){const d=stylized[pi+k]-m*PALETTE[color][k];e+=d*d;}}if(e<best){best=e;chosen[cell]=g;fg[cell]=color;}}if(progress&&cell%80===0)progress(cell/count);}return{chosen,fg,bg};
  }
  function ansiBytes(masks,result,config){const chunks=[];let current="";for(let i=0;i<result.chosen.length;i++){const f=result.fg[i],b=result.bg[i],state=`${f},${b}`;if(state!==current){for(const ch of `\x1b[${f>=8?1:22};${30+f%8};${40+b}m`)chunks.push(ch.charCodeAt(0));current=state;}chunks.push(masks.codes[result.chosen[i]]);}for(const ch of "\x1b[0m")chunks.push(ch.charCodeAt(0));return new Uint8Array(chunks);}
  function preview(masks,result,config){const c=config.canvas,w=c.columns*c.cell_width,h=c.rows*c.cell_height,cv=new OffscreenCanvas(w,h),ctx=cv.getContext("2d"),image=ctx.createImageData(w,h),p=image.data;for(let cell=0;cell<result.chosen.length;cell++){const cx=cell%c.columns,cy=Math.floor(cell/c.columns),mask=masks.hi[result.chosen[cell]],f=PALETTE[result.fg[cell]],b=PALETTE[result.bg[cell]];for(let y=0;y<c.cell_height;y++)for(let x=0;x<c.cell_width;x++){const m=mask[y*c.cell_width+x],at=((cy*c.cell_height+y)*w+cx*c.cell_width+x)*4;for(let k=0;k<3;k++)p[at+k]=Math.round(b[k]+m*(f[k]-b[k]));p[at+3]=255;}}ctx.putImageData(image,0,0);return cv;}
  async function convert(bitmap,config,codes,progress){config=configFrom(config);const source=preprocess(bitmap,config),masks=await glyphMasks(codes,config.canvas),result=config.style==="industrial"?industrialFit(source,masks,config,progress):photoFit(source,masks,config,progress),ansi=ansiBytes(masks,result,config),canvas=preview(masks,result,config),png=await canvas.convertToBlob({type:"image/png"});return{ansi,png,width:canvas.width,height:canvas.height,glyphCount:masks.codes.length};}

  scope.PNG2ANSI={DEFAULTS,LIMITS,PALETTE,CP437,clone,configFrom,mergeConfig,validateConfig,vocabularies,referenceVocabulary,glyphStrip,ansiBytes,convert};
})(globalThis);
