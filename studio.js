'use strict';
const layerPlayers=new Map(), pictureDefaults={px:0,py:0,scale:100,rotate:0,crop:0,opacity:100,warmth:0};
let perfVideo=null,perfPresented=0;let captionId=null,perfStart=0,perfFrames=0,lastScope=0,meterNode,meterBuffer,lastClockClip;
const bounded=(n,min,max)=>Math.max(min,Math.min(max,n));
const fps=()=>studio.fps||60;
const snapped=t=>$('snap').checked?Math.round(t*fps())/fps():t;
const frameCode=t=>{const n=Math.round(t*fps());return [Math.floor(n/fps()/3600),Math.floor(n/fps()/60)%60,Math.floor(n/fps())%60,n%fps()].map(v=>String(v).padStart(2,'0')).join(':')};
function trackGain(key){const m=studio.mix,other=key==='voice'?'music':'voice';return m[key+'Mute']||m[other+'Solo']&&!m[key+'Solo']?0:m[key]/100}
function envelope(e,t){return Math.max(0,Math.min(1,e.fadeIn?(t-e.start)/e.fadeIn:1,e.fadeOut?(e.end-t)/e.fadeOut:1))}
function resolveAnchors(){
 let base=0;const positions=new Map();for(const c of clips){positions.set(c.id,{c,base});base+=duration(c)}
 for(const e of audioEdits){if(!e.anchor)continue;const a=e.anchor,host=positions.get(a.id);if(!host){e.start=e.end=0;continue}
 const {c,base}=host,from=bounded(a.from,c.in,c.out),to=bounded(a.to,c.in,c.out);
 e.start=base+(from-c.in)/c.speed;e.end=base+(to-c.in)/c.speed;e.offset=a.offset+Math.max(0,from-a.from)/c.speed}
}
function splitAnchors(c,right,cut){for(const e of [...audioEdits]){
 const a=e.anchor;if(a?.id!==c.id||a.to<=cut)continue;
 if(a.from>=cut){a.id=right.id;continue}
 const part=structuredClone(e);part.id=uid();part.anchor={...a,id:right.id,from:cut,offset:a.offset+(cut-a.from)/c.speed};a.to=cut;audioEdits.push(part)
}}
function pictureAt(c,t){
 const base={...pictureDefaults,...c.picture},keys=c.keys||[];if(!keys.length)return base;
 const next=keys.findIndex(k=>k.t>=t);if(next===0)return keys[0].value;if(next<0)return keys.at(-1).value;
 const a=keys[next-1],b=keys[next],v=(t-a.t)/(b.t-a.t);return Object.fromEntries(Object.keys(base).map(k=>[k,a.value[k]+(b.value[k]-a.value[k])*v]))
}
function applyPicture(c,t){const p=pictureAt(c,t),w=canvas.width,h=canvas.height;
 ctx.globalAlpha=p.opacity/100;ctx.translate(w*(.5+p.px/100),h*(.5+p.py/100));ctx.rotate(p.rotate*Math.PI/180);ctx.scale(p.scale/100,p.scale/100);ctx.translate(-w/2,-h/2);
 if(p.crop){const n=p.crop/100;ctx.beginPath();ctx.rect(w*n,h*n,w*(1-2*n),h*(1-2*n));ctx.clip()}
}
function applyWarmth(c,t){const warmth=pictureAt(c,t).warmth;if(!warmth)return;
 ctx.save();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=Math.abs(warmth)/185;ctx.fillStyle=warmth>0?'#ffe7be':'#c8e3ff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore()
}
function activeLayer(t){return studio.layers.find(l=>l.start<=t+1e-8&&t<l.end-1e-8)}
function layerPlayer(l){const a=assets.find(a=>a.id===l.assetId);if(a?.type!=='video')return null;
 if(!layerPlayers.has(l.id)){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.src=a.url;v.onseeked=v.onloadeddata=()=>{if(!playing&&!exporting&&activeLayer(time)?.id===l.id){const f=locate(time);if(f)draw(f.c,f.local)}};layerPlayers.set(l.id,v)}return layerPlayers.get(l.id)
}
function drawComposite(t,decoded){
 const w=canvas.width,h=canvas.height,layer=activeLayer(t);
 if(layer){const a=assets.find(a=>a.id===layer.assetId),el=decoded||layerPlayer(layer)||a?.el;
 if(el){if(!decoded&&a.type==='video'&&!playing&&!exporting&&!el.seeking&&Math.abs(el.currentTime-(t-layer.start))>.01)el.currentTime=Math.max(0,t-layer.start);
 const sw=el.displayWidth||el.videoWidth||el.naturalWidth,sh=el.displayHeight||el.videoHeight||el.naturalHeight;
 if(sw&&sh){const pip=layer.fit==='pip',bw=pip?w*.38:w,bh=pip?h*.35:h,r=pip?Math.min(bw/sw,bh/sh):Math.max(w/sw,h/sh),dw=sw*r,dh=sh*r;
 const x=pip?w-dw-w*.04:(w-dw)/2,y=pip?h*.05:(h-dh)/2;
 if(decoded)el.draw(ctx,x,y,dw,dh);else ctx.drawImage(el,x,y,dw,dh)}}}
 const style=studio.style;
 function lines(text,x,y,size,align,color){ctx.save();ctx.font='700 '+size+'px system-ui';ctx.textAlign=align;ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=Math.max(2,size*.11);ctx.strokeStyle='#121216';ctx.fillStyle=color;
 for(const line of text.split('\n')){ctx.strokeText(line,x,y,w*.91);ctx.fillText(line,x,y,w*.91);y+=size*1.22}ctx.restore()}
 if(studio.heading)lines(studio.heading,w/2,h*.09,w*.066,'center',style.color);
 if(studio.ranks)lines(studio.ranks,w*.045,h*.22,w*.052,'left',style.color);
 for(const e of studio.captions)if(t>=e.start&&t<e.end)lines(e.text,w/2,h*({top:.16,center:.5,bottom:.84}[style.position]),w*style.size/100,'center',style.color);
 const scope=$('scope');if(!exporting&&scope.parentElement.open&&performance.now()-lastScope>180){lastScope=performance.now();const sc=scope.getContext('2d',{willReadFrequently:true});sc.drawImage(canvas,0,0,160,64);const data=sc.getImageData(0,0,160,64).data;sc.fillStyle='#101014';sc.fillRect(0,0,160,64);sc.fillStyle='#c1efdd88';for(let i=0;i<data.length;i+=4){const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sc.fillRect(i/4%160,63-lum*63/255,1,1)}}
}
function samplePerformance(now){
 const active=locate(time),video=active&&asset(active.c)?.el;
 const quality=video?.getVideoPlaybackQuality?.(),presented=quality?quality.totalVideoFrames-quality.droppedVideoFrames:0;
 if(perfVideo!==video||!perfStart||now-perfStart>2500){perfStart=now;perfFrames=0;perfPresented=presented;perfVideo=video}perfFrames++;
 if(now-perfStart>=800){$('previewRate').textContent='Preview · '+Math.round((quality?Math.min(perfFrames,Math.max(0,presented-perfPresented)):perfFrames)*1000/(now-perfStart))+' fps';perfStart=now;perfFrames=0;perfPresented=presented}
 if(meterNode&&$('mixerDialog').open){meterNode.getFloatTimeDomainData(meterBuffer);let peak=0;for(const f of meterBuffer)peak=Math.max(peak,Math.abs(f));$('meter').value=peak}
}
function installMeter(){if(!audioCtx)return;if(!meterNode){meterNode=audioCtx.createAnalyser();meterBuffer=new Float32Array(meterNode.fftSize)}
 for(const a of assets)if(a.gain&&!a.metered){a.gain.connect(meterNode);a.metered=true}
}
let analysisQueue=Promise.resolve();
function analyze(a){if(!a.file||a.analyzing||!['audio','video'].includes(a.type))return;a.analyzing=true;
 analysisQueue=analysisQueue.then(async()=>{if(!assets.includes(a))return;
 if(a.type==='video'){Object.assign(a,await FrameExport.inspectSource(a.file));showSource()}
 a.peaks=await FrameExport.waveform(a.file,a.duration,()=>playing||exporting);if(assets.includes(a)&&!playing&&!exporting)paintWaves()
 }).catch(()=>{})
}
function showSource(){const c=current(),a=c&&asset(c);$('sourceInfo').textContent=a?.hdr?'HDR source · convert to SDR before export':a?.fps?'Source ≈ '+a.fps.toFixed(2)+' fps · SDR':a?.type==='video'?'Source fps · measuring':'Source · '+(a?.type||'—')}
function wave(parent,a,from,to){if(!a?.peaks||to<=from)return;const cv=document.createElement('canvas');cv.className='waveform';const width=Math.min(1800,Math.max(2,Math.ceil(parseFloat(parent.style.width)||120)));cv.width=width;cv.height=22;parent.append(cv);const g=cv.getContext('2d');g.fillStyle='#82b5aa';
 for(let x=0;x<width;x++){const start=Math.floor((from+(to-from)*x/width)/a.duration*a.peaks.length),end=Math.ceil((from+(to-from)*(x+1)/width)/a.duration*a.peaks.length);let peak=0;for(let i=start;i<Math.min(end,a.peaks.length);i++)peak=Math.max(peak,a.peaks[i]||0);g.fillRect(x,11-peak*11,1,Math.max(1,peak*22))}}
