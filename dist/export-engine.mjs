import {Input,ALL_FORMATS,BlobSource,Output,BufferTarget,Mp4OutputFormat,WebMOutputFormat,CanvasSource,VideoSampleSink,AudioBufferSink,AudioSampleSource,AudioSample,Quality,canEncodeVideo,canEncodeAudio} from './vendor/mediabunny.mjs';
import {SoundTouch} from './vendor/soundtouch.mjs';
const RATE=48000;
const yieldUI=()=>new Promise(r=>setTimeout(r,0));
export async function renderFilm({canvas,clips,assets,frameRate=30,draw,isCancelled=()=>false,onProgress=()=>{}}){
 const check=()=>{if(isCancelled())throw new DOMException('Export cancelled.','AbortError')};
 if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')throw Error('Accurate export needs WebCodecs. Open this editor in a current Chrome or Edge browser.');
 const duration=c=>(c.out-c.in)/c.speed,total=clips.reduce((n,c)=>n+duration(c),0);
 const inputs=new Map();let output,videoSource,audioSource;
 try{
  onProgress(0,'Checking video and audio tracks…');
  for(const c of clips){check();const a=assets.find(a=>a.id===c.assetId);if(!a)throw Error('Missing media for '+c.name);if(a.type!=='video'||inputs.has(a.id))continue;
   const input=new Input({formats:ALL_FORMATS,source:new BlobSource(a.file)});const entry={input};inputs.set(a.id,entry);
   entry.video=await input.getPrimaryVideoTrack();entry.audio=await input.getPrimaryAudioTrack();
   if(!entry.video||!await entry.video.canDecode())throw Error('This browser cannot decode the video in '+a.name+'. Convert it to H.264 MP4 first.');
   const config=await entry.video.getDecoderConfig();
   if(['pq','hlg','smpte2084','arib-std-b67'].includes(config?.colorSpace?.transfer))throw Error(a.name+' contains HDR colour. This editor exports SDR; use an SDR copy to avoid washed-out colours.');
   if(entry.audio&&clips.some(c=>c.assetId===a.id&&c.volume>0)&&!await entry.audio.canDecode())throw Error('This browser cannot decode the audio in '+a.name+'. Use a copy with AAC or Opus audio.');
  }
  const hasAudio=clips.some(c=>inputs.get(c.assetId)?.audio&&c.volume>0);
  const bitrate=Math.min(100e6,Math.max(16e6,canvas.width*canvas.height*frameRate*.32));
  const quality=new Quality({bitrate});
  let videoCodec,audioCodec,format,extension;
  if(await canEncodeVideo('avc',{width:canvas.width,height:canvas.height,frameRate,quality,latencyMode:'quality'})&&(!hasAudio||await canEncodeAudio('aac',{sampleRate:RATE,numberOfChannels:2,quality:new Quality({bitrate:256000})}))){videoCodec='avc';audioCodec='aac';format=new Mp4OutputFormat({fastStart:'in-memory'});extension='mp4'}
  else if(await canEncodeVideo('vp9',{width:canvas.width,height:canvas.height,frameRate,quality,latencyMode:'quality'})&&(!hasAudio||await canEncodeAudio('opus',{sampleRate:RATE,numberOfChannels:2,quality:new Quality({bitrate:256000})}))){videoCodec='vp9';audioCodec='opus';format=new WebMOutputFormat();extension='webm'}
  else throw Error('No compatible encoder at this resolution. Try 1080p / 30 fps in Chrome or Edge.');
  const target=new BufferTarget();output=new Output({format,target});
  videoSource=new CanvasSource(canvas,{codec:videoCodec,quality,latencyMode:'quality',keyFrameInterval:2});output.addVideoTrack(videoSource,{frameRate});
  if(hasAudio){audioSource=new AudioSampleSource({codec:audioCodec,quality:new Quality({bitrate:256000})});output.addAudioTrack(audioSource)}
  await output.start();let base=0,frameNumber=0;
  for(let index=0;index<clips.length;index++){
   check();const c=clips[index],entry=inputs.get(c.assetId),end=base+duration(c);
   if(hasAudio){onProgress(base/total*100,'Rendering audio · clip '+(index+1)+' of '+clips.length);await renderClipAudio({c,entry,base,end,audioSource,check});}
   const firstFrame=frameNumber,lastFrame=Math.ceil(end*frameRate-1e-8);
   function* timestamps(){for(let f=firstFrame;f<lastFrame;f++)yield Math.min(c.out-1e-7,c.in+Math.max(0,f/frameRate-base)*c.speed)}
   const iterator=entry?new VideoSampleSink(entry.video).samplesAtTimestamps(timestamps()):null;
   try{
    for(;frameNumber<lastFrame;frameNumber++){
     check();const t=frameNumber/frameRate,local=Math.max(0,t-base);let sample;
     if(iterator){const next=await iterator.next();sample=next.value;if(!sample)throw Error('Missing decoded frame in '+c.name+' at '+(c.in+local*c.speed).toFixed(3)+'s.');}
     try{draw(c,local,sample);await videoSource.add(t,Math.min(1/frameRate,total-t));}finally{sample?.close()}
     if(frameNumber%8===0){onProgress(Math.min(99,t/total*100),'Rendering frames · clip '+(index+1)+' of '+clips.length+' · '+Math.round(t/total*100)+'%');await yieldUI()}
    }
   }finally{await iterator?.return()}
   base=end;
  }
  check();videoSource.close();audioSource?.close();onProgress(99,'Finalising video and audio…');await output.finalize();check();
  return {blob:new Blob([target.buffer],{type:extension==='mp4'?'video/mp4':'video/webm'}),extension,fps:frameRate,audioLabel:hasAudio?'48 kHz stereo':'No source audio'};
 }catch(e){if(output)await output.cancel().catch(()=>{});throw e}finally{for(const {input} of inputs.values())input.dispose()}
}
async function renderClipAudio({c,entry,base,end,audioSource,check}){
 const startSample=Math.round(base*RATE),endSample=Math.round(end*RATE),wanted=endSample-startSample;
 let written=0;
 async function emit(data){check();const frames=Math.min(data.length/2,wanted-written);if(frames<=0)return;
  data=data.subarray(0,frames*2);const gain=c.volume/100;
  for(let i=0;i<frames;i++){const position=written+i;const edge=Math.min(1,position/96,(wanted-1-position)/96);data[2*i]*=gain*Math.max(0,edge);data[2*i+1]*=gain*Math.max(0,edge)}
  const sample=new AudioSample({data,format:'f32',numberOfChannels:2,sampleRate:RATE,timestamp:(startSample+written)/RATE});
  try{await audioSource.add(sample)}finally{sample.close()}written+=frames;
 }
 if(!entry?.audio||c.volume===0){while(written<wanted){await emit(new Float32Array(Math.min(16384,wanted-written)*2));await yieldUI()}return}
 // Decode only the selected source range. Block rendering keeps decoded audio memory bounded.
 const iterator=new AudioBufferSink(entry.audio).buffers(c.in,c.out);let next=await iterator.next();
 const stretch=c.speed===1?null:new SoundTouch();if(stretch){stretch.stretch.setParameters(RATE,0,0,8);stretch.tempo=c.speed;stretch.pitch=1}
 async function drain(){while(stretch.outputBuffer.frameCount>0&&written<wanted){const n=Math.min(16384,stretch.outputBuffer.frameCount,wanted-written),data=new Float32Array(n*2);stretch.outputBuffer.receiveSamples(data,n);await emit(data)}}
 try{
  const sourceFrames=Math.round((c.out-c.in)*RATE);
  for(let offset=0;offset<sourceFrames;offset+=RATE*2){check();const count=Math.min(RATE*2,sourceFrames-offset),start=c.in+offset/RATE,stop=start+count/RATE;
   const offline=new OfflineAudioContext(2,count,RATE);
   while(!next.done&&next.value.timestamp<stop){check();const {buffer,timestamp}=next.value,bufferEnd=timestamp+buffer.duration;
    if(bufferEnd>start){const from=Math.max(start,timestamp),to=Math.min(stop,bufferEnd);if(to>from){const node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);node.start(from-start,from-timestamp,to-from)}}
    if(bufferEnd>stop+1e-9)break;next=await iterator.next();
   }
   const buffer=await offline.startRendering(),l=buffer.getChannelData(0),r=buffer.getChannelData(1),data=new Float32Array(count*2);for(let i=0;i<count;i++){data[2*i]=l[i];data[2*i+1]=r[i]}
   if(stretch){stretch.inputBuffer.putSamples(data,0,count);stretch.process();await drain()}else await emit(data);
   await yieldUI();
  }
  if(stretch){for(let i=0;i<8&&written<wanted;i++){check();stretch.inputBuffer.putSamples(new Float32Array(16384*2),0,16384);stretch.process();await drain()}}
  while(written<wanted){await emit(new Float32Array(Math.min(16384,wanted-written)*2));await yieldUI()}
 }finally{await iterator.return()}
}

