/*__CORE__*/
let latest=0;
self.onmessage=async event=>{
  const {id,bitmap,config,codes}=event.data; latest=Math.max(latest,id);
  try{
    const result=await PNG2ANSI.convert(bitmap,config,codes,value=>{if(id===latest)self.postMessage({id,type:"progress",value});});
    if(id!==latest)return;
    const png=await result.png.arrayBuffer();
    self.postMessage({id,type:"result",ansi:result.ansi.buffer,png,width:result.width,height:result.height,glyphCount:result.glyphCount,workUnits:result.workUnits},[result.ansi.buffer,png]);
  }catch(error){if(id===latest)self.postMessage({id,type:"error",message:error?.message||String(error)});}
};
