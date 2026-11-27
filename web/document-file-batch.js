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
