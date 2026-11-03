'use strict';
const initialStudio=()=>({layers:[],captions:[],heading:'',ranks:'',style:{color:'#ffffff',position:'bottom',size:5},mix:{voice:100,music:100,voiceMute:false,musicMute:false,voiceSolo:false,musicSolo:false}});
let studio=initialStudio(), projectId=uid(),persisted='',saveTimer,saveQueue=Promise.resolve(),switching=false;
const storedFiles=new Map();
const libraryDB=new Promise((resolve,reject)=>{
 const open=indexedDB.open('frame-studio-library',1);
 open.onupgradeneeded=()=>{for(const name of ['projects','media'])open.result.createObjectStore(name)};
 open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
});
function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function record(){return {version:2,id:projectId,name:$('projectName').value||'Untitled film',ratio:$('ratio').value,clips,audioEdits,studio,assets:assets.map(({id,name,type,color,duration,file})=>({id,name,type,color,duration,bytes:file?.size,mime:file?.type}))}}
async function saveNow(){
 clearTimeout(saveTimer);
 const snapshot=structuredClone(record()),signature=JSON.stringify(snapshot),files=assets.filter(a=>a.file).map(a=>[a.id,a.file]);
 const task=async()=>{
  const db=await libraryDB,tx=db.transaction(['projects','media'],'readwrite');
  const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Storage unavailable'))});
  for(const [key,file] of files)if(storedFiles.get(key)!==file)tx.objectStore('media').put(file,key);
  tx.objectStore('projects').put({...snapshot,updated:Date.now()},snapshot.id);
  await done;for(const [key,file] of files)storedFiles.set(key,file);
  if(projectId===snapshot.id){persisted=signature;$('saveState').textContent='Saved locally';localStorage.setItem('frame-last',projectId)}
 };
 const result=saveQueue.catch(()=>{}).then(task);saveQueue=result;
 try{await result}catch(e){$('saveState').textContent='Save failed · download a backup';throw e}
}
function changed(){if(switching||JSON.stringify(record())===persisted)return;clearTimeout(saveTimer);$('saveState').textContent='Saving…';saveTimer=setTimeout(()=>saveNow().catch(e=>toast(e.message)),450)}
async function hydrate(data,fileFor,fresh=false){
 if(!data||!Array.isArray(data.clips)||!Array.isArray(data.assets))throw Error('Invalid project');
 const ready=[];for(const meta of data.assets){if(meta.type==='demo'){ready.push(meta);continue}const file=await fileFor(meta);if(!file)throw Error('Missing media: '+meta.name);ready.push(await loadFile(file,meta.id))}
 if(data.clips.some(c=>!ready.some(a=>a.id===c.assetId)||!(c.out>c.in)||!(c.speed>0)))throw Error('Invalid clip in project');
 pause();clearOverlayPlayers();for(const player of layerPlayers.values()){player.removeAttribute('src');player.load()}layerPlayers.clear();for(const a of assets){a.source?.disconnect();a.gain?.disconnect();if(a.url)URL.revokeObjectURL(a.url)}
 switching=true;assets=ready;projectId=fresh?uid():data.id||uid();clips=data.clips;audioEdits=data.audioEdits||[];studio={...initialStudio(),...data.studio};selected=clips[0]?.id;time=0;history=[];future=[];
 $('ratio').value=data.ratio||'9:16';$('projectName').value=data.name||'Untitled film';size();mediaList();refresh();seek(0);switching=false;await saveNow()
}
async function openSaved(id,copy=false){
 const db=await libraryDB,data=await requestValue(db.transaction('projects').objectStore('projects').get(id));
 if(!data)throw Error('Project unavailable');if(copy)data.name+=' · New episode';
 await hydrate(data,m=>requestValue(db.transaction('media').objectStore('media').get(m.id)),copy)
}
function downloadFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function backup(){const header=new TextEncoder().encode(JSON.stringify(record())),length=new ArrayBuffer(4);new DataView(length).setUint32(0,header.length);return new Blob([length,header,...assets.filter(a=>a.file).map(a=>a.file)])}
async function restoreBackup(file){
 const length=new DataView(await file.slice(0,4).arrayBuffer()).getUint32(0);if(length>file.size-4)throw Error('Invalid backup');
 const data=JSON.parse(await file.slice(4,4+length).text());let offset=4+length;
 const files=new Map();for(const m of data.assets){if(m.type==='demo')continue;const end=offset+m.bytes;if(!Number.isSafeInteger(end)||end>file.size)throw Error('Incomplete backup');files.set(m.id,new File([file.slice(offset,end)],m.name,{type:m.mime}));offset=end}
 const ids=new Map(data.assets.map(m=>[m.id,uid()]));const restored=new Map();
 for(const m of data.assets){const id=ids.get(m.id);restored.set(id,files.get(m.id));m.id=id}
 for(const item of [...data.clips,...(data.audioEdits||[]),...(data.studio?.layers||[])])if(item.assetId)item.assetId=ids.get(item.assetId);
 await hydrate(data,m=>restored.get(m.id),true)
}
async function projects(){
 pause();if(assets.length||clips.length)await saveNow();const db=await libraryDB;
 const rows=await requestValue(db.transaction('projects').objectStore('projects').getAll());$('projectList').replaceChildren();
 for(const row of rows.sort((a,b)=>b.updated-a.updated))$('projectList').add(new Option(row.name+' · '+new Date(row.updated).toLocaleString(),row.id));
 const legacy=await database();const old=await requestValue(legacy.transaction('projects').objectStore('projects').get('latest'));legacy.close();
 if(old)$('projectList').add(new Option('Original saved project · migrate a copy','legacy'));
 $('projectDialog').showModal()
}
async function chooseProject(copy){
 const id=$('projectList').value;if(!id)throw Error('Choose a project first');
 if(id==='legacy'){const db=await database();const old=await requestValue(db.transaction('projects').objectStore('projects').get('latest'));db.close();await hydrate(old,m=>m.file,true)}else await openSaved(id,copy);
 $('projectDialog').close()
}
function action(id,fn){$(id).onclick=async()=>{try{await fn()}catch(e){toast(e.message)}}}
action('save',saveNow);action('restore',projects);action('openChoice',()=>chooseProject(false));action('copyChoice',()=>chooseProject(true));
action('newProject',async()=>{await hydrate({name:'New episode',ratio:'9:16',assets:[],clips:[]},()=>null,true);$('projectDialog').close()});
action('backupProject',()=>downloadFile(backup(),record().name+'.frame'));action('restoreBackup',()=>$('backupFile').click());
$('backupFile').onchange=async e=>{try{await restoreBackup(e.target.files[0]);$('projectDialog').close()}catch(err){toast(err.message)}finally{e.target.value=''}};
$('projectName').oninput=changed;$('closeProjects').onclick=()=>$('projectDialog').close();
persisted=JSON.stringify(record());
if(localStorage.getItem('frame-last'))$('saveState').textContent='Recovery available in Projects';
document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer&&JSON.stringify(record())!==persisted)saveNow().catch(e=>toast(e.message))});