function paintWaves(){document.querySelectorAll('.waveform').forEach(n=>n.remove());Array.from($('track').children).forEach((b,i)=>{if(clips[i])wave(b,asset(clips[i]),clips[i].in,clips[i].out)});
 const buttons=Array.from($('audioLane').children);audioEdits.filter(e=>e.start<total()).forEach((e,i)=>{if(buttons[i]&&e.assetId)wave(buttons[i],assets.find(a=>a.id===e.assetId),e.offset||0,(e.offset||0)+e.end-e.start)})}
function lane(id,list,label){const el=$(id);el.replaceChildren();el.style.width=Math.max(300,total()*+$('zoom').value)+'px';for(const item of list){const b=document.createElement('button');b.textContent=label(item);b.style.left=item.start*+$('zoom').value+'px';b.style.width=Math.max(8,(item.end-item.start)*+$('zoom').value)+'px';b.onclick=()=>openLayers(item);el.append(b)}}
function refreshStudio(){
 showSource();$('timelineFps').value=fps();for(const a of assets)analyze(a);
 for(const [id,v] of layerPlayers)if(!studio.layers.some(l=>l.id===id)){v.pause();v.removeAttribute('src');v.load();layerPlayers.delete(id)}
 lane('layerLane',studio.layers,l=>'V2 · '+(assets.find(a=>a.id===l.assetId)?.name||'Cutaway'));lane('captionLane',studio.captions,c=>'CC · '+c.text);
 const c=current();if(c){const p=pictureAt(c,c.in+(locate(time)?.local||0)*c.speed);for(const key of Object.keys(pictureDefaults))$(key).value=Number(p[key].toFixed(2));$('keyCount').textContent=(c.keys?.length||0)+' keyframes'}
 Array.from($('track').children).forEach((b,index)=>{if(!clips[index])return;for(const side of ['in','out']){const grip=document.createElement('span');grip.className='grip '+side;grip.title='Drag to trim '+side;b.append(grip);grip.onpointerdown=e=>{
 e.preventDefault();e.stopPropagation();pause();const x=e.clientX,c=clips[index],start=c[side],limit=asset(c).type==='video'?asset(c).duration:36000;
 b.draggable=false;grip.setPointerCapture(e.pointerId);
 grip.onpointerup=ev=>{ev.stopPropagation();const delta=snapped((ev.clientX-x)/+$('zoom').value)*c.speed;b.draggable=true;if(!delta)return;checkpoint();c[side]=side==='in'?bounded(start+delta,0,c.out-.05):bounded(start+delta,c.in+.05,limit);selected=c.id;seek(time);refresh()};grip.onpointercancel=()=>b.draggable=true
 };grip.onclick=e=>e.stopPropagation()}});paintWaves();changed()
}

