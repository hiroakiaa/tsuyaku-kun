import assert from 'node:assert/strict';
import {createUiFixture} from './browser-fixture.mjs';
const f=await createUiFixture();
try{for(const width of [390,1024]){
 const c=await f.browser.newContext({viewport:{width,height:844}});await f.setup(c);await c.addInitScript(()=>{localStorage.setItem('tsuyaku-speaking-language','ja');localStorage.setItem('tsuyaku-display-language','en');});
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(f.origin);await p.locator('#microphone:not([disabled])').waitFor();await p.locator('#language-options').click();
 const search=p.locator('#modal input[type=search]').nth(1),select=p.locator('#modal select').nth(1);
 assert((await search.getAttribute('aria-label')).includes('相手'));assert.equal(await search.getAttribute('dir'),'auto');assert.equal(await search.getAttribute('maxlength'),'80');assert.equal(await search.getAttribute('spellcheck'),'false');assert.equal(await search.getAttribute('aria-describedby'),await select.getAttribute('aria-describedby'));
 await search.fill('Chinese simplified');assert.equal(await select.locator('option[value="zh-CN"]').count(),1);assert.equal(await select.inputValue(),'en');await search.press('Escape');assert.equal(await search.inputValue(),'');assert.equal(await p.locator('#modal').evaluate(n=>n.open),true);
 await search.fill('Arabic');await search.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(await select.inputValue(),'en');assert.equal(await search.inputValue(),'Arabic');await search.press('Enter');assert.equal(await select.inputValue(),'ar');assert.equal(await search.inputValue(),'');
 await search.fill('English');await search.press('ArrowDown');assert.equal(await select.evaluate(n=>n===document.activeElement),true);
 await search.fill('unknown-language');await search.press('Enter');assert.equal(await select.inputValue(),'ar');await search.fill('');await search.dispatchEvent('search');assert.equal(await select.locator('option').count(),140);
 await search.fill('Hindi');await p.evaluate(async()=>{const {fillLanguageOptions}=await import('/web/language-picker.js');const {mergeLanguages}=await import('/web/language-registry.js');const select=document.querySelectorAll('#modal select')[1];fillLanguageOptions(select,mergeLanguages().filter(l=>l.code==='ar'),select.value);});
 const statusId=await select.getAttribute('aria-describedby');assert.equal(await p.locator('#'+statusId).innerText(),'候補なし / No matching languages');
 await p.screenshot({path:'checks/language-keyboard-'+width+'.png'});assert.deepEqual(errors,[]);await c.close();console.log('PASS unique labels, descriptions, RTL, bounded search, multiword, Escape, IME, Enter, arrows, native clear and refreshed count '+width);
}}finally{await f.browser.close();}
