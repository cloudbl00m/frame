'use strict';
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:false,colorSpace:'srgb'});
let audioEdits=[],editingAudioId=null;
const overlayPlayers=new Map();
let assets=[],clips=[],selected=null,time=0,playing=false,exporting=false,cancelled=false,history=[],future=[],audioCtx,destination,runId=0,downloadUrl;
const defaults={speed:1,fit:'contain',brightness:100,contrast:100,saturation:100,volume:100,title:'',position:'center',textColor:'#ffffff'};
const duration=c=>(c.out-c.in)/c.speed,total=()=>clips.reduce((s,c)=>s+duration(c),0),current=()=>clips.find(c=>c.id===selected),asset=c=>assets.find(a=>a.id===c.assetId),uid=()=>crypto.randomUUID();
const format=t=>{t=Math.max(0,t);return String(Math.floor(t/60)).padStart(2,'0')+':'+(t%60).toFixed(2).padStart(5,'0')};
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500)}
function checkpoint(){history.push(JSON.stringify({clips,audioEdits,studio}));if(history.length>60)history.shift();future=[]}
function pause(){playing=false;runId++;for(const el of layerPlayers.values())el.pause();for(const a of assets)if(a.type==='video'||a.type==='audio')a.el.pause();for(const player of overlayPlayers.values())player.pause();$('play').textContent='▶'}
function locate(t){let start=0;for(let i=0;i<clips.length;i++){const c=clips[i];if(t<start+duration(c)||i===clips.length-1)return {c,start,local:Math.min(duration(c),Math.max(0,t-start))};start+=duration(c)}return null}
function size(height){let [w,h]=$('ratio').value.split(':').map(Number);if(!height){const box=canvas.parentElement.getBoundingClientRect();const scale=Math.min(box.width/w,box.height/h)*Math.min(devicePixelRatio||1,1.5);height=Math.max(120,Math.min(720,Math.round(Math.min(w,h)*scale/2)*2))}canvas.width=w>=h?Math.round(height*w/h/2)*2:height;canvas.height=w>=h?height:Math.round(height*h/w/2)*2}
function draw(c,local=0,decodedFrame=null,timelineTime=time,upper=null){let w=canvas.width,h=canvas.height;ctx.fillStyle='#07090d';ctx.fillRect(0,0,w,h);if(!c)return;const a=asset(c);if(!a)return;ctx.save();applyPicture(c,c.in+local*c.speed);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality=exporting?'high':'medium';ctx.filter=c.brightness===100&&c.contrast===100&&c.saturation===100?'none':`brightness(${c.brightness}%) contrast(${c.contrast}%) saturate(${c.saturation}%)`;
if(a.type==='demo'){const grad=ctx.createLinearGradient(0,0,w,h);grad.addColorStop(0,a.color);grad.addColorStop(1,'#08131b');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);ctx.fillStyle='#ffffff0b';for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(w*(.1+i*.16)+Math.sin(local*.5+i)*w*.06,h*.6+Math.cos(i+local*.3)*h*.24,h*(.09+i*.028),0,Math.PI*2);ctx.fill()}ctx.strokeStyle='#d5f5bc33';ctx.lineWidth=2;for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(0,h*(.6+i*.04));ctx.bezierCurveTo(w*.3,h*.2,w*.6,h*1.3,w,h*(.1+i*.05));ctx.stroke()}}
else {const el=decodedFrame||a.el,sw=decodedFrame?el.displayWidth:(el.videoWidth||el.naturalWidth),sh=decodedFrame?el.displayHeight:(el.videoHeight||el.naturalHeight);if(sw&&sh){const scale=c.fit==='cover'?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh);decodedFrame?decodedFrame.draw(ctx,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale):ctx.drawImage(el,(w-sw*scale)/2,(h-sh*scale)/2,sw*scale,sh*scale)}}applyWarmth(c,c.in+local*c.speed);ctx.restore();
if(c.title){const fontSize=Math.round(Math.min(w,h)*.068);ctx.font=`600 ${fontSize}px Segoe UI, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.textColor;ctx.shadowColor='#000b';ctx.shadowBlur=fontSize*.3;const words=c.title.split(' '),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(ctx.measureText(next).width>w*.84&&line){lines.push(line);line=word}else line=next}lines.push(line);let y=c.position==='bottom'?h*.82:c.position==='top'?h*.18:h*.5;lines.forEach((l,i)=>ctx.fillText(l,w/2,y+(i-(lines.length-1)/2)*fontSize*1.25,w*.9));ctx.shadowBlur=0}drawComposite(timelineTime,upper)}
function clock(){if(!playing)$('previewRate').textContent='Preview paused';const end=total();$('clock').textContent=frameCode(time)+' / '+frameCode(end);$('scrub').max=end||1;$('scrub').value=time;$('playhead').style.left=(time*+$('zoom').value)+'px'}
async function seek(t){pause();time=Math.min(total(),Math.max(0,t));const found=locate(time);if(found){const a=asset(found.c);if(a.type==='video'){a.el.currentTime=Math.min(a.duration-.001,found.c.in+found.local*found.c.speed)}draw(found.c,found.local)}else draw(null);clock()}
function refreshInspector(){const c=current();$('settings').disabled=!c;$('emptyInspector').hidden=!!c;if(!c)return;for(const key of Object.keys(defaults)){$(key).value=c[key];if($(key+'Value'))$(key+'Value').textContent=c[key]+'%'}$('clipName').value=c.name;$('inPoint').value=c.in.toFixed(2);$('outPoint').value=c.out.toFixed(2)}
function refresh(){resolveAnchors();time=Math.min(time,total());$('welcome').hidden=clips.length>0;$('track').replaceChildren();let offset=0;const zoom=+$('zoom').value;for(const c of clips){const b=document.createElement('button');b.className='clip'+(c.id===selected?' selected':'');b.style.width=duration(c)*zoom+'px';b.title=c.name+' · Source '+format(c.in)+'–'+format(c.out)+' · Drag to reorder, or use Move earlier / Move later';b.dataset.clipId=c.id;b.draggable=true;b.ondragstart=e=>{if(exporting){e.preventDefault();return}pause();draggedClip=c.id;selected=c.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',c.id);b.classList.add('dragging')};b.ondragend=clearDrag;const title=document.createElement('b');title.textContent=c.name;const small=document.createElement('small');small.textContent=format(c.in)+'–'+format(c.out);b.append(title,small);const start=offset;b.onclick=()=>{selected=c.id;seek(start);refresh()};$('track').append(b);offset+=duration(c)}if(!clips.length){const p=document.createElement('p');p.textContent='Add media to begin your edit';$('track').append(p)}$('ruler').replaceChildren();const seconds=Math.max(30,Math.ceil(total()/5)*5);for(let i=0;i<seconds;i+=5){const s=document.createElement('span');s.textContent=format(i);s.style.width=zoom*5+'px';$('ruler').append(s)}$('track').style.width=Math.max(total()*zoom,300)+'px';$('ruler').style.width=seconds*zoom+'px';$('undo').disabled=!history.length;$('redo').disabled=!future.length;for(const id of ['split','duplicate','remove','left','right'])$(id).disabled=!current();const selectedIndex=clips.findIndex(c=>c.id===selected);$('left').disabled=selectedIndex<=0;$('right').disabled=selectedIndex<0||selectedIndex===clips.length-1;$('export').disabled=!clips.length;refreshInspector();refreshAudioEdits();refreshStudio();clock();const f=locate(time);if(f)draw(f.c,f.local);else draw(null)}
function mediaList(){$('media').replaceChildren();$('count').textContent=assets.length+' files';for(const a of assets){const row=document.createElement('div');row.className='asset';const icon=document.createElement('span');icon.className='icon';icon.textContent=a.type==='video'?'▷':a.type==='audio'?'♫':'▧';const info=document.createElement('div');info.className='info';const b=document.createElement('b');b.textContent=a.name;const sm=document.createElement('small');sm.textContent=(a.type==='video'||a.type==='audio')?format(a.duration):a.type==='demo'?'Animated sample':'Still image';info.append(b,sm);const add=document.createElement('button');add.textContent='+';add.title='Add '+a.name+' to timeline';add.onclick=()=>a.type==='audio'?openAudioEditor(null,a.id):addClip(a);row.append(icon,info,add);$('media').append(row)}}
function addClip(a){pause();checkpoint();const c={...defaults,id:uid(),assetId:a.id,name:a.name,in:0,out:a.type==='video'?a.duration:5};clips.push(c);selected=c.id;seek(total()-duration(c));refresh()}
function loadFile(file,id=uid()){if(file&&!(file instanceof File))file=new File([file],file.name||'Imported media',{type:file.type});return new Promise((resolve,reject)=>{const type=file.type.startsWith('video/')?'video':file.type.startsWith('image/')?'image':file.type.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)?'audio':null;if(!type)return reject(Error('Unsupported file: '+file.name));const url=URL.createObjectURL(file),el=document.createElement(type==='image'?'img':type);let timer=setTimeout(()=>fail(),15000);function fail(){clearTimeout(timer);URL.revokeObjectURL(url);reject(Error('Cannot decode '+file.name+'. Try an MP4, WebM, JPEG or PNG.'))}el.onerror=fail;el[type==='image'?'onload':'onloadeddata']=()=>{clearTimeout(timer);if(type!=='image'&&(!Number.isFinite(el.duration)||el.duration<=0))return fail();const a={id,name:file.name,file,type,url,el,duration:type==='image'?5:el.duration};if(type==='video'){el.playsInline=true;el.preload='auto';el.onseeked=()=>{if(!playing&&!exporting){const f=locate(time);if(f&&f.c.assetId===a.id)draw(f.c,f.local)}}}resolve(a)};el.src=url})}
async function importFiles(files){if(exporting)return;pause();for(const file of files){try{const a=await loadFile(file);assets.push(a);mediaList();if(a.type==='audio')openAudioEditor(null,a.id);else addClip(a)}catch(e){toast(e.message)}}$('files').value='';$('status').textContent='Media imported · Save project to keep this edit in this browser.'}
$('import').onclick=$('start').onclick=()=>$('files').click();$('files').onchange=e=>importFiles(e.target.files);document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)importFiles(e.dataTransfer.files)});
$('demo').onclick=()=>{for(const [name,color,title] of [['01 · The beginning','#254a50','Every story starts somewhere.'],['02 · Find your rhythm','#65553a','Find your rhythm.'],['03 · Make it yours','#3e4f3a','Make it yours.']]){const a={id:uid(),name,type:'demo',color,duration:5};assets.push(a);addClip(a);clips[clips.length-1].title=title}mediaList();seek(0);refresh()};
async function audio(){if(!audioCtx){audioCtx=new AudioContext();destination=audioCtx.createMediaStreamDestination()}await audioCtx.resume();for(const a of assets){if(a.type==='video'&&!a.source){a.source=audioCtx.createMediaElementSource(a.el);a.gain=audioCtx.createGain();a.source.connect(a.gain);a.gain.connect(audioCtx.destination);a.gain.connect(destination)}}installMeter()}
function waitSeek(el,t){return new Promise((resolve,reject)=>{if(Math.abs(el.currentTime-t)<.015&&el.readyState>=2)return resolve();const timer=setTimeout(()=>{cleanup();reject(Error('Video seek timed out.'))},10000);function cleanup(){clearTimeout(timer);el.removeEventListener('seeked',done)}function done(){cleanup();resolve()}el.addEventListener('seeked',done);el.currentTime=t})}
async function playSequence(start=0,record=false,onReady){
 pause();const token=runId;playing=true;$('play').textContent='Ⅱ';time=start;
 const valid=()=>token===runId&&!(cancelled&&record);
 try{
  await audio();if(!valid())return;
  const found=locate(start);if(!found){pause();return}
  let offset=found.local,ready=false;
  for(let index=clips.indexOf(found.c);index<clips.length&&valid();index++){
   const c=clips[index],a=asset(c),video=a.type==='video'?a.el:null;
   const base=clips.slice(0,index).reduce((s,x)=>s+duration(x),0);
   // Stop every track at a cut, before seeking the next picture.
   pauseOverlayPreview();time=base+offset;
   if(video){await waitSeek(video,c.in+offset*c.speed);video.playbackRate=c.speed}
   if(!valid())return;
   draw(c,offset);if(!ready){onReady?.();ready=true}
   let local=offset,last=performance.now();
   const stall=()=>pauseOverlayPreview();
   video?.addEventListener('waiting',stall);video?.addEventListener('seeking',stall);
   try{
    while(valid()){
     const before=performance.now();await syncOverlayPreview(time,c,token);
     if(!valid())break;
     last+=performance.now()-before;
     const now=await new Promise(requestAnimationFrame);if(!valid())break;
     local=video?(video.currentTime-c.in)/c.speed:local+(now-last)/1000;last=now;
     time=base+Math.min(duration(c),Math.max(0,local));draw(c,local);samplePerformance(now);clock();
     if(local>=duration(c)-.001||video?.ended)break;
    }
   }finally{video?.removeEventListener('waiting',stall);video?.removeEventListener('seeking',stall);if(valid()){video?.pause();pauseOverlayPreview()}}
   offset=0;
  }
  if(valid()){playing=false;$('play').textContent='▶';clock()}
 }catch(e){if(valid()){pause();throw e}}
}
// Canvas cannot draw in a hidden tab: stop sound with the picture.
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause()});
$('play').onclick=()=>{if(playing)pause();else playSequence(time>=total()-.02?0:time).catch(e=>toast(e.message))};$('home').onclick=()=>seek(0);$('end').onclick=()=>seek(total());$('scrub').oninput=e=>seek(+e.target.value);$('ruler').onclick=e=>{const r=$('ruler').getBoundingClientRect();seek((e.clientX-r.left)/+$('zoom').value)};$('zoom').oninput=refresh;$('ratio').onchange=()=>{pause();size();refresh()};
for(const key of Object.keys(defaults)){$(key).onchange=()=>{const c=current();if(!c)return;pause();checkpoint();c[key]=typeof defaults[key]==='number'?+$(key).value:$(key).value;refresh()}}
$('clipName').onchange=()=>{if(current()){checkpoint();current().name=$('clipName').value||'Untitled clip';refresh()}};
function trim(){const c=current();if(!c)return;const a=asset(c),i=+$('inPoint').value,o=+$('outPoint').value;if(!Number.isFinite(i)||!Number.isFinite(o)||i<0||o-i<.1||(a.type==='video'&&o>a.duration+.001)||o>36000){toast('Choose valid in/out points with at least 0.1 seconds between them.');refreshInspector();return}pause();checkpoint();c.in=i;c.out=o;seek(time);refresh()}
$('inPoint').onchange=$('outPoint').onchange=trim;$('reset').onclick=()=>{if(current()){checkpoint();Object.assign(current(),defaults);refresh()}};
$('split').onclick=()=>{const f=locate(time);if(!f||f.local<.05||duration(f.c)-f.local<.05){toast('Place the playhead inside a clip to split it.');return}pause();checkpoint();const cut=f.c.in+f.local*f.c.speed,second={...structuredClone(f.c),id:uid(),in:cut};splitAnchors(f.c,second,cut);f.c.out=cut;clips.splice(clips.indexOf(f.c)+1,0,second);selected=second.id;refresh()};
$('duplicate').onclick=()=>{const c=current();if(!c)return;pause();checkpoint();const copy={...structuredClone(c),id:uid()};for(const e of audioEdits.filter(e=>e.anchor?.id===c.id)){const other=structuredClone(e);other.id=uid();other.anchor.id=copy.id;audioEdits.push(other)}clips.splice(clips.indexOf(c)+1,0,copy);selected=copy.id;refresh()};$('remove').onclick=()=>{if(!current())return;pause();checkpoint();audioEdits=audioEdits.filter(e=>e.anchor?.id!==selected);clips=clips.filter(c=>c.id!==selected);selected=clips[0]?.id;seek(time);refresh()};
function reorderClip(id,boundary){
 const from=clips.findIndex(c=>c.id===id);
 if(exporting||from<0||!Number.isInteger(boundary)||boundary<0||boundary>clips.length)return false;
 const to=boundary>from?boundary-1:boundary;
 if(to===from)return false;
 pause();checkpoint();const [clip]=clips.splice(from,1);clips.splice(to,0,clip);selected=id;
 seek(clips.slice(0,to).reduce((s,c)=>s+duration(c),0));refresh();
 $('status').textContent='Moved '+clip.name+' ('+format(clip.in)+'–'+format(clip.out)+') to position '+(to+1)+' of '+clips.length;
 $('track').children[to]?.focus({preventScroll:true});return true;
}
function move(d){const i=clips.findIndex(c=>c.id===selected);if(i<0||i+d<0||i+d>=clips.length)return;reorderClip(selected,d>0?i+2:i-1)}
let draggedClip=null,dropBoundary=null;
const dropMarker=document.createElement('div');dropMarker.id='dropMarker';dropMarker.hidden=true;$('timelineScroll').append(dropMarker);
function clearDrag(){draggedClip=null;dropBoundary=null;dropMarker.hidden=true;for(const el of $('track').children)el.classList?.remove('dragging')}
function dropPosition(clientX){const x=clientX-$('track').getBoundingClientRect().left;let start=0;const zoom=+$('zoom').value;for(let i=0;i<clips.length;i++){const width=duration(clips[i])*zoom;if(x<start+width/2)return {boundary:i,x:start};start+=width}return {boundary:clips.length,x:start}}
$('timelineScroll').addEventListener('dragover',e=>{if(!draggedClip||exporting)return;e.preventDefault();e.dataTransfer.dropEffect='move';const scroller=$('timelineScroll'),rect=scroller.getBoundingClientRect();if(e.clientX<rect.left+36)scroller.scrollLeft-=20;else if(e.clientX>rect.right-36)scroller.scrollLeft+=20;const drop=dropPosition(e.clientX);dropBoundary=drop.boundary;dropMarker.style.left=drop.x+'px';dropMarker.hidden=false});
$('timelineScroll').addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))dropMarker.hidden=true});
$('timelineScroll').addEventListener('drop',e=>{if(!draggedClip)return;e.preventDefault();e.stopPropagation();const id=draggedClip,boundary=dropPosition(e.clientX).boundary;clearDrag();reorderClip(id,boundary)});

$('left').onclick=()=>move(-1);$('right').onclick=()=>move(1);function undo(from,to){if(!from.length)return;pause();to.push(JSON.stringify({clips,audioEdits,studio}));const state=JSON.parse(from.pop());clips=Array.isArray(state)?state:state.clips;audioEdits=Array.isArray(state)?[]:state.audioEdits||[];studio=state.studio||initialStudio();clearOverlayPlayers();selected=clips[0]?.id;seek(time);refresh()}
$('undo').onclick=()=>undo(history,future);$('redo').onclick=()=>undo(future,history);
addEventListener('keydown',e=>{if(exporting||$('exportDialog').open||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);return}if(e.code==='Space'){e.preventDefault();$('play').click()}if(e.key.toLowerCase()==='s'&&!e.ctrlKey)$('split').click();if(e.key==='Delete')$('remove').click();if(e.ctrlKey&&e.key==='z'){e.preventDefault();$('undo').click()}});
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('frame-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
let promoFrame=0, promoElapsed=0, promoLast=null, cleanExport=false;
function resetPromo(){
 cancelAnimationFrame(promoFrame);promoFrame=0;promoLast=null;promoElapsed=0;cleanExport=false;
 $('promoCard').hidden=true;$('watchPromo').hidden=false;$('watchPromo').disabled=false;
 $('watchPromo').textContent='Watch promo for a watermark-free export';
 $('render').textContent='Export with watermark';
}
function promoTick(now){
 if(!$('exportDialog').open){resetPromo();return}
 if(!document.hidden&&promoLast!==null)promoElapsed+=Math.min(now-promoLast,250);
 promoLast=document.hidden?null:now;
 const second=Math.floor(promoElapsed/1000);
 $('promoTitle').textContent=second<4?'Make the cut yours':'Give it your own sound';
 $('promoCopy').textContent=second<4?'Split a clip and drag the pieces into the order you want.':'Use Audio edits to mute a moment and lay a new sound over it.';
 $('promoTime').textContent=Math.max(0,8-second)+' seconds remaining';
 if(promoElapsed<8000){promoFrame=requestAnimationFrame(promoTick);return}
 promoFrame=0;cleanExport=true;$('promoCard').hidden=true;$('watchPromo').hidden=true;
 $('render').textContent='Export without watermark';$('exportStatus').textContent='Promo complete. One watermark-free export unlocked.';
}
document.addEventListener('visibilitychange',()=>{promoLast=null});
$('watchPromo').onclick=()=>{
 if(exporting||promoFrame||cleanExport)return;
 $('watchPromo').disabled=true;$('promoCard').hidden=false;
 $('download').hidden=true;$('exportStatus').textContent='Keep the promo visible to unlock this export.';
 promoTick(performance.now());
};
$('exportDialog').addEventListener('close',()=>{if(!$('exportDialog').open)resetPromo()});
function drawExportFrame(clip,local,frame,t,upper){
 draw(clip,local,frame,t,upper);
 if(cleanExport)return;
 const fontSize=Math.round(Math.min(canvas.width,canvas.height)*.035);
 ctx.save();ctx.font='600 '+fontSize+'px system-ui';ctx.textAlign='right';ctx.textBaseline='bottom';
 ctx.fillStyle='rgba(0,0,0,.65)';
 const label='Frame Studio',width=ctx.measureText(label).width,margin=fontSize*.65;
 ctx.fillRect(canvas.width-width-3*margin,canvas.height-fontSize-3*margin,width+2*margin,fontSize+2*margin);
 ctx.fillStyle='white';ctx.fillText(label,canvas.width-2*margin,canvas.height-2*margin);ctx.restore();
}
$('export').onclick=()=>{if(assets.some(a=>a.hdr&&([...clips,...studio.layers].some(c=>c.assetId===a.id)))){toast('HDR footage needs an SDR conversion before export.');return}resetPromo();pause();$('progress').value=0;$('download').hidden=true;$('exportStatus').textContent='Includes clip audio, colour adjustments and titles.';$('exportDialog').showModal()};
$('cancelExport').onclick=()=>{if(exporting){cancelled=true;pause()}else $('exportDialog').close()};$('exportDialog').addEventListener('cancel',e=>{if(exporting){e.preventDefault();cancelled=true;pause()}});
$('render').onclick=async()=>{
 if(exporting||!clips.length)return;
 if(!cleanExport)resetPromo();
 $('watchPromo').disabled=true;
 pause();cancelled=false;exporting=true;document.body.classList.add('busy');$('render').disabled=true;$('resolution').disabled=true;$('frameRate').disabled=true;$('download').hidden=true;$('progress').value=0;
 const originalTime=time;
 try{
  if(!window.FrameExport)throw Error('Export engine did not load. Save your project and reload this page.');const {renderFilm}=window.FrameExport;
  size(+$('resolution').value);
  const result=await renderFilm({canvas,layers:studio.layers,clips:clips.map(c=>({...c,volume:c.volume*trackGain("voice")})),audioEdits:audioEdits.filter(e=>e.end>e.start).map(e=>({...e,volume:e.volume*trackGain("music")})),assets,frameRate:+$('frameRate').value,draw:drawExportFrame,isCancelled:()=>cancelled,onProgress:(p,message)=>{$('progress').value=p;$('exportStatus').textContent=message}});
  if(cancelled)throw new DOMException('Export cancelled.','AbortError');
  if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=URL.createObjectURL(result.blob);
  const link=$('download');link.href=downloadUrl;link.download=($('projectName').value||'My film').replace(/[^a-z0-9 _-]/gi,'')+'.'+result.extension;link.textContent='Download '+result.extension.toUpperCase()+' · '+(result.blob.size/1048576).toFixed(1)+' MB';link.hidden=false;
  const exportedClean=cleanExport;resetPromo();
  $('progress').value=100;$('exportStatus').textContent='Ready · '+canvas.width+' × '+canvas.height+' · '+result.fps+' fps · '+result.audioLabel+' · SDR colour · '+(exportedClean?'Watermark-free':'With watermark');
 }catch(e){$('exportStatus').textContent=e.name==='AbortError'?'Export cancelled. Your edit is unchanged.':'Export failed: '+e.message}
 finally{exporting=false;$('watchPromo').disabled=false;document.body.classList.remove('busy');$('render').disabled=false;$('resolution').disabled=false;$('frameRate').disabled=false;size();seek(originalTime);refresh()}
};
function originalMuted(t){return audioEdits.some(e=>e.muteOriginal&&t>=e.start&&t<e.end)}
function clearOverlayPlayers(){for(const player of overlayPlayers.values()){player.pause();player._audioSource?.disconnect();player.removeAttribute('src');player.load()}overlayPlayers.clear()}
function pauseOverlayPreview(){for(const el of layerPlayers.values())el.pause();for(const player of overlayPlayers.values())player.pause()}
function waitPlayable(player){
 if(player.readyState>=3&&!player.seeking)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);player.removeEventListener('canplay',done);player.removeEventListener('seeked',done);player.removeEventListener('error',fail)};
  const done=()=>{if(player.readyState>=3&&!player.seeking){cleanup();resolve()}};
  const fail=()=>{cleanup();reject(Error('Unable to buffer media for synchronized playback.'))};
  const timer=setTimeout(fail,10000);
  player.addEventListener('canplay',done);player.addEventListener('seeked',done);player.addEventListener('error',fail);
 });
}
async function syncOverlayPreview(t,c,token=runId){
 const a=asset(c),video=a?.type==='video'?a.el:null;
 if(a?.gain)a.gain.gain.value=originalMuted(t)?0:c.volume/100*trackGain("voice");
 const active=[];
 for(const edit of audioEdits){
  if(!edit.assetId||edit.volume===0)continue;
  const sound=assets.find(a=>a.id===edit.assetId);if(!sound)continue;
  let player=overlayPlayers.get(edit.id);const local=t-edit.start+(edit.offset||0);
  if(t<edit.start||t>=edit.end||local>=sound.duration){player?.pause();continue}
  if(!player){player=document.createElement('audio');player.src=sound.url;player.preload='auto';overlayPlayers.set(edit.id,player);if(audioCtx){const source=audioCtx.createMediaElementSource(player);source.connect(audioCtx.destination);if(meterNode)source.connect(meterNode);player._audioSource=source}}
  player.volume=edit.volume/100*trackGain("music")*envelope(edit,t);active.push({player,local});
 }
 const layer=activeLayer(t);if(layer){const player=layerPlayer(layer);if(player)active.push({player,local:t-layer.start})}for(const [key,player] of layerPlayers)if(key!==layer?.id)player.pause();
 const needsSync=video&&(video.paused||video.seeking||video.readyState<3)||active.some(({player,local})=>player.paused||player.seeking||player.readyState<3||Math.abs(player.currentTime-local)>.06);
 if(!needsSync)return;
 // Freeze the master while another track buffers or seeks.
 video?.pause();pauseOverlayPreview();
 await Promise.all([...(video?[waitPlayable(video)]:[]),...active.map(async({player,local})=>{await waitSeek(player,local);await waitPlayable(player)})]);
 if(token!==runId||!playing)return;
 await Promise.all([...(video?[video.play()]:[]),...active.map(({player})=>player.play())]);
}
function refreshAudioEdits(){
 $('audioEditsList').replaceChildren();$('audioLane').replaceChildren();$('audioLane').style.width=Math.max(total()*+$('zoom').value,300)+'px';
 $('audioTools').disabled=!clips.length;
 audioEdits.forEach((edit,i)=>{
  const name=edit.assetId?assets.find(a=>a.id===edit.assetId)?.name||'Missing audio':'Mute original';
  const label=format(edit.start)+'–'+format(edit.end)+' · '+(edit.muteOriginal&&edit.assetId?'Replace: ':'')+name;
  const row=document.createElement('div');row.className='audio-edit-row';const editButton=document.createElement('button');editButton.textContent=label;editButton.onclick=()=>openAudioEditor(edit.id);
  const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{pause();checkpoint();audioEdits=audioEdits.filter(e=>e.id!==edit.id);clearOverlayPlayers();if(editingAudioId===edit.id)resetAudioForm();refresh()};row.append(editButton,remove);$('audioEditsList').append(row);
  if(edit.start<total()){const b=document.createElement('button');b.className='audio-region';b.textContent=(edit.muteOriginal?'Muted':'Mix')+(edit.assetId?' + sound':'');b.title=label;b.style.left=edit.start*+$('zoom').value+'px';b.style.width=Math.max(4,(Math.min(total(),edit.end)-edit.start)*+$('zoom').value)+'px';b.style.top=i*29+'px';b.onclick=()=>openAudioEditor(edit.id);$('audioLane').append(b)}
 });$('audioLane').style.height=Math.max(32,audioEdits.length*29)+'px';
 if(!audioEdits.length){const p=document.createElement('p');p.className='muted';p.textContent='No audio edits yet.';$('audioEditsList').append(p)}
}
function resetAudioForm(soundId=''){
 editingAudioId=null;$('anchorMode').value='timeline';$('fadeIn').value=$('fadeOut').value=0;const start=Math.min(time,Math.max(0,total()-.1));$('audioStart').value=start.toFixed(2);$('audioEnd').value=Math.min(total(),start+5).toFixed(2);$('muteOriginal').checked=true;$('audioVolume').value=80;$('audioOffset').value=0;$('audioSound').value=soundId;$('applyAudio').textContent='Add audio edit';$('audioError').textContent='';
}
function openAudioEditor(id=null,soundId=''){
 if(!clips.length){toast('Add video to the timeline first.');return}pause();$('audioSound').replaceChildren();const none=document.createElement('option');none.value='';none.textContent='None · mute only';$('audioSound').append(none);for(const a of assets.filter(a=>a.type==='audio')){const option=document.createElement('option');option.value=a.id;option.textContent=a.name;$('audioSound').append(option)}
 resetAudioForm(soundId);const edit=audioEdits.find(e=>e.id===id);if(edit){$('anchorMode').value=edit.anchor?'clip':'timeline';$('fadeIn').value=edit.fadeIn||0;$('fadeOut').value=edit.fadeOut||0;editingAudioId=id;$('audioStart').value=edit.start;$('audioEnd').value=edit.end;$('muteOriginal').checked=edit.muteOriginal;$('audioSound').value=edit.assetId||'';$('audioVolume').value=edit.volume;$('audioOffset').value=edit.offset||0;$('applyAudio').textContent='Update audio edit'}
 refreshAudioEdits();if(!$('audioDialog').open)$('audioDialog').showModal();
}
function applyAudioEdit(){
 const start=+$('audioStart').value,end=+$('audioEnd').value,volume=+$('audioVolume').value,offset=+$('audioOffset').value,assetId=$('audioSound').value||null,muteOriginal=$('muteOriginal').checked;
 const sound=assets.find(a=>a.id===assetId);let error='';if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end-start<.05||end>total()+.001)error='Choose a range inside the video, at least 0.05 seconds long.';
 else if(!muteOriginal&&!assetId)error='Choose a sound or enable mute original.';else if(assetId&&(!sound||!Number.isFinite(offset)||offset<0||offset>=sound.duration))error='The sound in point must be inside the audio file.';else if(!Number.isFinite(volume)||volume<0||volume>100)error='Choose a volume from 0 to 100%.';
 const host=locate(start);if($('anchorMode').value==='clip'&&(!host||end>host.start+duration(host.c)+.001))error='An attached range must fit within one clip.';$('audioError').textContent=error;if(error)return false;pause();checkpoint();const edit={id:editingAudioId||uid(),start,end,muteOriginal,assetId,volume,offset,fadeIn:Math.max(0,+$('fadeIn').value),fadeOut:Math.max(0,+$('fadeOut').value)};if($('anchorMode').value==='clip')edit.anchor={id:host.c.id,from:host.c.in+(start-host.start)*host.c.speed,to:host.c.in+(end-host.start)*host.c.speed,offset};const index=audioEdits.findIndex(e=>e.id===edit.id);if(index<0)audioEdits.push(edit);else audioEdits[index]=edit;clearOverlayPlayers();resetAudioForm();refresh();$('status').textContent='Audio edit added · '+format(start)+'–'+format(end);return true;
}
$('audioTools').onclick=()=>openAudioEditor();$('newAudioEdit').onclick=()=>resetAudioForm();$('applyAudio').onclick=applyAudioEdit;$('closeAudio').onclick=()=>$('audioDialog').close();$('uploadSound').onclick=()=>$('audioFile').click();
$('audioFile').onchange=async()=>{const file=$('audioFile').files[0];if(!file)return;$('uploadSound').disabled=true;try{const a=await loadFile(file);if(a.type!=='audio')throw Error('Choose an audio file.');assets.push(a);mediaList();const option=document.createElement('option');option.value=a.id;option.textContent=a.name;$('audioSound').append(option);$('audioSound').value=a.id;$('audioError').textContent=''}catch(e){$('audioError').textContent=e.message}finally{$('uploadSound').disabled=false;$('audioFile').value=''}};


