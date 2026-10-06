const normalize=s=>String(s||'').normalize('NFKC').replace(/[\s、。,.!?！？]/g,'');
export function speechScore(expected,recognized){
 const a=[...normalize(expected)],b=[...normalize(recognized)];let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=row;}
 const numbers=s=>String(s).normalize('NFKC').match(/\d+(?:\.\d+)?/g)||[];
 return {characterErrorRate:a.length?previous[b.length]/a.length:null,numbersMatch:JSON.stringify(numbers(expected))===JSON.stringify(numbers(recognized)),note:'文字の一致率と数字の比較。意味や翻訳品質の合否は判定しない。'};
}
