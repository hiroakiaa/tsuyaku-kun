import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
// A successful socket.send does not prove that the server received the receipt.
let sends=0;const record={id:'other_one',revision:0,final:true,status:'ready'},scope={room:{mode:'interpreter'},selfId:'self',elements:new Map([[record.id,{}]]),records:new Map([[record.id,record]]),receiptSent:new Set(),send:()=>{sends++;return true;},captionDelivery:{displayed(){}}};
const start=app.indexOf('function acknowledgeCaption(');runInNewContext(app.slice(start,app.indexOf('\n',start)),scope);scope.acknowledgeCaption(record);scope.acknowledgeCaption(record);assert.equal(sends,2,'A replay must resend the receipt');scope.acknowledgeCaption({...record,revision:1});assert.equal(sends,2,'A non-rendered revision must not be acknowledged');
let removed=0;const rejected={room:{mode:'interpreter'},sessionStorage:{removeItem:()=>removed++},chatAccess(){},clearTimeout(){},clearInterval(){},authTimer:1,heartbeat:2,refreshTimer:3,socket:{close(){}},renderChatParticipants(){},status(){},message(){}};const handlerStart=app.indexOf('async function handle(');runInNewContext(app.slice(handlerStart,app.indexOf('async function ensureMicrophone(',handlerStart)),rejected);await rejected.handle({type:'join_declined',text:'見送りました'});assert.equal(rejected.room.joinBlocked,true);assert.equal(removed,1);
const resumeStart=app.indexOf('let receptionResuming='),resumeEnd=app.indexOf("document.addEventListener('visibilitychange'",resumeStart);let connects=0;
const blocked={room:{mode:'interpreter',joinBlocked:true},backgroundCallPaused:true,pageClosing:false,document:{visibilityState:'visible'},connect:async()=>connects++,sessionEpoch:1};runInNewContext(app.slice(resumeStart,resumeEnd),blocked);await blocked.resumeCallReception();assert.equal(connects,0,'A declined invitation must not automatically request admission again');
let saved=0;const remember=app.split('\n').find(line=>line.startsWith('function rememberCall('));const savedScope={room:blocked.room,sessionStorage:{setItem(){saved++;}}};runInNewContext(remember,savedScope);savedScope.rememberCall();assert.equal(saved,0);
console.log('Chat recovery: replayed display receipts, stale revision protection and blocked invitation resume passed');

const offlineScope={
  current:()=>true,intentionalClose:false,authTimer:null,clearTimeout(){},
  navigator:{onLine:false},recognition:null,connectedAt:1000,recoveryStartedAt:null,lessonCaptionRecoveryAt:500,
  Date:{now:()=>2000},stopRecognition(){},status(){},ws:{}
};
const closeHandler=app.split('\n').find(line=>line.trimStart().startsWith('ws.onclose='));
runInNewContext(closeHandler.slice(0,closeHandler.indexOf(';if(prepared)')+1),offlineScope);
offlineScope.ws.onclose({code:1006});
assert.equal(offlineScope.recoveryStartedAt,2000,'Offline disconnect must start the recovery clock');
assert.equal(offlineScope.connectedAt,null);
assert.equal(offlineScope.lessonCaptionRecoveryAt,null);

const caption={id:'teacher_1',final:true,status:'ready',translations:{en:'Hello'}};
const recoveryEvents=[];
const recoveryScope={
  lessonCaptionRecoveryAt:1000,selfId:'student',sharedLanguage:()=> 'en',
  records:new Map([[caption.id,caption]]),elements:new Map(),
  Date:{now:()=>3500},ledger:{event:(...event)=>recoveryEvents.push(event)},
  status:value=>recoveryEvents.push(value)
};
runInNewContext(app.slice(app.indexOf('function confirmLessonCaptionRecovery('),app.indexOf('async function handle(')),recoveryScope);
recoveryScope.confirmLessonCaptionRecovery(caption,null);
recoveryScope.elements.set(caption.id,{});
recoveryScope.confirmLessonCaptionRecovery(caption,caption);
recoveryScope.confirmLessonCaptionRecovery({...caption,translations:{ja:'こんにちは'}},null);
assert.equal(recoveryEvents.length,0);
recoveryScope.confirmLessonCaptionRecovery(caption,null);
recoveryScope.confirmLessonCaptionRecovery(caption,null);
assert.deepEqual(recoveryEvents.map(e=>Array.isArray(e)?[e[0],e[1].recoverySeconds]:e),[['lesson_caption_restored',2.5],'接続中']);

