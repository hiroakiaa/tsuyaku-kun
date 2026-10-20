import assert from 'node:assert/strict';
import {lessonCode,installModalFeedback,backdropClick,updateMode,searchBounds} from '../web/entry-feedback.js';
import {readFile} from 'node:fs/promises';
const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
assert.equal((index.match(/src="web\/ui-english\.js/g)||[]).length,0,'English guides must initialize through the shared app import, not a second script version');
const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8'),admin=await readFile(new URL('../web/admin.js',import.meta.url),'utf8');
assert.equal(app.match(/from '(\.\/ui-english\.js[^']*)'/)?.[1],admin.match(/from '(\.\/ui-english\.js[^']*)'/)?.[1],'app and admin must share one guide module');
assert.deepEqual(lessonCode(' １２３４ ').value,'1234');
assert.equal(lessonCode('１２３４').valid,true);
for(const value of ['', '123', '12345', '12a4', '12 4'])assert.equal(lessonCode(value).valid,false);
assert.match(lessonCode('').message,/先生/);
assert.match(lessonCode('123').message,/4桁/);
const dialogTarget={getBoundingClientRect:()=>({left:20,right:300,top:30,bottom:400})};
assert.equal(backdropClick({target:dialogTarget,clientX:25,clientY:35},dialogTarget),false);
assert.equal(backdropClick({target:dialogTarget,clientX:15,clientY:35},dialogTarget),true);
assert.equal(backdropClick({target:{},clientX:15,clientY:35},dialogTarget),false);
for(const value of ['face','interpreter','lesson','words','invalid']){const data=new Map([['tsuyaku-update-tab',value]]);assert.equal(updateMode({getItem:k=>data.get(k),removeItem:k=>data.delete(k)}),value==='invalid'?'face':value);assert.equal(data.size,0);}
assert.equal(updateMode({getItem(){throw Error('storage denied');}}),'face');
for(const viewport of [{width:390,height:844},{width:240,height:120,offsetLeft:40,offsetTop:20},{width:280,height:80}]){const bounds=searchBounds({right:370,bottom:75},viewport);assert.ok(bounds.left>=(viewport.offsetLeft||0));assert.ok(bounds.left+bounds.width<=(viewport.offsetLeft||0)+viewport.width);assert.ok(bounds.top+bounds.maxHeight<=(viewport.offsetTop||0)+viewport.height);assert.ok(bounds.maxHeight>=0);}
const events={},moves=[],parent={append:n=>moves.push(['home',n])},message={parentNode:parent,nextSibling:null},close={setAttribute:()=>{},focus:o=>moves.push(['focus',o.preventScroll])},dialog={addEventListener:(t,f)=>events[t]=f,append:n=>moves.push(['dialog',n])};
const opened=installModalFeedback({dialog,message,close});opened();events.close();opened();events.close();
assert.deepEqual(moves.map(x=>x[0]),['dialog','focus','home','dialog','focus','home']);
assert.equal(moves[1][1],true);
dialog.open=true;const before=moves.length;events.close();assert.equal(moves.length,before,'late close from previous modal must not remove feedback from reopened modal');
dialog.open=false;events.close();assert.equal(moves.at(-1)[0],'home');
console.log('Entry feedback: full-width room IDs, invalid input explanations and modal live-region restoration passed');
