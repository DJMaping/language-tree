import fs from 'node:fs';
import { createProject } from '../js/engine/project.js';
import { syllabify, assignStress } from '../js/engine/phonology/phonotactics.js';
import { wordToIpa, wordToIpaStressed, isVowel } from '../js/engine/features.js';
import { classOf } from '../js/engine/lexicon/roots.js';

const doc = JSON.parse(fs.readFileSync('data/languages.json','utf8'));
const cfgs = JSON.parse(fs.readFileSync('data/lang-config.json','utf8'));
const byId = new Map(doc.languages.map(l=>[l.id,l]));
const rootOf = (l)=>{let c=l;while(c.parentId)c=byId.get(c.parentId);return c.id;};

for (const [famRoot,cfg] of Object.entries(cfgs)) {
  if (famRoot.startsWith('_')) continue;
  const tree = doc.languages.filter(l=>rootOf(l)===famRoot);
  const project = createProject({tree, names:tree.map(l=>l.name), config:{...cfg, rootId:famRoot, presentYear:doc.config.presentYear}, sidecar:{}});
  const leaves = tree.filter(l=>!tree.some(x=>x.parentId===l.id));
  const leaf = leaves[leaves.length-1];
  const st = project.stateOf(leaf.id);
  const proto = project.stateOf(famRoot);

  let poly=0, polyConf=0; const bad=[];
  for (const e of st.entries) {
    const sylls = syllabify(e.form, st.phonotactics);
    if (sylls.length<2) continue;
    poly++;
    const idx=[]; sylls.forEach((s,i)=>{ if(s.nucleus.some(v=>v.f.stress===1)) idx.push(i); });
    const want = assignStress(syllabify(e.form, st.phonotactics), st.phonotactics.stress.rule).findIndex(s=>s.stress===1);
    if (idx.length===1 && idx[0]===want) polyConf++;
    else if (bad.length<3) bad.push(`${wordToIpaStressed(e.form)} '${e.gloss}' (rule would give syll ${want}, has ${idx.join('+')})`);
  }
  // classOf recompute drift
  let moved=0, inflecting=0, newClasses=new Set();
  for (const e of st.entries) {
    if (e.class==null) continue; inflecting++;
    const now = classOf(e.form, e.pos);
    if (now !== e.class) moved++;
    newClasses.add(now);
  }
  const protoClasses=new Set(proto.entries.map(e=>e.class).filter(Boolean));
  const protoConsFinal = proto.entries.filter(e=>e.class!=null && !isVowel(e.form[e.form.length-1])).length;
  console.log(`${(cfg.name||famRoot).padEnd(18)} leaf=${leaf.name}`);
  console.log(`   polysyllables ${poly}: rule-conformant stress ${(100*polyConf/poly).toFixed(1)}%`);
  console.log(`   proto consonant-final inflecting stems: ${protoConsFinal}   proto classes ${[...protoClasses].sort().join(',')}`);
  console.log(`   classOf recomputed on leaf forms: ${(100*moved/inflecting).toFixed(1)}% move; class set becomes ${[...newClasses].sort().join(',')}`);
  for (const b of bad) console.log(`   e.g. ${b}`);
}
