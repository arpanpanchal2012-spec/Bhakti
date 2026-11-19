'use strict';
// Online room and media controls share the host dashboard with the projector.
let liveRoom=null, liveState=null, showLive=false, mediaURL=null, mediaItem=null, introTimer=null, stageVideoURL=null;
try{liveRoom=JSON.parse(sessionStorage.getItem('dmht-live-room')||'null')}catch(e){}
const audienceMode=()=>document.body.classList.contains('audience-window');
async function livePost(action,body){const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j}
function liveError(text){const e=document.getElementById('onlineStatus');if(e)e.textContent=text}
async function createOnlineRoom(){try{liveRoom=await livePost('create',{});sessionStorage.setItem('dmht-live-room',JSON.stringify(liveRoom));showLive=true;updateRoomInfo();await pollLive();sendLive();}catch(e){liveError('Could not create room: '+e.message)}}
function updateRoomInfo(){const el=document.getElementById('onlineRoomInfo');if(el)el.textContent=liveRoom?'Room '+liveRoom.room+' · '+location.origin+'/buzzer/?room='+encodeURIComponent(liveRoom.room):'No room created.'}
async function copyOnlineLink(){if(!liveRoom)return liveError('Create a room first.');let link=location.origin+'/buzzer/?room='+encodeURIComponent(liveRoom.room);try{await navigator.clipboard.writeText(link);liveError('Participant link copied. Paste it in Zoom chat.')}catch(e){prompt('Copy this participant link:',link)}}
async function liveAction(action){if(!liveRoom)return liveError('Create a room first.');try{await livePost(action,{room:liveRoom.room,host:liveRoom.host});showLive=true;await pollLive();sendLive()}catch(e){liveError(e.message)}}
openBuzzersForRound=()=>liveAction('open');lockBuzzersForRound=()=>liveAction('lock');resetBuzzersForRound=()=>{if(confirm('Reset the round and clear the ranking?'))liveAction('reset')};
function toggleOnlineProjection(){showLive=!showLive;drawLive();sendLive()}
function sendLive(){broadcastState('LIVE_ONLINE',{state:liveState,visible:showLive})}
async function pollLive(){if(!liveRoom||audienceMode())return;try{const r=await fetch('/api/state?room='+encodeURIComponent(liveRoom.room),{cache:'no-store'});let s=await r.json();if(!r.ok)throw Error(s.error);liveState=s;liveError((s.status==='open'?'Buzzers open':'Buzzers locked')+' · '+s.participants.length+' joined · '+s.buzzes.length+' buzzed');drawLive();sendLive()}catch(e){liveError('Connection problem: '+e.message)}}
const oldIncoming=handleIncomingSync;handleIncomingSync=function(msg){if(msg?.type==='LIVE_ONLINE'){liveState=msg.payload.state;showLive=msg.payload.visible;drawLive();return}if(msg?.type==='LYRIC_ONLY'&&audienceMode()){if(currentStageIndex===msg.payload.index){currentLyricLine=msg.payload.line;updateLyricText()}return}if(msg?.type==='MEDIA_SYNC'&&audienceMode()){let v=document.querySelector('#presentationStage .stage-video');if(v){if(Math.abs(v.currentTime-msg.payload.time)>0.7)v.currentTime=msg.payload.time;if(msg.payload.playing&&v.paused)v.play().catch(()=>{});else if(!msg.payload.playing&&!v.paused)v.pause()}return}oldIncoming(msg)};
function drawLive(){let host=document.getElementById('onlineHostRanking');let participants=liveState?.participants||[],buzzes=liveState?.buzzes||[];let list=buzzes.length?buzzes.map(x=>`<li><b>#${x.rank}</b> ${escapeHtml(x.name)}</li>`).join(''):'<li>No buzzes yet</li>';let names=participants.length?participants.map(n=>`<span class="live-name">${escapeHtml(n)}</span>`).join(''):'<span>No participants joined yet</span>';if(host)host.innerHTML=`<p><b>Joined (${participants.length}):</b> ${participants.map(escapeHtml).join(', ')||'None yet'}</p><p><b>Ranking:</b></p><ol>${list}</ol>`;let stage=document.getElementById('presentationStage');if(!stage)return;let overlay=document.getElementById('onlineProjection');if(!showLive||!liveState){if(overlay)overlay.remove();return}if(!overlay){overlay=document.createElement('div');overlay.id='onlineProjection';stage.appendChild(overlay)}overlay.innerHTML=`<div class="live-panel"><h2>Participant buzzer</h2><p>${liveState.status==='open'?'BUZZERS OPEN':'BUZZERS LOCKED'} · ${participants.length} joined</p><div class="live-names">${names}</div><h3>Buzz ranking</h3><ol>${list}</ol></div>`}
const priorRender=renderStageContent;renderStageContent=async function(){let stage=document.getElementById('presentationStage'),item=appData.items[currentStageIndex];if(!stage)return;if(!isBlackout&&item?.type==='song'&&stage.dataset.songId===item.id&&stage.querySelector('.lyrics-overlay')){let lines=stage.querySelectorAll('.lyrics-overlay .lyric-line, .lyrics-overlay .lyric-next');if(lines[0])lines[0].textContent=item.lyrics?.[currentLyricLine]||'';if(lines[1])lines[1].textContent=item.lyrics?.[currentLyricLine+1]||'';drawLive();return}stage.dataset.songId='';await priorRender();if(item?.type==='song'&&!isBlackout){stage.dataset.songId=item.id;updateLyricText()}drawLive()};
renderSongStage=async function(stage,item){let blob=await getMediaBlob(item.id);let url=blob?URL.createObjectURL(blob):'';if(stageVideoURL)URL.revokeObjectURL(stageVideoURL);stageVideoURL=url;let current=item.lyrics?.[currentLyricLine]||'',next=item.lyrics?.[currentLyricLine+1]||'';stage.innerHTML=`${url?`<video class="stage-video" src="${url}" muted playsinline loop></video>`:''}<div class="stage-content song-intro" style="margin-bottom:90px"><h2 style="font-size:2.6rem;color:white">${escapeHtml(item.title)}</h2><p style="color:#ffd700;font-size:1.4rem">${escapeHtml(item.singer||'')}</p></div><div class="lyrics-overlay lyrics-style-${Number(item.lyricStyle)||1}" style="--lyric-size:${Number(item.lyricSize)||52}px;--glow-color:${/^#[0-9a-f]{6}$/i.test(item.glowColor||'')?item.glowColor:'#ff00ff'}"><div class="lyric-line">${escapeHtml(current)}</div><div class="lyric-next" ${Number(item.lyricStyle)===9?'':'hidden'}>${escapeHtml(next)}</div></div>`;clearTimeout(introTimer);introTimer=setTimeout(()=>{let intro=stage.querySelector('.song-intro');if(intro)intro.style.display='none'},Math.max(0,Math.min(30,Number(item.introSeconds ?? 5)))*1000);/* Keep the blob URL valid for the entire playback, not just until metadata loads. */};
renderBuzzerStage=function(stage,item){stage.innerHTML=`<div class="stage-content"><h2 class="stage-quiz-question">${escapeHtml(item.title)}</h2>${quizAnswerRevealed?`<div class="quiz-answer-text">${escapeHtml(item.mysteryTitle||'No answer entered')}</div>${item.filmName||item.originalSinger?`<p>${escapeHtml([item.filmName,item.originalSinger].filter(Boolean).join(' · '))}</p>`:''}`:''}</div>`};
const oldSelect=selectAndPresentItem;selectAndPresentItem=function(i){if(i<0||i>=appData.items.length)return;if(!audienceMode()){showLive=!!(appData.items[i].enableBuzzer||appData.items[i].type==='buzz');sendLive()}oldSelect(i);loadHostMedia(i)};
const oldBroadcastStage=broadcastStageState;broadcastStageState=function(){if(!audienceMode())oldBroadcastStage()};
let mediaGeneration=0;async function loadHostMedia(i){if(audienceMode())return;let generation=++mediaGeneration,item=appData.items[i],slot=document.getElementById('hostMediaSlot'),label=document.getElementById('hostMediaLabel');if(!slot||!label)return;slot.replaceChildren();if(mediaURL){URL.revokeObjectURL(mediaURL);mediaURL=null}mediaItem=null;if(!item){label.textContent='Select a segment.';return}let blob=await getMediaBlob(item.id);if(generation!==mediaGeneration)return;if(!blob){label.textContent=item.mediaFileName?'Attached file unavailable. Edit the segment and reattach it.':'No audio or video attached to this segment.';return}if(!blob.type.startsWith('audio/')&&!blob.type.startsWith('video/')){label.textContent='This attachment is not audio or video.';return}mediaURL=URL.createObjectURL(blob);let m=document.createElement(blob.type.startsWith('video/')?'video':'audio');m.controls=true;m.src=mediaURL;m.style.maxWidth='100%';if(m.tagName==='VIDEO')m.style.maxHeight='180px';slot.appendChild(m);document.getElementById('mediaLoop').checked=item.type==='song';m.loop=document.getElementById('mediaLoop').checked;document.getElementById('mediaLoop').onchange=e=>m.loop=e.target.checked;label.textContent='Attached: '+(item.mediaFileName||blob.name||'media');mediaItem=m;function sync(){if(item.type!=='song')return;const packet={playing:!m.paused,time:m.currentTime};let v=document.querySelector('#presentationStage .stage-video');if(v){if(Math.abs(v.currentTime-m.currentTime)>0.7)v.currentTime=m.currentTime;if(packet.playing&&v.paused)v.play().catch(()=>{});else if(!packet.playing&&!v.paused)v.pause()}broadcastState('MEDIA_SYNC',packet)}for(const ev of ['play','pause','seeked','timeupdate'])m.addEventListener(ev,sync)}
window.addEventListener('DOMContentLoaded',()=>{if(!audienceMode()){updateRoomInfo();loadHostMedia(currentStageIndex);setInterval(pollLive,1200);pollLive()}});

