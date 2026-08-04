import fs from 'node:fs';
import { createProject } from './js/engine/project.js';
import { SENTENCES, renderSentence, readerSafe, READER_ALPHABET } from './js/engine/text/sentence.js';
const doc=JSON.parse(fs.readFileSync('data/languages.json','utf8'));
const configs=JSON.parse(fs.readFileSync('data/lang-config.json','utf8'));
const byId=new Map(doc.languages.map(l=>[l.id,l]));
const rootOf=(l)=>{let c=l;while(c.parentId)c=byId.get(c.parentId);return c.id;};
// Amazon Polly / ipa-reader's usable IPA subset (en-US voices).
const SAFE=READER_ALPHABET;
const seen=new Map();
for (const [fam,cfg] of Object.entries(configs)){
  if(fam.startsWith('_'))continue;
  const tree=doc.languages.filter(l=>rootOf(l)===fam); if(!tree.length)continue;
  const project=createProject({tree,names:tree.map(l=>l.name),config:{...cfg,rootId:fam,presentYear:doc.config.presentYear},sidecar:{},borrowings:doc.borrowings||[]});
  for(const n of tree){
    let st; try{st=project.stateOf(n.id);}catch(e){continue;}
    for(const s of SENTENCES.slice(0,3)){
      let r; try{r=renderSentence(st,s);}catch(e){continue;}
      const txt=r.readerIpa||readerSafe(r.ipa||'');
      for(const ch of txt) if(!SAFE.has(ch)) seen.set(ch,(seen.get(ch)||0)+1);
    }
  }
}
console.log('characters surviving readerSafe that Polly cannot pronounce:\n');
for(const [c,n] of [...seen.entries()].sort((a,b)=>b[1]-a[1]))
  console.log(`  ${JSON.stringify(c)}  U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}  x${n}`);
console.log(`\n${seen.size} distinct unpronounceable characters.`);
