// Explicit comparison profiles. Production calls without a profile keep beam 5.
export const RECOGNITION_PROFILES=Object.freeze({baseline:Object.freeze({beamSize:5}),beam1:Object.freeze({beamSize:1})});
export function recognitionDecoding(profile='baseline'){
 if(!Object.hasOwn(RECOGNITION_PROFILES,profile))throw new RangeError('Unknown recognition profile');
 return RECOGNITION_PROFILES[profile];
}
