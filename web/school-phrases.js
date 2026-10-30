// Fixed, whole school phrases. No personal data, templates, fuzzy matching or learned text.
const columns=['ja','en','pt','es','tl','vi','zh-CN','ko','id','ne','de'];
const multilingual=[
 ['こんにちは。','Hello.','Olá.','Hola.','Kumusta.','Xin chào.','您好。','안녕하세요.','Halo.','नमस्ते।','Guten Tag.'],
 ['おはようございます。','Good morning.','Bom dia.','Buenos días.','Magandang umaga.','Chào buổi sáng.','早上好。','좋은 아침입니다.','Selamat pagi.','शुभ प्रभात।','Guten Morgen.'],
 ['ありがとうございます。','Thank you.','Agradeço.','Gracias.','Salamat.','Cảm ơn.','谢谢您。','감사합니다.','Terima kasih.','धन्यवाद।','Vielen Dank.'],
 ['もう一度言ってください。','Please say that again.','Por favor, diga isso novamente.','Por favor, dígalo otra vez.','Pakisabi muli.','Xin vui lòng nói lại.','请再说一遍。','다시 말씀해 주세요.','Tolong katakan sekali lagi.','कृपया फेरि भन्नुहोस्।','Bitte sagen Sie das noch einmal.'],
 ['ゆっくり話してください。','Please speak slowly.','Por favor, fale devagar.','Por favor, hable despacio.','Pakibagalan ang pagsasalita.','Xin vui lòng nói chậm.','请慢慢说。','천천히 말씀해 주세요.','Tolong bicara perlahan.','कृपया बिस्तारै बोल्नुहोस्।','Bitte sprechen Sie langsam.'],
 ['分かりました。','I understand.','Entendi.','Entiendo.','Naiintindihan ko.','Tôi hiểu rồi.','我明白了。','알겠습니다.','Saya mengerti.','मैले बुझें।','Ich verstehe.'],
 ['分かりません。',"I don't understand.",'Não entendo.','No entiendo.','Hindi ko naiintindihan.','Tôi không hiểu.','我不明白。','모르겠습니다.','Saya tidak mengerti.','मैले बुझिनँ।','Ich verstehe nicht.'],
 ['通訳をお願いします。','Please provide an interpreter.','Por favor, providencie um intérprete.','Por favor, proporcione un intérprete.','Pakitulungan akong makakuha ng tagapagsalin.','Xin vui lòng bố trí phiên dịch viên.','请安排口译员。','통역사를 부탁드립니다.','Tolong sediakan penerjemah lisan.','कृपया दोभाषेको व्यवस्था गर्नुहोस्।','Bitte stellen Sie einen Dolmetscher zur Verfügung.']
];
const bilingual=[
 ['どういたしまして。',"You're welcome."],['どういう意味ですか？','What does that mean?'],['何歳ですか？','How old are you?'],
 ['こんばんは。','Good evening.'],['少し待ってください。','Please wait a moment.'],['ここに書いてください。','Please write here.'],
 ['お名前を教えてください。','Please tell me your name.'],['お子さんの名前を教えてください。',"Please tell me your child's name."],
 ['やさしい日本語で話してください。','Please speak in simple Japanese.'],['質問はありますか？','Do you have any questions?'],
 ['手伝ってください。','Please help me.'],['こちらに来てください。','Please come here.'],['座ってください。','Please sit down.'],
 ['立ってください。','Please stand up.'],['教科書を開いてください。','Please open your textbook.'],['教科書を閉じてください。','Please close your textbook.'],
 ['黒板を見てください。','Please look at the board.'],['よく聞いてください。','Please listen carefully.'],['読んでください。','Please read.'],
 ['書いてください。','Please write.'],['ノートに書いてください。','Please write in your notebook.'],['手を挙げてください。','Please raise your hand.'],
 ['一緒に考えましょう。',"Let's think about it together."],['授業を始めます。','We will begin the class.'],['授業を終わります。','We will end the class.'],
 ['数学の授業を始めます。','We will begin the mathematics class.'],['休憩しましょう。',"Let's take a break."],['また明日。','See you tomorrow.'],
 ['お大事に。','Take care.'],['ご協力ありがとうございます。','Thank you for your cooperation.'],['連絡ありがとうございます。','Thank you for contacting us.'],
 ['この書類を確認してください。','Please check this document.'],['ここに署名してください。','Please sign here.'],['学校に連絡してください。','Please contact the school.'],
 ['持ち物を確認してください。','Please check what you need to bring.'],['忘れ物はありませんか？','Have you forgotten anything?']
];
const rows=[...multilingual.map(row=>Object.fromEntries(columns.map((code,i)=>[code,row[i]]))),...bilingual.map(([ja,en])=>({ja,en}))];
const canonical=code=>code==='fil'?'tl':code;
const exact=text=>String(text||'').normalize('NFC').trim();
function one(source,text,targets){const matches=rows.filter(row=>row[canonical(source)]===text);if(!matches.length)return null;const translations={[source]:text};for(const code of targets){const values=[...new Set(matches.map(row=>row[canonical(code)]).filter(Boolean))];if(values.length===1)translations[code]=values[0];}return translations;}
export function schoolTranslation(source,text,targets,{partial=false}={}){
 if(!Array.isArray(targets)||!targets.length||targets.length>4)return null;text=exact(text);if(!text||text.length>600||source==='ja-easy')return null;
 let translations=one(source,text,targets);
 if(!translations){const parts=text.match(/[^。.!?！？।]+[。.!?！？।]+|[^。.!?！？।]+$/gu)?.map(exact).filter(Boolean)||[];if(parts.length<2||parts.length>4)return null;const chunks=parts.map(part=>one(source,part,targets));if(chunks.some(chunk=>!chunk))return null;translations={[source]:text};for(const code of targets)if(chunks.every(chunk=>chunk[code]))translations[code]=chunks.map(chunk=>chunk[code]).join(['ja','zh-CN'].includes(code)?'':' ');}
 const missing=targets.filter(code=>!translations[code]);if(!partial&&missing.length)return null;
 return {translations,missing,source:'builtin',diagnostic:{reason:missing.length?'missing_languages':'complete',missing}};
}
