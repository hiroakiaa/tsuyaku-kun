// Shared estimates and app safety limits. These are not provider billing balances.
// On any model, language fan-out, cache, retry, OCR or speech change, review
// docs/cost-review.md and the admin estimate tests before releasing.
export const COST_POLICY_VERSION='20261031-azure-free-1';
export const TRANSLATION_PRICE={checkedAt:'2026-10-22',model:'@cf/google/gemma-4-26b-a4b-it',inputPerMillion:.10,outputPerMillion:.30};
export const RECOGNITION_PRICE={checkedAt:'2026-10-30',whisperPerMinute:.000513,streamPerMinute:.0092,streamModel:'@cf/deepgram/nova-3'};
export const AI_LIMITS={globalUSD:.08,userUSD:.02,userCalls:1000};
export const AZURE_F0_POLICY={checkedAt:'2026-10-31',sku:'F0',providerMonthCharacters:2000000,characters:1900000,userCharacters:200000,rollingDays:32};
export const SPEECH_POLICY={checkedAt:'2026-10-22',monthCharacters:500000,userCharacters:50000,perMillionCharacters:4,providerFreeCharacters:4000000};
export const PHOTO_POLICY={checkedAt:'2026-10-22',monthRequests:900,userRequests:100,rollingDays:32,perThousandRequests:1.50,providerFreeRequests:1000};
export const COST_SOURCES={translation:'https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/',speech:'https://cloud.google.com/text-to-speech/pricing',photo:'https://cloud.google.com/vision/pricing'};
export function translationScenario(source,targets){const clean=c=>typeof c==='string'&&/^[a-z]{2,3}(?:-[A-Za-z]+)?$/.test(c);source=source==='ja-easy'?'ja':source;if(!clean(source)||!Array.isArray(targets))return null;return {source,targets:[...new Set(targets.filter(clean))].filter(c=>c!==source).sort()};}
export function scenarioKey(source,targets){const s=translationScenario(source,targets);return s?JSON.stringify([s.source,s.targets]):null;}
