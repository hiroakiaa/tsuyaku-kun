// Deliberately small, reviewed equivalence groups. No fuzzy or embedding search.
// Numbers, dates, negation and conditions are never stripped or generalized.
const groups = [
 ['手続きに必要な書類を教えてください。','どんな書類が必要ですか。','手続きにはどの書類が必要ですか。','必要な書類を教えてください。'],
 ['書類の書き方を教えてください。','この書類はどう書けばよいですか。'],
 ['この書類は、どこに提出すればよいですか。','この書類はどこに出せばよいですか。','この書類の提出先を教えてください。'],
 ['この書類は、いつまでに提出すればよいですか。','この書類の提出期限を教えてください。'],
 ['通訳をお願いできますか。','通訳をお願いしたいです。'],
 ['やさしい日本語で説明してください。','簡単な日本語で説明してください。'],
 ['書類をもう一度もらえますか。','書類をもう一度ください。']
];
const normalize = text => String(text||'').normalize('NFC').trim().replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,'').replace(/[。？?]$/,'');
const aliases = new Map();
for (const group of groups) for (const text of group) aliases.set(normalize(text),normalize(group[0]));
export function phraseIdentity(text,source='ja') {
 const value=source==='ja'?normalize(text):String(text||'').normalize('NFC').trim();
 return source==='ja'?(aliases.get(value)||value):value;
}
export function equivalentPhrase(a,b,source='ja') {return phraseIdentity(a,source)===phraseIdentity(b,source);}
