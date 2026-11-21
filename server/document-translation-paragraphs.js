// Preserve every original newline so cached source remains byte-for-byte
// reconstructable. Only unmistakable short sentence tails may join a line;
// headings, table rows, blank lines and neighboring independent sentences stay apart.
export function translationParagraphs(text,{layout=false,diagram=false}={}){
 const lines=String(text).split('\n');
 if(!layout||diagram)return lines;
 const groups=[];
 for(const line of lines){
  const previous=groups.at(-1),tail=String(previous??'').split('\n').at(-1).trim(),next=line.trim();
  const continuation=next.length<=12&&/^[\p{Script=Hiragana}ー、]+[。！？]$/u.test(next);
  if(continuation&&tail.length>=20&&!/[。！？.!?:：]$/u.test(tail)&&!/[|\t]/u.test(previous+line))groups[groups.length-1]+='\n'+line;
  else groups.push(line);
 }
 return groups;
}
