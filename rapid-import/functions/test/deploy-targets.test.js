import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deploymentTargets} from '../../deploy-targets.mjs';

const source=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
const names=['mathRapidImportStatus','mathRapidImportBegin','mathRapidImportChunk','mathRapidImportFinish','mathRapidImportRetry','mathRapidImportDispatch','mathRapidImportPage'];
const artifacts={cleanupPolicies:{existingPolicy:{action:'DELETE'}}};
const endpoint=(id,overrides={})=>({id,codebase:'math-rapid-import',region:'us-central1',platform:'gcfv2',
  ...(id==='mathRapidImportDispatch'?{eventTrigger:{eventType:'google.cloud.firestore.document.v1.written'}}:
    id==='mathRapidImportPage'?{taskQueueTrigger:{}}:{callableTrigger:{}}),...overrides});
const inventory=(result=names.map(id=>endpoint(id)))=>({status:'success',result});
const select=(rows,policy=artifacts,code=source)=>deploymentTargets(code,rows,policy,'us-central1');

test('valid existing or new deployments select only seven codebase-qualified functions',()=>{
  const expected=names.map(name=>'functions:math-rapid-import:'+name).join(',');
  assert.equal(select(inventory()),expected);
  assert.equal(select(inventory([])),expected);
  const rows=inventory().result;
  rows[0]={id:names[0],codebase:'default',region:'us-central1',platform:'gcfv2',httpsTrigger:{}};
  rows.push(endpoint('scienceImporter',{codebase:'cer-import',platform:'gcfv1',region:'europe-west1'}));
  assert.equal(select(inventory(rows)),expected);
});
test('a missing, extra or changed source export cannot produce a forced deployment',()=>{
  for(const code of [source.replace('export const mathRapidImportChunk','const mathRapidImportChunk'),
    source+'\nexport const unexpected = onCall({},()=>{});',
    source.replace('export const mathRapidImportStatus = onCall','export const mathRapidImportStatus = onTaskDispatched')]) {
    assert.throws(()=>select(inventory(),artifacts,code),/seven expected/);
  }
});
test('matching name prefixes in this codebase cannot enter a deletion plan',()=>{
  assert.throws(()=>select(inventory([...inventory().result,endpoint('mathRapidImportPage-previous')])),/possible deletion/);
  assert.doesNotThrow(()=>select(inventory([...inventory().result,endpoint('mathRapidImportPage-previous',{codebase:'another-codebase'})])));
});
test('same-name functions cannot migrate region, generation or ownership',()=>{
  for(const override of [{region:'europe-west1'},{platform:'gcfv1'},{codebase:'cer-import'}]) {
    assert.throws(()=>select(inventory([endpoint(names[0],override)])),/ownership, region or generation/);
  }
  assert.throws(()=>select(inventory([endpoint(names[0]),endpoint(names[0])])),/ownership, region or generation/);
});
test('same-name functions cannot change trigger types',()=>{
  const bad=endpoint('mathRapidImportDispatch');bad.eventTrigger.eventType='google.cloud.pubsub.topic.v1.messagePublished';
  assert.throws(()=>select(inventory([bad])),/trigger type/);
  const worker=endpoint('mathRapidImportPage');delete worker.taskQueueTrigger;worker.httpsTrigger={};
  assert.throws(()=>select(inventory([worker])),/trigger type/);
});
test('shared artifact retention must already be configured or explicitly opted out',()=>{
  assert.doesNotThrow(()=>select(inventory(),{labels:{'firebase-functions-cleanup-opted-out':'true'}}));
  for(const policy of [null,{}, {cleanupPolicies:{}},{cleanupPolicies:[]},{labels:{'firebase-functions-cleanup-opted-out':'false'}}]) {
    assert.throws(()=>select(inventory(),policy),/no cleanup policy or explicit opt-out/);
  }
});
test('missing or malformed deployed metadata fails closed',()=>{
  for(const rows of [null,{status:'error',result:[]},{status:'success',result:{}},inventory([null])]) {
    assert.throws(()=>select(rows),/inventory|metadata/);
  }
});
test('script verifies metadata then force-deploys the validated list and cleans temporary files',()=>{
  const script=fs.readFileSync(new URL('../../deploy-cloud-shell.sh',import.meta.url),'utf8');
  assert.match(script,/functions:list[^\n]+>"\$rapid_inventory"/);
  assert.match(script,/artifacts repositories describe[^\n]+>"\$rapid_artifacts"/);
  assert.match(script,/rapid_targets=\$\(node deploy-targets\.mjs/);
  assert.match(script,/rapid_firebase deploy[^\n]+--only "\$rapid_targets" --non-interactive --force/);
  assert.doesNotMatch(script,/--only functions:math-rapid-import(?:\s|$)/);
  assert.match(script,/rm -f -- "\$rapid_inventory"/);assert.match(script,/rm -f -- "\$rapid_artifacts"/);
});
