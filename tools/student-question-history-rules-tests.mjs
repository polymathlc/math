import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORY_RULE, addHistoryRule, historyRuleTests, legacyRuleTests, publishHistoryRule } from './student-question-history-rules.mjs';

const source = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Science, Math and Scan policies must survive exactly as deployed.
    match /science/{id} { allow read: if request.auth != null; }
    match /math/{id} { allow read: if request.auth != null; }
    match /scan/{id} { allow read: if request.auth != null; }
  }
}`;
test('inserts an additive rule while preserving every existing byte', () => {
  const result = addHistoryRule(source);
  assert.equal(result.replace(HISTORY_RULE, ''), source);
  assert.equal(addHistoryRule(result), result);
});
test('refuses ambiguous, missing or previously changed history scopes', () => {
  assert.throws(() => addHistoryRule(''));
  assert.throws(() => addHistoryRule(source + source));
  assert.throws(() => addHistoryRule(source.replace('match /science/{id}', 'match /questionHistory/{id}')));
  assert.throws(() => addHistoryRule(source + '// permanent-student-question-history-v1'));
});
test('starter blanket rules exclude only the new permanent-history namespace', () => {
  const starter = source.replace('match /science/{id} { allow read: if request.auth != null; }',
    'match /{document=**} { allow read, write: if true; }');
  const updated = addHistoryRule(starter);
  assert.match(updated, /allow read, write: if !isPermanentStudentHistoryPath\(\);/);
  assert.equal(updated.replace(HISTORY_RULE, '').replace('!isPermanentStudentHistoryPath()', 'true'), starter);
  assert.equal(addHistoryRule(updated), updated);
});
function service({ invalid = false, changed = false, current = source } = {}) {
  const calls = []; let releaseReads = 0, published = false;
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (options.method === 'PATCH') { published = true; return options.body.release; }
    if (path.endsWith('/releases/cloud.firestore')) {
      releaseReads++;
      return { rulesetName: published ? 'projects/mathgen--app/rulesets/new'
        : changed && releaseReads > 1 ? 'projects/mathgen--app/rulesets/concurrent' : 'projects/mathgen--app/rulesets/original' };
    }
    if (path.endsWith('/rulesets/original')) return { source: { files: [{ name: 'production.rules', content: current }] } };
    if (path.endsWith(':test')) return { testResults: options.body.testSuite.testCases.map(() => ({ state: invalid ? 'FAILURE' : 'SUCCESS' })) };
    if (path.endsWith('/rulesets')) return { name: 'projects/mathgen--app/rulesets/new' };
    throw new Error(`Unexpected call ${path}`);
  };
  return { request, calls };
}
test('validation never publishes or replaces an active ruleset', async () => {
  const api = service();
  const result = await publishHistoryRule({ request: api.request });
  assert.equal(result.validated, 12);
  assert.equal(result.deployed, false);
  assert.deepEqual(api.calls.map(call => call.method).filter(Boolean), ['POST']);
});
test('deploy validates, compiles and rechecks current release before publication', async () => {
  const api = service();
  const result = await publishHistoryRule({ request: api.request, deploy: true });
  assert.equal(result.deployed, true);
  assert.equal(result.changed, true);
  const compile = api.calls.find(call => call.path.endsWith('/rulesets'));
  assert.equal(compile.body.source.files[0].content.replace(HISTORY_RULE, ''), source);
  assert.equal(api.calls.filter(call => call.method === 'PATCH').length, 1);
});
test('failed policy tests and concurrent deployment cannot modify active rules', async () => {
  for (const option of [{ invalid: true }, { changed: true }]) {
    const api = service(option);
    await assert.rejects(publishHistoryRule({ request: api.request, deploy: true }));
    assert.equal(api.calls.some(call => call.method === 'PATCH'), false);
  }
});
test('already deployed rule is validated without another deployment', async () => {
  const api = service({ current: addHistoryRule(source) });
  const result = await publishHistoryRule({ request: api.request, deploy: true });
  assert.equal(result.deployed, true); assert.equal(result.changed, false);
  assert.equal(api.calls.some(call => call.method === 'PATCH'), false);
});
test('live starter permission receives legacy-path preservation checks', async () => {
  const current = source.replace('match /science/{id} { allow read: if request.auth != null; }',
    'match /{document=**} { allow read, write: if true; }');
  const api = service({ current });
  const result = await publishHistoryRule({ request: api.request });
  assert.equal(result.validated, historyRuleTests().length + legacyRuleTests().length);
});
