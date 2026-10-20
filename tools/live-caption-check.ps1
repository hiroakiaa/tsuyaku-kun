param([switch]$Browser)
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$clients=[Collections.Generic.List[System.Net.WebSockets.ClientWebSocket]]::new()
$cancel=[Threading.CancellationTokenSource]::new($(if($Browser){300000}else{60000}))
function Send-Message($client,$value){$bytes=[Text.Encoding]::UTF8.GetBytes(($value|ConvertTo-Json -Compress -Depth 12));[void]$client.SendAsync([ArraySegment[byte]]::new($bytes),[Net.WebSockets.WebSocketMessageType]::Text,$true,$cancel.Token).GetAwaiter().GetResult()}
function Receive-Message($client){$stream=[IO.MemoryStream]::new();try{do{$buffer=[byte[]]::new(65536);$part=$client.ReceiveAsync([ArraySegment[byte]]::new($buffer),$cancel.Token).GetAwaiter().GetResult();if($part.MessageType -eq [Net.WebSockets.WebSocketMessageType]::Close){throw 'Test socket closed'};$stream.Write($buffer,0,$part.Count);if($stream.Length -gt 524288){throw 'Test response too large'}}while(-not $part.EndOfMessage);return [Text.Encoding]::UTF8.GetString($stream.ToArray())|ConvertFrom-Json}finally{$stream.Dispose()}}
function Connect-Participant($token,$language){$client=[Net.WebSockets.ClientWebSocket]::new();$client.Options.SetRequestHeader('Origin','https://hiroakiaa.github.io');[void]$client.ConnectAsync([Uri]($test.api.Replace('https:','wss:')+'/rooms/'+$test.room.id+'/socket'),$cancel.Token).GetAwaiter().GetResult();$clients.Add($client);Send-Message $client @{type='auth';token=$token;key=$test.room.key;language=$language;name='Synthetic test'};do{$event=Receive-Message $client;if($event.type -eq 'error'){throw ('Test authentication rejected: '+$event.error)}}while($event.type -ne 'ready');return @{client=$client;ready=$event}}
function Wait-Event($client,$type,$id=''){for(;;){$event=Receive-Message $client;if($event.type -eq 'error'){throw $event.error};if($event.type -eq $type -and (-not $id -or $event.id -eq $id)){return $event}}}
try{
$testJson=@'
import {config} from './web/config.js';const users=[];for(let i=0;i<2;i++){const a=await(await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+config.firebase.apiKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})})).json();if(!a.idToken)throw Error('Test auth failed');users.push(a.idToken);}const r=await(await fetch(config.api+'/rooms',{method:'POST',headers:{Origin:'https://hiroakiaa.github.io',Authorization:'Bearer '+users[0],'Content-Type':'application/json'},body:JSON.stringify({mode:'interpreter',unit:'架空の学校案内・配信試験'})})).json();if(!r.id)throw Error('Test room failed');console.log(JSON.stringify({users,room:r,api:config.api}));
'@ | node --input-type=module
if($LASTEXITCODE -ne 0){throw 'Test setup failed'};$test=$testJson|ConvertFrom-Json
$owner=Connect-Participant $test.users[0] 'ja';$ownerId=$owner.ready.id
if($Browser){
$link='https://hiroakiaa.github.io/tsuyaku-kun/index.html?update=20261020-delivery-1#room='+$test.room.id+'&key='+$test.room.key+'&mode=interpreter'
Write-Output ('BROWSER_JOIN_URL='+$link)
do{$roster=Wait-Event $owner.client 'participants'}while($roster.participants.Count -lt 2)
Send-Message $owner.client @{type='caption';id='browser_forward';text='提出日は10月20日です。';final=$true;revision=0}
$receipt=Wait-Event $owner.client 'caption_delivered' ($ownerId+'_browser_forward');if($receipt.count -lt 1){throw 'No display receipt'};Write-Output 'FORWARD_DISPLAY_CONFIRMED'
for(;;){$reverse=Wait-Event $owner.client 'translation';if(-not $reverse.id.StartsWith($ownerId+'_') -and $reverse.status -eq 'ready'){break}}
Send-Message $owner.client @{type='caption_received';id=$reverse.id;revision=$reverse.revision};Write-Output ('REVERSE_TRANSLATION_CONFIRMED='+$reverse.translations.ja)
Write-Output 'WAITING_FOR_BROWSER_RELOAD'
do{$roster=Wait-Event $owner.client 'participants'}while($roster.participants.Count -ne 1)
do{$roster=Wait-Event $owner.client 'participants'}while($roster.participants.Count -lt 2)
Send-Message $owner.client @{type='caption';id='browser_restored';text='教科書を持ってきてください。';final=$true;revision=0}
$receipt=Wait-Event $owner.client 'caption_delivered' ($ownerId+'_browser_restored');if($receipt.count -lt 1){throw 'No restored display receipt'};Write-Output 'RESTORED_DISPLAY_CONFIRMED'
}else{
$guest=Connect-Participant $test.users[1] 'en'
Send-Message $owner.client @{type='caption';id='forward';text='提出日は10月20日です。';final=$true;revision=0}
$accepted=Wait-Event $owner.client 'caption_accepted' ($ownerId+'_forward');$forward=Wait-Event $guest.client 'translation' ($ownerId+'_forward');if($forward.status -ne 'ready' -or -not $forward.translations.en){throw 'Forward translation missing'}
Send-Message $guest.client @{type='caption_received';id=$forward.id;revision=0};$receipt=Wait-Event $owner.client 'caption_delivered' $forward.id;if($receipt.count -ne 1){throw 'Forward display receipt missing'}
Send-Message $owner.client @{type='caption_sync';ids=@($forward.id)};$replayed=Wait-Event $guest.client 'translation' $forward.id;if($replayed.usageId -ne $forward.usageId){throw 'Replay changed AI usage'}
Send-Message $guest.client @{type='caption';kind='text';id='reverse';text='Please bring your textbook tomorrow.';final=$true;revision=0}
$reverse=Wait-Event $owner.client 'translation';while($reverse.id -eq $forward.id){$reverse=Wait-Event $owner.client 'translation'};if($reverse.status -ne 'ready' -or -not $reverse.translations.ja){throw 'Reverse translation missing'}
Send-Message $owner.client @{type='caption_received';id=$reverse.id;revision=0};$reverseReceipt=Wait-Event $guest.client 'caption_delivered' $reverse.id;if($reverseReceipt.count -ne 1){throw 'Reverse display receipt missing'}
@{forward='passed';reverse='passed';serverAcceptance='passed';displayReceipts='passed';replayUsageUnchanged='passed';forwardTranslation=$forward.translations.en;reverseTranslation=$reverse.translations.ja}|ConvertTo-Json -Compress
}
}finally{foreach($client in $clients){$client.Abort();$client.Dispose()};$cancel.Dispose();Pop-Location}
