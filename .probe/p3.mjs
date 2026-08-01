import fs from 'node:fs';
import { createProject } from '../js/engine/project.js';
import { syllabify } from '../js/engine/phonology/phonotactics.js';
import { wordToIpa, wordToIpaStressed } from '../js/engine/features.js';

const doc = JSON.parse(fs.readFileSync('data/languages.json','utf8'));
const cfgs = JSON.parse(fs.readFileSync('data/lang-config.json','utf8'));
const byId = new Map(doc.languages.map(l=>[l.id,l]));
const rootOf = (l)=>{let c=l;while(c.parentId)c=byId.get(c.parentId);return c.id;};

for (const [famRoot,cfg] of Object.entries(cfgs)) {
  if (famRoot.startsWith('_')) continue;
  const tree = doc.languages.filter(l=>rootOf(l)===famRoot);
  const project = createProject({tree, names:tree.map(l=>l.name), config:{...cfg, rootId:famRoot, presentYear:doc.config.presentYear}, sidecar:{}});
  const leaves = tree.filter(l=>!tree.some(x=>x.parentId===l.id)).slice(0,6);
  let tot=0, twoPrimary=0, secondaryMark=0;
  let homoPlain=0, splitByStress=0, splitBySecondaryOnly=0;
  for (const node of leaves) {
    const st = project.stateOf(node.id); if(!st) continue;
    const groups = new Map();
    for (const e of st.entries) {
      tot++;
      const sylls = syllabify(e.form, st.phonotactics);
      const idx = new Set();
      sylls.forEach((s,i)=>{ for(const v of s.nucleus) if(v.f.stress===1) idx.add(i); });
      if (idx.size>1) twoPrimary++;
      const marked = wordToIpaStressed(e.form);
      if (marked.includes('ˌ')) secondaryMark++;
      const k = wordToIpa(e.form);
      if(!groups.has(k)) groups.set(k, new Set());
      groups.get(k).add(marked);
    }
    for (const [k,set] of groups) {
      if (set.size>1) {
        splitByStress += set.size-1;
        const stripSec = new Set([...set].map(s=>s.replace(/ˌ/g,'')));
        if (stripSec.size===1) splitBySecondaryOnly += set.size-1;
      }
    }
  }
  console.log(`${(cfg.name||famRoot).padEnd(18)} forms=${tot}  >1 primary-stressed syllable=${twoPrimary} (${(100*twoPrimary/tot).toFixed(1)}%)  carries ˌ=${secondaryMark} (${(100*secondaryMark/tot).toFixed(1)}%)  plain-IPA groups split by stress mark=${splitByStress}  of which by SECONDARY mark only=${splitBySecondaryOnly}`);
}
