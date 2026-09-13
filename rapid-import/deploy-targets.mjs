// Guard the scope of --force before accepting the dispatcher's retry policy.
// Firebase's function filters also match NAME- prefixes, so inspect existing
// endpoint metadata before allowing deployment. No environment values logged.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const CODEBASE = 'math-rapid-import';
const FUNCTIONS = {
  mathRapidImportStatus:'onCall', mathRapidImportBegin:'onCall',
  mathRapidImportChunk:'onCall', mathRapidImportFinish:'onCall',
  mathRapidImportRetry:'onCall', mathRapidImportDispatch:'onDocumentWritten',
  mathRapidImportPage:'onTaskDispatched'
};

export function deploymentTargets(source, inventory, artifacts, region) {
  if (region !== 'us-central1') throw new Error('Unexpected Rapid Add deployment region.');
  const names = Object.keys(FUNCTIONS);
  const declarations = [...source.matchAll(/^\s*export\s+const\s+(\w+)\s*=\s*(\w+)\s*\(/gm)];
  if ((source.match(/^\s*export\b/gm) || []).length !== names.length
    || declarations.length !== names.length || new Set(declarations.map(m => m[1])).size !== names.length
    || declarations.some(m => FUNCTIONS[m[1]] !== m[2])) {
    throw new Error('Deployment source must define exactly the seven expected Rapid Add functions and trigger types.');
  }
  if (!inventory || inventory.status !== 'success' || !Array.isArray(inventory.result)) {
    throw new Error('Cannot verify the deployed functions inventory.');
  }
  const seen = new Set();
  for (const endpoint of inventory.result) {
    if (!endpoint || typeof endpoint.id !== 'string') throw new Error('Invalid deployed function metadata.');
    const codebase = endpoint.codebase || 'default';
    if (codebase === CODEBASE && names.some(name => endpoint.id.startsWith(name+'-'))) {
      throw new Error('An unexpected function matches a Rapid Add deployment prefix; refusing possible deletion.');
    }
    if (!Object.hasOwn(FUNCTIONS,endpoint.id)) continue;
    if (![CODEBASE,'default'].includes(codebase) || endpoint.region !== region || endpoint.platform !== 'gcfv2'
      || seen.has(endpoint.id)) {
      throw new Error('An existing Rapid Add function would change ownership, region or generation.');
    }
    seen.add(endpoint.id);
    const triggers = ['callableTrigger','httpsTrigger','eventTrigger','taskQueueTrigger','scheduleTrigger','blockingTrigger']
      .filter(key => Object.hasOwn(endpoint,key));
    const kind = FUNCTIONS[endpoint.id];
    const valid = triggers.length === 1 && (kind === 'onCall'
      ? ['callableTrigger','httpsTrigger'].includes(triggers[0])
      : kind === 'onTaskDispatched' ? triggers[0] === 'taskQueueTrigger'
        : triggers[0] === 'eventTrigger' && endpoint.eventTrigger?.eventType === 'google.cloud.firestore.document.v1.written');
    if (!valid) throw new Error('An existing Rapid Add function would change trigger type.');
  }
  // --force otherwise installs Firebase's default artifact cleanup policy.
  // This repository is shared with other functions: preserve its policy or
  // explicit opt-out, and stop if neither has been configured.
  const policies = artifacts?.cleanupPolicies;
  const hasPolicy = policies && typeof policies === 'object' && !Array.isArray(policies) && Object.keys(policies).length > 0;
  const optedOut = artifacts?.labels?.['firebase-functions-cleanup-opted-out'] === 'true';
  if (!hasPolicy && !optedOut) {
    throw new Error('The shared gcf-artifacts repository has no cleanup policy or explicit opt-out. Configure its retention before forced deployment; no retention policy was changed.');
  }
  return names.map(name => 'functions:'+CODEBASE+':'+name).join(',');
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const source = fs.readFileSync(new URL('./functions/index.js',import.meta.url),'utf8');
    const readMetadata = file => {
      try { return JSON.parse(fs.readFileSync(file,'utf8')); }
      catch { throw new Error('Cannot read deployment metadata; its contents have not been logged.'); }
    };
    const inventory = readMetadata(process.argv[2]);
    const artifacts = readMetadata(process.argv[3]);
    console.log(deploymentTargets(source,inventory,artifacts,process.argv[4]));
  } catch (error) {
    console.error('Deployment scope check failed: '+error.message);
    process.exitCode = 1;
  }
}
