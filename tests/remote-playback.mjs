import assert from 'node:assert/strict';
import {remotePlayback} from '../web/remote-playback.js';
let blocked=true,calls=0,live=true;const audio={srcObject:{},muted:true,setAttribute(){},play(){calls++;return blocked?Promise.reject(Error('NotAllowedError')):Promise.resolve();}},button={};
const player=remotePlayback({audio,button,valid:()=>live});assert.equal(audio.muted,false);assert.equal(audio.autoplay,true);assert.equal(await player.play(),false);assert.equal(button.hidden,false);blocked=false;assert.equal(await button.onclick(),true);assert.equal(button.hidden,true);assert.equal(calls,2);live=false;await player.play();assert.equal(calls,2);
let resolve;live=true;audio.play=()=>new Promise(r=>resolve=r);const pending=player.play();live=false;resolve();assert.equal(await pending,false);
console.log('Remote audio: received track playback, autoplay rejection and tap retry, stale call protection passed');

const {runInNewContext}=await import('node:vm'),app=await (await import('node:fs/promises')).readFile(new URL('../web/app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('function peer(id)'),app.indexOf('async function offer('));
let receiverAudio;const elements=[];class PC{constructor(){this.connectionState='new';}addTransceiver(){}getTracks(){return []}}
const scope={RTCPeerConnection:PC,rtcConfig:{iceServers:[]},el:tag=>{const n={tag,hidden:false,setAttribute(){},play:async()=>{n.played=true;}};elements.push(n);if(tag==='audio')receiverAudio=n;return n;},document:{body:{append(){}}},peers:new Map(),crypto:{randomUUID:()=> 'metric'},remotePlayback,backgroundCallPaused:false,pageClosing:false,localStream:null,room:{mode:'interpreter'},role:null,selfId:'a',send(){},ledger:{event(){}},renderParticipants(){},MediaStream:class{constructor(){this.tracks=[];}getTracks(){return this.tracks;}addTrack(t){this.tracks.push(t);}}};
runInNewContext(code+';this.makePeer=peer;',scope);const peer=scope.makePeer('b'),track={kind:'audio'};peer.pc.ontrack({streams:[],track});await Promise.resolve();assert.equal(receiverAudio.muted,false);assert.equal(receiverAudio.played,true);assert.equal(receiverAudio.srcObject.getTracks()[0],track);assert.equal(peer.audioAction.hidden,true);
console.log('Peer integration: streamless remote tracks attached and unmuted playback started');
