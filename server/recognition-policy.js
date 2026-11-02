// Explicit comparison profiles. Production calls without a profile keep beam 5.
export const RECOGNITION_PROFILES=Object.freeze({baseline:Object.freeze({beamSize:5,vadFilter:true}),beam1:Object.freeze({beamSize:1,vadFilter:true}),client_vad:Object.freeze({beamSize:5,vadFilter:false})});
export function recognitionDecoding(profile='baseline'){
 if(!Object.hasOwn(RECOGNITION_PROFILES,profile))throw new RangeError('Unknown recognition profile');
 return RECOGNITION_PROFILES[profile];
}
