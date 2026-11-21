const key='tsuyaku-document-reading-v1';
const choices={size:['standard','large','largest'],spacing:['compact','comfortable'],contrast:['standard','high'],motion:['system','reduce']};
export function readingSettings(value){
 return Object.fromEntries(Object.entries(choices).map(([name,values])=>[name,values.includes(value?.[name])?value[name]:values[0]]));
}
export function reducedDocumentMotion(){
 return document.documentElement.dataset.readingMotion==='reduce'||matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function installDocumentReadingSettings(root){
 const controls=[...root.querySelectorAll('[data-reading-setting]')],status=root.querySelector('#reading-status');
 const load=()=>{try{return readingSettings(JSON.parse(localStorage.getItem(key)))}catch{return readingSettings()}};
 function apply(value){for(const [name,setting] of Object.entries(value))document.documentElement.dataset['reading'+name[0].toUpperCase()+name.slice(1)]=setting;for(const control of controls)control.value=value[control.dataset.readingSetting];}
 apply(load());
 for(const control of controls)control.addEventListener('change',()=>{
  const value=readingSettings(Object.fromEntries(controls.map(control=>[control.dataset.readingSetting,control.value])));apply(value);
  try{localStorage.setItem(key,JSON.stringify(value));status.textContent='表示設定を保存しました';}catch{status.textContent='この画面に表示設定を適用しました';}
 });
 window.addEventListener('storage',event=>{if(event.key===key)apply(load());});
}