function openLayers(item){
 pause();captionId=item?.id||null;const options=assets.filter(a=>a.type==='video'||a.type==='image');$('layerAsset').replaceChildren(...options.map(a=>new Option(a.name,a.id)));
 $('rangeIn').value=item?.start??+time.toFixed(3);$('rangeOut').value=item?.end??+Math.min(total(),time+3).toFixed(3);
 $('captionText').value=item?.text||'';$('heading').value=studio.heading;$('ranks').value=studio.ranks;
 $('captionColor').value=studio.style.color;$('captionPos').value=studio.style.position;$('captionSize').value=studio.style.size;
 if(item?.assetId){$('layerAsset').value=item.assetId;$('layerFit').value=item.fit}
 $('events').replaceChildren();for(const e of [...studio.layers,...studio.captions]){const row=document.createElement('div');row.className='controls';const edit=document.createElement('button');edit.textContent=frameCode(e.start)+' · '+(e.text||'Cutaway');edit.onclick=()=>openLayers(e);const del=document.createElement('button');del.textContent='Remove';del.onclick=()=>{checkpoint();studio.layers=studio.layers.filter(l=>l.id!==e.id);studio.captions=studio.captions.filter(l=>l.id!==e.id);refresh();openLayers()};row.append(edit,del);$('events').append(row)}
 if(!$('layersDialog').open)$('layersDialog').showModal()
}
function range(){const start=snapped(+$('rangeIn').value),end=snapped(+$('rangeOut').value);if(!Number.isFinite(start+end)||start<0||end<=start||end>total()+.001)throw Error('Choose a range within the sequence');return {start,end}}
function readStyle(){return {position:$('captionPos').value,color:$('captionColor').value,size:bounded(+$('captionSize').value,1,15)}}
action('layerTools',()=>openLayers());action('closeLayers',()=>$('layersDialog').close());
action('addLayer',()=>{const {start,end}=range(),a=assets.find(a=>a.id===$('layerAsset').value);if(!a)throw Error('Import a video or image first');
 if(a.type==='video'&&end-start>a.duration+.001)throw Error('Cutaway is shorter than this range');
 if(studio.layers.some(l=>l.id!==captionId&&start<l.end&&end>l.start))throw Error('Choose an empty interval on V2');
 checkpoint();const l=studio.layers.find(l=>l.id===captionId)||{id:uid()};if(!studio.layers.includes(l))studio.layers.push(l);Object.assign(l,{assetId:a.id,start,end,fit:$('layerFit').value});const old=layerPlayers.get(l.id);if(old){old.pause();old.removeAttribute('src');old.load();layerPlayers.delete(l.id)}refresh();openLayers(l)
});
action('addCaption',()=>{const span=range(),text=$('captionText').value.trim();if(!text)throw Error('Enter caption text');checkpoint();const caption=studio.captions.find(e=>e.id===captionId)||{id:uid()};if(!studio.captions.includes(caption))studio.captions.push(caption);Object.assign(caption,span,{text});studio.style=readStyle();refresh();openLayers(caption)});
action('saveLayout',()=>{checkpoint();studio.heading=$('heading').value;studio.ranks=$('ranks').value;studio.style=readStyle();refresh();toast('Layout saved. Use Projects → Use as episode template to create a copy.')});
action('importSrt',()=>$('srtFile').click());$('srtFile').onchange=async e=>{try{const raw=await e.target.files[0].text(),items=[];
 for(const block of raw.trim().replace(/\r/g,'').split(/\n\s*\n/)){const lines=block.split('\n');if(/^\d+$/.test(lines[0]))lines.shift();const match=lines.shift()?.match(/^(\d+):(\d+):(\d+)[,.](\d{3})\s*-->\s*(\d+):(\d+):(\d+)[,.](\d{3})/);if(!match||!lines.length)throw Error('Invalid SRT cue');const sec=i=>+match[i]*3600+(+match[i+1])*60+(+match[i+2])+(+match[i+3])/1000;const start=sec(1),end=sec(5);if(end<=start||end>total()+.001)throw Error('Caption timing exceeds the sequence');items.push({id:uid(),start,end,text:lines.join('\n')})}
 checkpoint();studio.captions.push(...items);refresh();openLayers()
 }catch(err){toast(err.message)}finally{e.target.value=''}};
