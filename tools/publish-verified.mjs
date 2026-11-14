import {spawnSync} from 'node:child_process';

const root=new URL('../',import.meta.url),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function run(command,args,{allowFailure=false}={}){
 const result=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 if(result.status!==0&&!allowFailure)throw Error((result.stderr||result.stdout||`${command} failed`).trim());
 return result;
}
const status=run('git',['status','--porcelain']).stdout.trim();
if(status)throw Error('未コミットの変更があります。意図したファイルだけをコミットしてから公開してください。');
run('git',['fetch','origin','main']);
if(run('git',['merge-base','--is-ancestor','origin/main','HEAD'],{allowFailure:true}).status!==0)throw Error('公開中のmainより古い履歴です。最新版へ変更を載せ直してから公開してください。');
console.log('1/4 最新版との前後関係を確認しました。');
run(process.execPath,['--experimental-vm-modules','tests/run.mjs']);
for(const file of ['lesson-economy.mjs','group-chat.mjs','chat-recovery.mjs','reliability20.mjs','document-qa.mjs'])run(process.execPath,[`tests/${file}`]);
run(process.execPath,['--test','tests/live-translation.mjs']);
console.log('2/4 全テストを通過しました。');
const push=run('git',['push','origin','HEAD:main'],{allowFailure:true});
if(push.status!==0){
 console.error((push.stderr||push.stdout).trim());
 console.error('\nGitHub認証が利用できません。右側に提示されたGitHub連携を接続し、同じコミットを公開してください。ブラウザーで複数ファイルを個別編集しないでください。');
 process.exit(2);
}
console.log('3/4 GitHub mainへ公開しました。');
let lastError='';
for(let attempt=1;attempt<=30;attempt++){
 const verify=run(process.execPath,['tools/verify-release.mjs'],{allowFailure:true});
 if(verify.status===0){console.log(verify.stdout.trim());console.log('4/4 画面とAPIの公開版が一致しました。');process.exit(0);}
 lastError=(verify.stderr||verify.stdout).trim();await wait(10000);
}
throw Error('公開処理は開始しましたが、5分以内に画面とAPIの版が一致しませんでした。\n'+lastError);
