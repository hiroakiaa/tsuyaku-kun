import {createHash} from 'node:crypto';
function canonical(value){if(value instanceof RegExp)return {$regex:value.source,$flags:value.flags};if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
export function documentTestFingerprint(specification){return createHash('sha256').update(JSON.stringify(canonical(specification))).digest('hex');}
export function requireSameDocumentTests(before,after){if(!before.testFingerprint||!after.testFingerprint)throw Error('Legacy test record has no complete specification fingerprint');if(before.testFingerprint!==after.testFingerprint)throw Error('Questions, expected evidence or document recipe changed');return true;}
