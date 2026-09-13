import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDeploymentParams,readModelDefaults} from '../../prepare-params.mjs';

const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
const defaults=readModelDefaults(source);
const names=[...defaults.keys()];
const project='test-project';
function fixture(t,code=source) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-deploy-params-'));
  t.after(()=>{
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('math-deploy-params-'));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(dir,'index.js'),code);
  return {dir,target:path.join(dir,'.env.'+project)};
}
test('missing parameter dotenv is created from the worker declarations',t=>{
  const {dir,target}=fixture(t);
  assert.equal(prepareDeploymentParams(dir,project),2);
  assert.equal(fs.readFileSync(target,'utf8'),[...defaults].map(([name,value])=>name+'='+value+'\n').join(''));
  assert.equal(fs.existsSync(path.join(dir,'.secret.local')),false);
});
test('existing project overrides and unrelated content remain byte-for-byte intact',t=>{
  const {dir,target}=fixture(t);
  const original='# Teacher-selected settings\r\n'+names[0]+'="custom-provider-choice"\r\nUNRELATED=preserve-me';
  fs.writeFileSync(target,original);
  assert.equal(prepareDeploymentParams(dir,project),1);
  assert.equal(fs.readFileSync(target,'utf8'),original+'\r\n'+names[1]+'='+defaults.get(names[1])+'\r\n');
});
test('base dotenv overrides are preserved and not shadowed by new project defaults',t=>{
  const {dir,target}=fixture(t);
  const base='export '+names[0]+' = "local-choice"\n'+names[1]+'=\n';
  fs.writeFileSync(path.join(dir,'.env'),base);
  assert.equal(prepareDeploymentParams(dir,project),0);
  assert.equal(fs.existsSync(target),false);
  assert.equal(fs.readFileSync(path.join(dir,'.env'),'utf8'),base);
});
test('preparing parameters repeatedly is idempotent',t=>{
  const {dir,target}=fixture(t);
  prepareDeploymentParams(dir,project);
  const once=fs.readFileSync(target);
  assert.equal(prepareDeploymentParams(dir,project),0);
  assert.deepEqual(fs.readFileSync(target),once);
});
test('invalid or ambiguous declarations fail before changing dotenv',t=>{
  const declaration=/^const openaiModel = defineString[^\n]+/m.exec(source)[0];
  for(const changed of [source.replace(declaration,''),source+'\n'+declaration,
    source.replace(declaration,declaration.replace(/default:'[^']+'/,'default:process.env.MODEL'))]) {
    const {dir,target}=fixture(t,changed);
    fs.writeFileSync(target,'KEEP=this\n');
    assert.throws(()=>prepareDeploymentParams(dir,project),/declaration|defaults/);
    assert.equal(fs.readFileSync(target,'utf8'),'KEEP=this\n');
  }
});
test('project identifiers cannot change the dotenv destination',t=>{
  const {dir,target}=fixture(t);
  assert.throws(()=>prepareDeploymentParams(dir,'../outside'),/Invalid/);
  assert.equal(fs.existsSync(target),false);
});
test('deployment prepares parameters before invoking noninteractive Firebase deploy',()=>{
  const script=fs.readFileSync(new URL('../../deploy-cloud-shell.sh',import.meta.url),'utf8');
  const prepare=script.indexOf('node prepare-params.mjs "$RAPID_PROJECT"');
  assert.ok(prepare>=0);
  assert.ok(prepare<script.indexOf('rapid_firebase deploy --project'));
});
