import {withEasyJapanese,LANGUAGE_ORDER} from './core.js';

export function selectableCatalog(data){
 const catalog=withEasyJapanese(data);
 return {...catalog,languages:catalog.languages.filter(language=>LANGUAGE_ORDER.includes(language.code))};
}