const pongStates=[];
const pongScope={chatWaiting:false,room:{mode:'lesson'},backgroundCallPaused:false,
  lessonCaptionRecoveryAt:1000,lessonCaptionWaiting:'waiting',status:value=>pongStates.push(value)};
const pongHandler=app.split('\n').find(line=>line.trimStart().startsWith("if(data.type==='pong')"));
runInNewContext('function pong(data){'+pongHandler+'}',pongScope);
pongScope.pong({type:'pong'});
pongScope.lessonCaptionRecoveryAt=null;
pongScope.pong({type:'pong'});
assert.deepEqual(pongStates,['waiting','接続中']);

recoveryEvents.length=0;
recoveryScope.lessonCaptionRecoveryAt=1000;
const originalOnly={...caption,translations:{ja:'こんにちは'}};
recoveryScope.records.set(caption.id,originalOnly);
recoveryScope.confirmLessonCaptionRecovery(caption,originalOnly);
assert.equal(recoveryEvents.length,0,'An original-only row is not proof of translated display');
recoveryScope.records.set(caption.id,caption);
recoveryScope.confirmLessonCaptionRecovery(caption,originalOnly);
assert.equal(recoveryEvents.length,2,'A translation added to the existing revision completes recovery');

const retryCallbacks=[],retryStates=[];
let reconnectCalls=0;
const retryScope={
 room:{mode:'lesson'},sessionEpoch:1,intentionalClose:false,backgroundCallPaused:false,pageClosing:false,
 navigator:{onLine:true},socket:{readyState:3},reconnectAttempts:0,reconnectTimer:null,
 connect:async()=>{if(++reconnectCalls===1)throw Error('temporary token failure');},
 ledger:{event(){}},startConnectionTimers(){},status:value=>retryStates.push(value),showConnectionError:()=>assert.fail('temporary failure'),
 mayReconnect:(_code,attempt)=>attempt<=5,retryDelay:()=>1000,clearTimeout(){},
 setTimeout:callback=>retryCallbacks.push(callback)
};
runInNewContext(app.slice(app.indexOf('let pendingReconnect=null;'),app.indexOf("window.addEventListener('online'")),retryScope);
await retryScope.reconnectAfterInterruption();
assert.equal(retryCallbacks.length,1);
retryCallbacks.shift()();
await Promise.resolve();
assert.equal(reconnectCalls,2);
await retryScope.reconnectAfterInterruption(retryScope.room,0);
assert.equal(reconnectCalls,2);
assert.deepEqual(retryStates,['再接続しています']);

let finishConnect;
retryScope.connect=()=>{reconnectCalls++;return new Promise(resolve=>{finishConnect=resolve;});};
const inFlight=retryScope.reconnectAfterInterruption();
await retryScope.reconnectAfterInterruption();
assert.equal(reconnectCalls,3,'Overlapping automatic triggers share one authentication and socket attempt');
finishConnect();
await inFlight;

let finishManualRace;
retryScope.connect=()=>{reconnectCalls++;return new Promise(resolve=>{finishManualRace=resolve;});};
const automatic=retryScope.reconnectAfterInterruption();
retryScope.retryConnection();
assert.equal(reconnectCalls,4,'Manual retry must not start a second connection during automatic authentication');
finishManualRace();
await automatic;
retryScope.socket.readyState=0;
retryScope.retryConnection();
assert.equal(reconnectCalls,4,'Manual retry must not replace a connecting socket');
