export class RecognitionNoiseGuard{
 constructor(){this.rows=[];this.paused=false;}
 observe(reason,now=Date.now()){
  if(this.paused||!Number.isFinite(now)||now<0)return false;
  const rejected=['empty','model_no_speech','nonverbal','low_confidence'].includes(reason);
  if(!rejected&&reason!=='accepted')return false;
  this.rows=this.rows.filter(r=>now>=r.at&&now-r.at<=30000);
  this.rows.push({at:now,rejected});this.rows=this.rows.slice(-10);
  const count=this.rows.filter(r=>r.rejected).length;
  if(count>=8&&count/this.rows.length>=.8){this.paused=true;return true;}return false;
 }
}
