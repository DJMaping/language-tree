import fs from 'node:fs';
import { createProject } from '../js/engine/project.js';
import { syllabify, assignStress } from '../js/engine/phonology/phonotactics.js';
import { isVowel } from '../js/engine/features.js';

const doc = JSON.parse(fs.readFileSync('data/languages.json','utf8'));
const cfgs = JSON.parse(fs.readFileSync('data/lang-config.json','utf8'));
const byId = new Map(doc.languages.map(l=>[l.id,l]));
const rootOf = (l)=>{let c=l;while(c.parentId)c=byId.get(c.parentId);return c.id;};

// Where does the stress mark actually sit, vs where this stage's own rule would put it?
for (const [famRoot,cfg] of Object.entries(cfgs)) {
  if (famRoot.startsWith('_')) continue;
  const tree = doc.languages.filter(l=>rootOf(l)===famRoot);
  const project = createProject({tree, names: tree.map(l=>l.name), config:{...cfg, rootId:famRoot, presentYear:doc.config.presentYear}, sidecar:{}});
  let tot=0, conform=0, none=0, multi=0;
  const leaves = tree.filter(l=>!tree.some(x=>x.parentId===l.id));
  const sample = [...leaves.slice(0,6)];
  for (const node of sample) {
    const st = project.stateOf(node.id);
    if (!st) continue;
    for (const e of st.entries) {
      const sylls = syllabify(e.form, st.phonotactics);
      const actual = [];
      let n=0;
      sylls.forEach((s,i)=>{ for(const v of s.nucleus){ if(v.f.stress===1) actual.push(i); } });
      tot++;
      if (!actual.length) { none++; continue; }
      if (actual.length>1) multi++;
      const want = assignStress(syllabify(e.form, st.phonotactics), st.phonotactics.stress?.rule).findIndex(s=>s.stress===1);
      if (actual[0]===want) conform++;
    }
  }
  const protoSt = project.stateOf(famRoot);
  const leafSt = project.stateOf(leaves[leaves.length-1].id);
  const classes = new Set(protoSt.entries.map(e=>e.class).filter(Boolean));
  const nullCls = protoSt.entries.filter(e=>e.class===null).length;
  console.log(`${(cfg.name||famRoot).padEnd(18)} stress=${String(cfg.stress||'penultimate').padEnd(15)} ` +
    `conformant=${(100*conform/tot).toFixed(1)}%  unstressed=${(100*none/tot).toFixed(1)}%  multi=${multi}  ` +
    `protoCoda.max=${protoSt.phonotactics.coda.max} allowed=[${protoSt.phonotactics.coda.allowed.join('')}] ` +
    `leafCoda=[${leafSt.phonotactics.coda.allowed.join('')}] classes=${classes.size} nullClass=${nullCls} n=${protoSt.entries.length}`);
}
