import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
// A successful socket.send does not prove that the server received the receipt.
let sends=0;const record={id:'other_one',revision:0,final:true,status:'ready'},scope={selfId:'self',elements:new Map([[record.id,{}]]),records:new Map([[record.id,record]]),receiptSent:new Set(),send:()=>{sends++;return true;},captionDelivery:{displayed(){}}};
const start=app.indexOf('function acknowledgeCaption(');runInNewContext(app.slice(start,app.indexOf('\n',start)),scope);scope.acknowledgeCaption(record);scope.acknowledgeCaption(record);assert.equal(sends,2,'A replay must resend the receipt');scope.acknowledgeCaption({...record,revision:1});assert.equal(sends,2,'A non-rendered revision must not be acknowledged');
let removed=0;const rejected={room:{mode:'interpreter'},sessionStorage:{removeItem:()=>removed++},chatAccess(){},clearTimeout(){},clearInterval(){},authTimer:1,heartbeat:2,refreshTimer:3,socket:{close(){}},renderChatParticipants(){},status(){},message(){}};const handlerStart=app.indexOf('async function handle(');runInNewContext(app.slice(handlerStart,app.indexOf('async function ensureMicrophone(',handlerStart)),rejected);await rejected.handle({type:'join_declined',text:'見送りました'});assert.equal(rejected.room.joinBlocked,true);assert.equal(removed,1);
const resumeStart=app.indexOf('let receptionResuming='),resumeEnd=app.indexOf("document.addEventListener('visibilitychange'",resumeStart);let connects=0;
const blocked={room:{mode:'interpreter',joinBlocked:true},backgroundCallPaused:true,pageClosing:false,document:{visibilityState:'visible'},connect:async()=>connects++,sessionEpoch:1};runInNewContext(app.slice(resumeStart,resumeEnd),blocked);await blocked.resumeCallReception();assert.equal(connects,0,'A declined invitation must not automatically request admission again');
let saved=0;const remember=app.split('\n').find(line=>line.startsWith('function rememberCall('));const savedScope={room:blocked.room,sessionStorage:{setItem(){saved++;}}};runInNewContext(remember,savedScope);savedScope.rememberCall();assert.equal(saved,0);
console.log('Chat recovery: replayed display receipts, stale revision protection and blocked invitation resume passed');
