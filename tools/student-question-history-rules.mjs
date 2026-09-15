// Add only the history permission to CURRENT deployed rules. The repository's
// firestore.rules is an incomplete shared-project template and is never deployed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const HISTORY_RULE = `
    // BEGIN permanent-student-question-history-v1
    function isPermanentStudentHistoryPath() {
      return request.path[3] == 'users'
        && request.path != /databases/$(request.path[1])/documents/users
        && request.path != /databases/$(request.path[1])/documents/users/$(request.path[4])
        && request.path[5] == 'questionHistory';
    }
    match /users/{historyUid}/questionHistory/{historyScope}/entries/{historyMarker} {
      allow read: if request.auth != null && request.auth.uid == historyUid;
      allow create: if request.auth != null && request.auth.uid == historyUid
        && historyScope.matches('^(math|science)-[a-f0-9]{64}$')
        && historyMarker.matches('^[a-f0-9]{64}$')
        && request.resource.data.keys().hasOnly(['kind', 'value', 'at'])
        && request.resource.data.kind in ['id', 'content']
        && request.resource.data.value is string
        && request.resource.data.value.size() > 0
        && request.resource.data.value.size() <= 1500
        && request.resource.data.at is number && request.resource.data.at > 0;
      // Exposures are immutable: client resets cannot erase a student's history.
      allow update, delete: if false;
    }
    // END permanent-student-question-history-v1
