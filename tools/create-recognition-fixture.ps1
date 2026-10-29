param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../checks/recognition-probe'))
# Synthetic test speech only. Never reads a microphone or user recordings.
Add-Type -AssemblyName System.Speech
$targetDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
$cases = @(
 @{id='ja-negative';language='ja';voice='Microsoft Haruka Desktop';text='答えは十五ではありません。';patterns=@('15|十五','ではありません|じゃありません|ではない')},
 @{id='ja-math';language='ja';voice='Microsoft Haruka Desktop';text='三かける四は十二です。';patterns=@('3|三','4|四','12|十二')},
 @{id='en-negative';language='en';voice='Microsoft Zira Desktop';text='The answer is not fifteen.';patterns=@('not','fifteen|15')},
 @{id='en-question';language='en';voice='Microsoft Zira Desktop';text='Do you like mathematics?';patterns=@('you','like','math')}
)
try {
 $synth.Rate=1
 foreach($case in $cases){$synth.SelectVoice($case.voice);$synth.SetOutputToWaveFile((Join-Path $targetDirectory ($case.id+'.wav')),$format);$synth.Speak($case.text);$synth.SetOutputToNull()}
 $cases | Select-Object id,language,text,patterns | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $targetDirectory 'cases.json') -Encoding utf8
 Write-Output ('Synthetic fixture created: '+$targetDirectory)
} finally {$synth.Dispose()}
