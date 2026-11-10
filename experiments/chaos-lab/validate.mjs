import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync(new URL('../../frontend/src/types.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},crypto:globalThis.crypto};
vm.runInNewContext(js,context);
for(const file of ['study-template.json','study-template-typed-consent.json']) {
 const t=JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
 assert.equal(t.stages.length,20);
 assert.equal(t.stages.filter(s=>s.features.ai).length,18);
 assert.equal(t.stages.filter(s=>s.type==='consent').length,1);
 assert.equal(context.exports.getPublishErrors({...t,status:'Draft'}).length,0,JSON.stringify(context.exports.getPublishErrors({...t,status:'Draft'})));
 const types=new Set(t.stages.map(s=>s.type));
 for(const {type} of context.exports.STAGE_TYPES) assert(types.has(type),type);
 const components=t.stages.flatMap(s=>s.components);
 for(const type of ['text','textbox','choice','checkbox','true_false','rating','signature','attachment','button']) assert(components.some(c=>c.type===type),type);
 const ids=[...t.stages.map(s=>s.id),...components.map(c=>c.id)];
 assert.equal(new Set(ids).size,ids.length);
 for(const key of Object.keys(t.stages[0].features)) assert(t.stages.some(s=>s.features[key]),key);
 for(const c of components.filter(c=>['choice','checkbox','rating','true_false'].includes(c.type))) {
  assert(c.options.length>=2 && c.options.length<=12);
  assert.equal(new Set(c.options).size,c.options.length);
  if(c.otherOption) assert(c.options.includes(c.otherOption));
 }
 console.log(`${file}: publication checks passed; 20 stages, 8 stage types, 9 component types, 11 feature flags, 18 AI stages.`);
}