`;

export function addHistoryRule(source) {
  if (typeof source !== 'string') throw new Error('No production rules source.');
  if (source.includes(HISTORY_RULE)) return source;
  if (source.includes('permanent-student-question-history-v1') || /match\s+[^\n]*questionHistory/.test(source))
    throw new Error('An existing history rule needs review; refusing to replace it automatically.');
  // Match only code, never a commented sample of the documents scope.
  const pattern = /^[ \t]*match\s+\/databases\/\{[\w]+\}\/documents\s*\{/gm;
  const matches = Array.from(source.matchAll(pattern));
  if (matches.length !== 1 || !/service\s+cloud\.firestore\s*\{/.test(source))
    throw new Error('Unrecognized production Firestore scope; no rules changed.');
  const index = matches[0].index + matches[0][0].length;
  let updated = source.slice(0, index) + HISTORY_RULE + source.slice(index);
  // The live project may use the starter blanket permission. Firestore ORs
  // matching allows, so it must exclude ONLY this new namespace. Every existing
  // collection retains exactly the same behavior, including nested users data.
  const replacements = [];
  const blanket = /(match\s+\/\{\w+=\*\*\}\s*\{\s*allow\s+(?:read\s*,\s*write|write\s*,\s*read)\s*:\s*if\s+)true(\s*;\s*\})/g;
  updated = updated.replace(blanket, (whole, before, after) => {
    const replacement = before + '!isPermanentStudentHistoryPath()' + after;
    replacements.push([replacement, whole]); return replacement;
  });
  let restored = updated.replace(HISTORY_RULE, '');
  for (const [replacement, original] of replacements) restored = restored.replace(replacement, original);
  if (restored !== source) throw new Error('Existing rules changed unexpectedly.');
  return updated;
}

export function historyRuleTests() {
  const path = '/databases/(default)/documents/users/history-test-owner/questionHistory/math-' + 'a'.repeat(64) + '/entries/' + 'b'.repeat(64);
  const data = { kind: 'id', value: 'history-test-question', at: 1 };
  const make = (method, uid, expectation, value = data) => ({ expectation,
    request: { path, method, auth: uid ? { uid, token: { sub: uid, admin: false } } : null,
      ...(method === 'create' || method === 'update' ? { resource: { data: value } } : {}) },
    ...(method !== 'create' ? { resource: { data } } : {}) });
  return [make('get', 'history-test-owner', 'ALLOW'), make('list', 'history-test-owner', 'ALLOW'),
    make('get', 'another-student', 'DENY'), make('get', null, 'DENY'),
    make('create', 'history-test-owner', 'ALLOW'), make('create', 'another-student', 'DENY'),
    make('update', 'history-test-owner', 'DENY'), make('delete', 'history-test-owner', 'DENY'),
    make('create', 'history-test-owner', 'DENY', { ...data, extra: true }),
    make('create', 'history-test-owner', 'DENY', { ...data, value: '' }),
    make('create', 'history-test-owner', 'DENY', { ...data, kind: 'answer' }),
    make('create', 'history-test-owner', 'DENY', { ...data, at: -1 })];
}

export function legacyRuleTests() {
  // These synthetic reads/writes are evaluated by the rules test API only;
  // they never read or modify actual student documents.
  const roots = ['users', 'users/history-test-owner', 'users/history-test-owner/settings/profile',
    'users/history-test-owner/mathQuestionProgress/q', 'questionAttempts/q', 'questions/q',
    'scienceQuestions/q', 'scanPapers/q'];
  return roots.flatMap(root => ['get', 'list', 'create', 'update', 'delete'].map(method => ({
    expectation: 'ALLOW', request: { path: '/databases/(default)/documents/' + root, method,
      auth: null, ...(method === 'create' || method === 'update' ? { resource: { data: { test: true } } } : {}) },
    ...(method !== 'create' ? { resource: { data: { test: true } } } : {})
  })));
}

export async function publishHistoryRule({ request, project = 'mathgen--app', deploy = false }) {
  if (project !== 'mathgen--app') throw new Error('Unexpected shared Firebase project.');
  const releasePath = `projects/${project}/releases/cloud.firestore`;
  const previous = await request(releasePath);
  const production = await request(previous.rulesetName);
  const originals = production.source?.files;
  if (!Array.isArray(originals) || originals.length !== 1) throw new Error('Unexpected rules source bundle.');
  const content = addHistoryRule(originals[0].content);
  const source = { files: [{ name: originals[0].name, content }] };
  const testCases = historyRuleTests();
  if (content.includes('allow read, write: if !isPermanentStudentHistoryPath()')) testCases.push(...legacyRuleTests());
  const validation = await request(`projects/${project}:test`, { method: 'POST', body: { source, testSuite: { testCases } } });
  const errors = (validation.issues || []).filter(issue => issue.severity === 'ERROR');
  if (errors.length || validation.testResults?.length !== testCases.length
    || validation.testResults.some(result => result.state !== 'SUCCESS')) {
    throw new Error('History rules validation failed: ' + JSON.stringify({ errors, results: validation.testResults }));
  }
  const hash = createHash('sha256').update(content).digest('hex');
  if (!deploy || content === originals[0].content) return { deployed: deploy, changed: false,
    validated: testCases.length, ruleset: previous.rulesetName, sourceSha256: hash };
  // Compile before changing the active release. All previous permissions survive.
  const candidate = await request(`projects/${project}/rulesets`, { method: 'POST', body: { source } });
  const latest = await request(releasePath);
  if (latest.rulesetName !== previous.rulesetName) throw new Error('Production rules changed during validation. Retry against the latest rules.');
  await request(releasePath, { method: 'PATCH', body: {
    release: { name: releasePath, rulesetName: candidate.name }, updateMask: 'rulesetName'
  } });
  const live = await request(releasePath);
  if (live.rulesetName !== candidate.name) throw new Error('Could not verify the published history rules.');
  return { deployed: true, changed: true, validated: testCases.length, previousRuleset: previous.rulesetName,
    ruleset: live.rulesetName, sourceSha256: hash };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Credential stays in process memory. Never print it or write it to an artifact.
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const request = async (path, options = {}) => {
    const response = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
      method: options.method || 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`Firebase rules API ${response.status}: ${result.error?.message || 'request failed'}`);
    return result;
  };
  console.log(JSON.stringify(await publishHistoryRule({ request, deploy: process.argv.includes('--deploy') }), null, 2));
}
