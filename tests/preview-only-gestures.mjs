import assert from 'node:assert/strict';
import {installPreviewOnlyGestures} from '../web/preview-only-gestures.js';
const doc=new EventTarget();doc.documentElement={style:{touchAction:''}};
const clean=installPreviewOnlyGestures(doc);assert.equal(installPreviewOnlyGestures(doc),clean);
function event(type,properties){const e=new Event(type,{cancelable:true});Object.assign(e,properties);doc.dispatchEvent(e);return e;}
assert.equal(event('touchstart',{touches:[{},{}]}).defaultPrevented,true);
assert.equal(event('touchmove',{touches:[{}]}).defaultPrevented,false,'One finger scroll remains native');
assert.equal(event('gesturechange',{}).defaultPrevented,true,'Safari native page magnification is cancelled');
assert.equal(event('wheel',{ctrlKey:true}).defaultPrevented,true,'Trackpad pinch cannot zoom the app');
assert.equal(event('wheel',{ctrlKey:false}).defaultPrevented,false,'Normal wheel scrolling is retained');
assert.equal(event('keydown',{ctrlKey:true,key:'+'}).defaultPrevented,false,'Keyboard browser zoom remains available');
let previewHandled=0;doc.addEventListener('touchmove',()=>previewHandled++);event('touchmove',{touches:[{},{}]});assert.equal(previewHandled,1,'Preview handlers still receive prevented native gestures');
clean();assert.equal(event('touchstart',{touches:[{},{}]}).defaultPrevented,false);assert.equal(doc.documentElement.style.touchAction,'');
console.log('PASS preview-only gestures: browser pinch blocked, preview events preserved, single-finger scroll and keyboard zoom retained');