function stamp(t){const n=Math.round(t*1000);return [Math.floor(n/3600000),Math.floor(n/60000)%60,Math.floor(n/1000)%60].map(n=>String(n).padStart(2,'0')).join(':')+','+String(n%1000).padStart(3,'0')}
action('exportSrt',()=>downloadFile(new Blob([studio.captions.slice().sort((a,b)=>a.start-b.start).map((e,i)=>(i+1)+'\n'+stamp(e.start)+' --> '+stamp(e.end)+'\n'+e.text+'\n').join('\n')],{type:'text/plain'}),'captions.srt'));
action('mixerTools',()=>{for(const [k,v] of Object.entries(studio.mix)){if(typeof v==='boolean')$(k).checked=v;else $(k).value=v}installMeter();$('mixerDialog').showModal()});action('closeMixer',()=>$('mixerDialog').close());
for(const k of Object.keys(studio.mix))$(k).onchange=()=>{checkpoint();studio.mix[k]=typeof studio.mix[k]==='boolean'?$(k).checked:bounded(+$(k).value,0,100);refresh()};
function editPicture(keyframe){const c=current();if(!c)return;pause();const value={};for(const key of Object.keys(pictureDefaults)){const el=$(key);if(!el.checkValidity())return toast('Check transform range');value[key]=+el.value}
 checkpoint();if(keyframe||c.keys?.length){const f=locate(time);const t=f?.c.id===c.id?c.in+f.local*c.speed:c.in;c.keys=(c.keys||[]).filter(k=>Math.abs(k.t-t)>.0001);c.keys.push({t,value});c.keys.sort((a,b)=>a.t-b.t)}else c.picture=value;refresh()}
