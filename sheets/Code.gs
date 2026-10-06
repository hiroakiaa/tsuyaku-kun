/** 通訳君専用。既存のつたえる君のプロジェクトには追加しません。 */
var TSUYAKU_SHEET_ID='1Y0Je_hRWRfxgN4SoWdIla1L5uivw-9J1mhR1MYkjf8M';
var TSUYAKU_FIREBASE_KEY='AIzaSyDrzlXIwJrlm9oXNjMw-vCF3OS-2Xe2gZ8';
function doGet(){return ContentService.createTextOutput(JSON.stringify({app:'通訳君 データ連携',ok:true})).setMimeType(ContentService.MimeType.JSON);}
function doPost(e){
  try{
    var raw=String(e&&e.postData&&e.postData.contents||'');if(raw.length>16000)throw Error('データが大きすぎます。');
    var p=JSON.parse(raw);var user=tsuyakuVerify_(p.idToken);
    var result;
    if(p.action==='tsuyakuCatalog')result=tsuyakuCatalog_();
    else if(p.action==='tsuyakuCandidate')result=tsuyakuCandidate_(p,user);
    else if(p.action==='tsuyakuLearn')result=tsuyakuLearn_(p,user);
    else if(p.action==='tsuyakuPhrase')result=tsuyakuPhrase_(p,user);
    else if(p.action==='tsuyakuUsage')result=tsuyakuUsage_(p,user);
    else if(p.action==='tsuyakuBank')result=tsuyakuBank_(p);
    else throw Error('操作を確認してください。');
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }catch(error){return ContentService.createTextOutput(JSON.stringify({error:error.message||'データを確認してください。'})).setMimeType(ContentService.MimeType.JSON);}
}
function tsuyakuVerify_(token){
  if(typeof token!=='string'||token.length>8192)throw Error('ログインしてください。');
  var response=UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+TSUYAKU_FIREBASE_KEY,{method:'post',contentType:'application/json',payload:JSON.stringify({idToken:token}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('ログインし直してください。');
  var user=JSON.parse(response.getContentText()).users[0];if(!user||user.disabled)throw Error('ログインし直してください。');return user;
}
function tsuyakuRows_(name,maxColumns){
  var sheet=SpreadsheetApp.openById(TSUYAKU_SHEET_ID).getSheetByName(name);if(!sheet||sheet.getLastRow()<2)return [];
  var rows=sheet.getRange(1,1,sheet.getLastRow(),Math.min(maxColumns,sheet.getLastColumn())).getDisplayValues(),headers=rows.shift();
  return rows.filter(function(row){return row[0];}).map(function(row){var obj={};headers.forEach(function(h,i){if(h)obj[h]=row[i]||'';});return obj;});
}
function tsuyakuCandidate_(p,user){
  var term=String(p.term||'').trim(),translation=String(p.translation||'').trim(),lang=String(p.language||'');
  if(!term||term.length>80||!translation||translation.length>500||!['ja','ja-easy','en','pt','es','vi','zh-CN','ko','tl','fil','id','ne'].includes(lang))throw Error('ことばと訳を確認してください。');
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\d{2,4}[-－]\d{2,4}[-－]\d{3,4}/i.test(term+' '+translation))throw Error('連絡先などの個人情報は登録しないでください。');
  var key=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,term+'|'+translation+'|'+lang)).slice(0,40);
  var cache=CacheService.getScriptCache(),quotaKey='tsuyaku_candidate_'+user.localId,count=Number(cache.get(quotaKey)||0);if(count>=10)throw Error('少し待ってから追加してください。');
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw Error('少し待ってから追加してください。');
  try{
    var sheet=SpreadsheetApp.openById(TSUYAKU_SHEET_ID).getSheetByName('tsuyaku_term_candidates');if(!sheet)throw Error('候補シートがありません。');
    if(sheet.getLastRow()>1&&sheet.getRange(2,8,sheet.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext())return {ok:true,duplicate:true};
    var row=[new Date().toISOString(),term,translation,lang,'math','pending','通訳君',key].map(function(v){return /^[=+\-@]/.test(v)?"'"+v:v;});
    sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);cache.put(quotaKey,String(count+1),60);return {ok:true,candidateId:key};
  }finally{lock.releaseLock();}
}
function tsuyakuFields_(){return {ja:'jaText','ja-easy':'simpleJaText',en:'enText',pt:'ptText',es:'esText',vi:'viText','zh-CN':'zhText',ko:'koText',tl:'tlText',fil:'tlText',id:'idText',ne:'neText'};}
function tsuyakuGood_(v){return typeof v==='string'&&v.trim()&&!/^[#=]/.test(v);}
function tsuyakuApprovedBank_(){
  var fields=tsuyakuFields_();
  var rows=tsuyakuRows_('interpreter_translation_bank',23).filter(function(r){return r.status==='approved';});
  var candidates=tsuyakuRows_('interpreter_phrase_candidates',20).filter(function(r){return r.status==='approved';}).map(function(r){r.sourceLang='ja';r.sourceText=r.jaText;r.bankKey=r.candidateId;r.subject='common';return r;});
  return rows.concat(candidates).map(function(r){var out={bankKey:r.bankKey,sourceLang:r.sourceLang,sourceText:r.sourceText,status:'approved',subject:r.subject||'common'};Object.keys(fields).forEach(function(c){if(tsuyakuGood_(r[fields[c]]))out[fields[c]]=r[fields[c]];});return out;});
}
function tsuyakuCatalog_(){
  var languages=tsuyakuRows_('languages',5).map(function(r){return {code:r.code,speechCode:r.speechCode,labelJa:r.labelJa,labelNative:r.labelNative};});
  if(!languages.some(function(l){return l.code==='fil';}))languages.push({code:'fil',speechCode:'fil-PH',labelJa:'フィリピノ語',labelNative:'Filipino'});
  var glossary=tsuyakuRows_('tsuyaku_math_glossary',17).filter(function(r){return r.status==='approved';}).map(function(r){r.enText=r.en;return r;});
  var terms=tsuyakuRows_('school_terms',16),ruby=tsuyakuRows_('ruby_dictionary',14),seen={};
  terms.forEach(function(r){seen[r.ja]=r;});
  ruby.forEach(function(r){var existing=seen[r.text];if(existing){if(!existing.reading)existing.reading=r.reading;if(!existing.simpleJaText)existing.simpleJaText=r.easyJa;return;}
    if(!r.easyJa)return;var t={id:'ruby:'+r.text,ja:r.text,reading:r.reading,category:r.category,descriptionJa:r.easyJa,simpleJaText:r.easyJa,source:'ruby_dictionary'};
    Object.keys(tsuyakuFields_()).forEach(function(c){var f=tsuyakuFields_()[c];if(f!=='jaText'&&f!=='simpleJaText'&&tsuyakuGood_(r[f]))t[f]=r[f];});terms.push(t);seen[r.text]=t;
  });
  var fields=tsuyakuFields_();tsuyakuRows_('tsuyaku_term_candidates',8).filter(function(r){return r.status==='approved'&&fields[r.language]&&tsuyakuGood_(r.translation);}).forEach(function(r){var t=seen[r.term];if(!t){t={id:r.candidateId,ja:r.term,category:'追加されたことば',descriptionJa:r.term};terms.push(t);seen[r.term]=t;}t[fields[r.language]]=r.translation;});
  var corrections=tsuyakuRows_('lesson_corrections',7).filter(function(r){return String(r.enabled).toLowerCase()==='true';});
  var phrases=tsuyakuRows_('phrase_cards',21);tsuyakuRows_('interpreter_phrase_candidates',20).filter(function(r){return r.status==='approved';}).forEach(function(r){var original=phrases.find(function(p){return p.jaText===r.jaText;});if(original){Object.keys(fields).forEach(function(c){var f=fields[c];if(c!=='ja'&&tsuyakuGood_(r[f]))original[f]=r[f];});}else{r.id=r.candidateId;phrases.push(r);}});
  var learnableTexts=tsuyakuRows_('interpreter_template_sources',8).filter(function(r){return r.status!=='rejected'&&r.jaText&&r.jaText.length<=1200;}).map(function(r){return r.jaText;});
  return {languages:languages,phrases:phrases,learnableTexts:learnableTexts,terms:terms,glossary:glossary,bank:tsuyakuApprovedBank_(),corrections:corrections,updatedAt:new Date().toISOString(),databaseVersion:'20261007-1'};
}
function tsuyakuQuota_(user,kind,limit){var cache=CacheService.getScriptCache(),key='tsuyaku_'+kind+'_'+user.localId,n=Number(cache.get(key)||0);if(n>=limit)throw Error('少し待ってから追加してください。');cache.put(key,String(n+1),60);}
function tsuyakuSafe_(s){return /^[=+\-@]/.test(String(s))?"'"+s:s;}
function tsuyakuPhrase_(p,user){
  var text=String(p.text||'').trim(),translations=p.translations||{},fields=tsuyakuFields_();
  if(!text||text.length>1200)throw Error('文章を確認してください。');
  var values={};Object.keys(fields).forEach(function(c){if(c!=='ja'&&tsuyakuGood_(translations[c])&&translations[c].length<=1500)values[fields[c]]=translations[c];});
  if(!Object.keys(values).length)throw Error('訳を確認してください。');
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|\d{2,4}[-－]\d{2,4}[-－]\d{3,4}/i.test(text+' '+JSON.stringify(values)))throw Error('連絡先などの個人情報は登録しないでください。');
  tsuyakuQuota_(user,'phrase',10);
  var key=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text+'|'+JSON.stringify(values))).slice(0,40),lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw Error('少し待ってください。');
  try{var sheet=SpreadsheetApp.openById(TSUYAKU_SHEET_ID).getSheetByName('interpreter_phrase_candidates');if(sheet.getLastRow()>1&&sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(key).matchEntireCell(true).findNext())return {ok:true,duplicate:true};
    var row=[key,key,text.slice(0,60),'授業・会話',text,values.simpleJaText||'',values.enText||'',values.ptText||'',values.esText||'',values.viText||'',values.zhText||'',values.koText||'',values.tlText||'',values.idText||'',values.neText||'',0,'','pending',new Date().toISOString(),'登録済み素材または利用者が送った文例候補。共有前に原文・訳を管理者確認。'].map(tsuyakuSafe_);
    if(sheet.getLastRow()+1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),100);sheet.getRange(sheet.getLastRow()+1,1,1,20).setValues([row]);return {ok:true,candidateId:key};
  }finally{lock.releaseLock();}
}
function tsuyakuUsage_(p,user){
  var info={phrase:['phrase_cards','id','viewCount'],term:['school_terms','id','viewCount'],bank:['interpreter_translation_bank','bankKey','hitCount']}[p.kind],id=String(p.id||'');if(!info||!id||id.length>160)return {ok:true,recorded:false};
  var cache=CacheService.getScriptCache(),key='view_'+user.localId+'_'+p.kind+'_'+id;if(cache.get(key))return {ok:true,recorded:false};tsuyakuQuota_(user,'usage',30);
  var lock=LockService.getScriptLock();if(!lock.tryLock(2000))return {ok:true,recorded:false};
  try{var sheet=SpreadsheetApp.openById(TSUYAKU_SHEET_ID).getSheetByName(info[0]),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],keyCol=headers.indexOf(info[1])+1,countCol=headers.indexOf(info[2])+1;if(!keyCol||!countCol||sheet.getLastRow()<2)return {ok:true,recorded:false};var match=sheet.getRange(2,keyCol,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).findNext();if(!match)return {ok:true,recorded:false};var cell=sheet.getRange(match.getRow(),countCol);if(cell.getFormula())return {ok:true,recorded:false};cell.setValue((Number(cell.getValue())||0)+1);cache.put(key,'1',60);return {ok:true,recorded:true};}finally{lock.releaseLock();}
}
function tsuyakuBank_(p){
  var text=String(p.text||'').trim(),source=String(p.source||'ja'),targets=Array.isArray(p.targets)?p.targets:[],fields=tsuyakuFields_();if(!text||text.length>1200||targets.length>12)return {translations:null};
  var rows=tsuyakuApprovedBank_().filter(function(r){return r.sourceLang===source&&r.sourceText===text;}),out={};out[source]=text;
  targets.forEach(function(c){var row=rows.find(function(r){return tsuyakuGood_(r[fields[c]]);});if(row)out[c]=row[fields[c]];});return {translations:out};
}

function tsuyakuLearn_(p,user){
 var text=String(p.text||'').trim();var known=tsuyakuRows_('interpreter_template_sources',8).some(function(r){return r.status!=='rejected'&&r.jaText===text;})||tsuyakuRows_('phrase_cards',21).some(function(r){return r.jaText===text;});
 if(!known)return {ok:true,recorded:false};return tsuyakuPhrase_(p,user);
}
