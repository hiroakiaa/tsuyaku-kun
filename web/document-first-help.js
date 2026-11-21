const key='tsuyaku-document-first-help-v1';
export function installDocumentFirstHelp(form,{hasConversation=false}={}){
 let seen=false;
 for(const storage of [()=>localStorage,()=>sessionStorage])try{seen ||= storage().getItem(key)==='1';}catch{}
 if(seen||hasConversation)return;
 const note=document.createElement('aside');note.className='document-first-help';note.setAttribute('role','note');
 const text=document.createElement('span');text.textContent='資料を見ながら質問できます。回答のページ番号で根拠を確認できます。';
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','操作案内を閉じる');
 note.append(text,close);form.before(note);
 const dismiss=()=>note.remove();close.onclick=dismiss;
 form.addEventListener('submit',()=>{if(form.querySelector('input')?.value.trim())dismiss();});
 for(const storage of [()=>localStorage,()=>sessionStorage])try{storage().setItem(key,'1');}catch{}
 return dismiss;
}
