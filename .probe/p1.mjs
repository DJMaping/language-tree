import { syllabify, flatten, DEFAULT_PT } from '../js/engine/phonology/phonotactics.js';
import { parseWord } from '../js/engine/features.js';
const pts = [
  DEFAULT_PT,
  { ...DEFAULT_PT, onset: { max: 0, sonorityMinDistance: 9, licensedExceptions: [], forbidden: [] }, coda: { max: 0, allowed: [] } },
  { ...DEFAULT_PT, onset: { max: 1, sonorityMinDistance: 5, licensedExceptions: [], forbidden: ['p','t','k','s','n','m','r','l','j','w'] }, coda: { max: 0, allowed: [] } },
];
const words = ['strɛŋkθs','a','ptka','ŋ','kʰusəm','tra','rpa','aiau','ababa','mkrt'];
let bad = 0, tested = 0;
for (const pt of pts) for (const w of words) {
  const segs = parseWord(w);
  const out = flatten(syllabify(segs, pt));
  tested++;
  if (out.length !== segs.length) { bad++; console.log('LOSSY', w, segs.length, out.length); }
}
console.log(`syllabify losslessness: ${tested} cases, ${bad} lossy`);
