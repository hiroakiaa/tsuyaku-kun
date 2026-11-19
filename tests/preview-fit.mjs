import assert from 'node:assert/strict';
import {previewFitScale} from '../web/preview-fit.js';
for(const [w,h,vw,vh]of [[600,900,390,640],[1200,600,390,640],[500,500,390,300],[612,792,390,260]]){
 const s=previewFitScale(w,h,vw,vh);
 assert.ok(w*s<=vw+.001&&h*s<=vh+.001);
 assert.ok(Math.min(Math.abs(w*s-vw),Math.abs(h*s-vh))<.001,'One edge must touch the inner preview boundary');
}
assert.equal(previewFitScale(0,100,390,640),1);
console.log('PASS minimum preview scale touches one edge and fits both portrait and landscape content');
