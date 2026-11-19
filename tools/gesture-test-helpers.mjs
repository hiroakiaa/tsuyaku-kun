import assert from 'node:assert/strict';
export async function touchPinch(page,cdp,selector,ratio=1.6){
 const area=page.locator(selector);await area.scrollIntoViewIfNeeded();const r=await area.boundingBox();
 const center={x:r.x+r.width/2,y:Math.max(10,Math.min(800,r.y+r.height/2))};
 const points=distance=>[{id:1,x:center.x-distance/2,y:center.y},{id:2,x:center.x+distance/2,y:center.y}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(50)});
 for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(50+(50*ratio-50)*i/6)});await page.evaluate(()=>new Promise(requestAnimationFrame));}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
export async function checkPagePinchBlocked(page,cdp,selector){
 await touchPinch(page,cdp,selector);
 assert.equal(await page.evaluate(()=>visualViewport.scale),1,'Pinching outside previews cannot magnify the app');
 const cancelled=await page.evaluate(()=>{const e=new Event('gesturechange',{cancelable:true,bubbles:true});document.dispatchEvent(e);return e.defaultPrevented;});
 assert.equal(cancelled,true,'Safari native page gestures are blocked too');
}
