'use strict';
let lyricsPopup=null,lyricsOrigin='',lyricsNonce='';
function openLyricsLibrary(){
 let saved=localStorage.getItem('dmhtLyricsLibraryUrl')||'';
 let entered=prompt('Enter your private Lyrics Library URL (for example https://your-library.onrender.com):',saved);if(!entered)return;
 let url;try{url=new URL(entered);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error();if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error()}catch(e){alert('Please enter the HTTPS home address of your library, without a path.');return}
 localStorage.setItem('dmhtLyricsLibraryUrl',url.origin);lyricsOrigin=url.origin;lyricsNonce=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
 const u=new URL('/',lyricsOrigin);u.hash=new URLSearchParams({studioOrigin:location.origin,nonce:lyricsNonce}).toString();lyricsPopup=window.open(u.toString(),'dmhtLyricsLibrary','width=1100,height=800');if(!lyricsPopup)alert('Please allow popups for Studio and try again.');else lyricsPopup.focus();
}
window.addEventListener('message',event=>{
 if(!lyricsPopup||event.source!==lyricsPopup||event.origin!==lyricsOrigin||!event.data||event.data.type!=='DMHT_LYRICS_SEND'||event.data.nonce!==lyricsNonce||typeof event.data.lyrics!=='string'||event.data.lyrics.length>200000)return;
 const field=document.getElementById('itemLyricsInput');if(!field||document.getElementById('formLyricsGroup').offsetParent===null){alert('Open the song editor in Studio first, then send the lyrics again.');return}
 if(!confirm('Replace the lyrics in the song currently open in Studio with “'+String(event.data.title||'selected Pad').slice(0,120)+'”? Review and save the song afterwards.'))return;
 field.value=event.data.lyrics;field.dispatchEvent(new Event('input',{bubbles:true}));window.focus();alert('Lyrics added to the open song editor. Review and click Save in Studio.');
});