// Lyrics are updated independently of the video DOM and media controls.
function updateLyricText(){
  const item=appData.items[currentStageIndex];
  if(!item||item.type!=='song')return;
  const stage=document.getElementById('presentationStage');
  const overlay=stage?.querySelector('.lyrics-overlay');
  if(!overlay)return;
  const first=overlay.querySelector('.lyric-line');
  const second=overlay.querySelector('.lyric-next');
  if(first)first.textContent=item.lyrics?.[currentLyricLine]||'';
  if(second)second.textContent=item.lyrics?.[currentLyricLine+1]||'';
}
const previousNextLyric=nextLyricLine;
nextLyricLine=function(){
  const item=appData.items[currentStageIndex];
  if(item?.type!=='song')return previousNextLyric();
  if(document.activeElement && document.activeElement.tagName==='VIDEO')document.activeElement.blur();
  if(currentLyricLine<(item.lyrics?.length||0)-1){
    currentLyricLine++;
    updateLyricText();
    if(!audienceMode())broadcastState('LYRIC_ONLY',{index:currentStageIndex,line:currentLyricLine});
  }
};
prevLyricLine=function(){
  const item=appData.items[currentStageIndex];
  if(item?.type==='song'&&currentLyricLine>0){
    if(document.activeElement && document.activeElement.tagName==='VIDEO')document.activeElement.blur();
    currentLyricLine--;
    updateLyricText();
    if(!audienceMode())broadcastState('LYRIC_ONLY',{index:currentStageIndex,line:currentLyricLine});
  }
};
