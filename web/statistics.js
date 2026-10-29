// Latencies: median averages the two central samples; other percentiles use nearest rank.
export function percentile(values=[],p=.5){
 if(!Number.isFinite(p)||p<0||p>1)return null;
 const a=values.filter(v=>Number.isFinite(v)&&v>=0).sort((a,b)=>a-b);
 if(!a.length)return null;
 if(p===.5){const middle=Math.floor(a.length/2);return a.length%2?a[middle]:(a[middle-1]+a[middle])/2;}
 return a[Math.max(0,Math.ceil(a.length*p)-1)];
}
export const median=values=>percentile(values,.5);