for(const key of Object.keys(pictureDefaults))$(key).onchange=()=>editPicture(false);action('keyframe',()=>editPicture(true));
action('replaceMedia',()=>{if(!current())throw Error('Select a clip first');$('replacement').click()});$('replacement').onchange=async e=>{try{const c=current(),a=await loadFile(e.target.files[0]);if(a.type==='audio')throw Error('Choose picture media');if(a.type==='video'&&a.duration+.001<c.out){URL.revokeObjectURL(a.url);throw Error('Timing conflict: replacement must cover source out point '+format(c.out))}
 pause();checkpoint();assets.push(a);c.assetId=a.id;c.name=a.name;mediaList();seek(time);refresh()
 }catch(err){toast(err.message)}finally{e.target.value=''}};
function step(n){seek((Math.round(time*fps())+n)/fps())}
$('backFrame').onclick=()=>step(-1);$('nextFrame').onclick=()=>step(1);$('frameRate').value='60';$('frameRate').onchange=clock;$('snap').checked=true;
$('ruler').onclick=e=>seek(snapped((e.clientX-$('ruler').getBoundingClientRect().left)/+$('zoom').value));$('scrub').oninput=e=>seek(snapped(+e.target.value));
addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1)}});
$('timelineFps').onchange=()=>{checkpoint();studio.fps=+$('timelineFps').value;refresh()};new ResizeObserver(()=>{if(!playing&&!exporting){size();const f=locate(time);if(f)draw(f.c,f.local)}}).observe(canvas.parentElement);
size();refresh();
