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
function tsuyakuCatalog_(){
  var languages=tsuyakuRows_('languages',5).map(function(r){return {code:r.code,speechCode:r.speechCode,labelJa:r.labelJa,labelNative:r.labelNative};});
  if(!languages.some(function(l){return l.code==='fil';}))languages.push({code:'fil',speechCode:'fil-PH',labelJa:'フィリピノ語',labelNative:'Filipino'});
  var glossary=tsuyakuRows_('tsuyaku_math_glossary',17).filter(function(r){return r.status==='approved';}).map(function(r){r.enText=r.en;return r;});
  return {languages:languages,phrases:tsuyakuRows_('phrase_cards',21),terms:tsuyakuRows_('school_terms',16),glossary:glossary,corrections:tsuyakuRows_('lesson_corrections',7),updatedAt:new Date().toISOString()};
}
function tsuyakuCandidate_(p,user){
  if(!(user.providerUserInfo||[]).some(function(x){return x.providerId==='google.com';}))throw Error('先生のGoogleログインが必要です。');
  var term=String(p.term||'').trim(),translation=String(p.translation||'').trim(),lang=String(p.language||'');
  if(!term||term.length>80||!translation||translation.length>500||!['ja','en','pt','es','vi','zh-CN','ko','tl','fil','id','ne'].includes(lang))throw Error('ことばと訳を確認してください。');
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
function tsuyakuBank_(p){
  var text=String(p.text||'').trim(),source=String(p.source||'ja'),targets=Array.isArray(p.targets)?p.targets:[];
  if(!text||text.length>1200||targets.length>11)return {translations:null};
  var fields={ja:'jaText',en:'enText',pt:'ptText',es:'esText',vi:'viText','zh-CN':'zhText',ko:'koText',tl:'tlText',fil:'tlText',id:'idText',ne:'neText'};
  var row=tsuyakuRows_('interpreter_translation_bank',18).find(function(r){return r.sourceLang===source&&r.sourceText===text;});
  if(!row)return {translations:null};var result={};result[source]=text;
  for(var i=0;i<targets.length;i++){var value=row[fields[targets[i]]];if(!value||/^#(?:REF!|VALUE!|ERROR!|N\/A)/.test(value))return {translations:null};result[targets[i]]=value;}
  return {translations:result};
}
