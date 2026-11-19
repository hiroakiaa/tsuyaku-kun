export function previewFitScale(width,height,availableWidth,availableHeight){
 if(![width,height,availableWidth,availableHeight].every(value=>Number.isFinite(value)&&value>0))return 1;
 return Math.min(availableWidth/width,availableHeight/height);
}
