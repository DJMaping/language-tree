import fs from 'node:fs';
import { createProject } from './js/engine/project.js';
import { SENTENCES, renderSentence } from './js/engine/text/sentence.js';
const doc=JSON.parse(fs.readFileSync('data/languages.json','utf8'));
const configs=JSON.parse(fs.readFileSync('data/lang-config.json','utf8'));
const byId=new Map(doc.languages.map(l=>[l.id,l]));
const rootOf=(l)=>{let c=l;while(c.parentId)c=byId.get(c.parentId);return c.id;};
for (const id of ['standard-dahen','qai','siaa']){
  const n=doc.languages.find(l=>l.id===id); const fam=rootOf(n);
  const tree=doc.languages.filter(l=>rootOf(l)===fam);
  const project=createProject({tree,names:tree.map(l=>l.name),config:{...configs[fam],rootId:fam,presentYear:doc.config.presentYear},sidecar:{},borrowings:doc.borrowings||[]});
  const st=project.stateOf(id);
  const r=renderSentence(st,SENTENCES[0]);
  console.log(`\n${n.name}   "${r.english}"`);
  console.log(`  spelling   ${r.spelling}`);
  console.log(`  true IPA   /${r.ipa}/`);
  console.log(`  PASTE THIS ${r.readerIpa}`);
}
