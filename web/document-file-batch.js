/** Register in sequence; never retry a successful or uncertain request automatically. */
export async function processDocumentFiles(files, register) {
  const successes=[],errors=[];
  for (const [index,file] of Array.from(files).entries()) {
    try {
      if (!file?.size) throw Error('空のファイルは登録できません。');
      if (file.size>5000000) throw Error('1ファイル5 MBまでです。');
      if (!/\.(pdf|png|jpe?g|webp|docx|xlsx)$/i.test(file.name)) throw Error('対応していないファイル形式です。');
      successes.push({file,value:await register(file,index)});
    } catch(error) { errors.push({file,error}); }
  }
  return {successes,errors};
}

/** Create one chat, then attach all remaining files to that same chat. */
export async function processDocumentChat(files,create,attach) {
  files=Array.from(files);
  if(files.length>9) throw Error('1つのチャットには最大9ファイルまで選択できます。');
  let chatId;
  const result=await processDocumentFiles(files,async(file,index)=>{
    if(index===0) {chatId=await create(file,index);return chatId;}
    if(!chatId) throw Error('最初の資料を登録できなかったため、追加していません。');
    return attach(chatId,file,index);
  });
  return {...result,chatId};
}
