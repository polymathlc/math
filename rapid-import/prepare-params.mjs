// Materialize nonsecret Firebase parameter defaults for noninteractive deploys.
// Read declarations as data; importing the worker would initialize cloud SDKs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const PARAMS = ['MATH_RAPID_IMPORT_OPENAI_MODEL','MATH_RAPID_IMPORT_MODEL'];

export function readModelDefaults(source) {
  const defaults = new Map();
  const declaration = /^\s*const\s+\w+\s*=\s*defineString\(\s*(['"])(MATH_RAPID_IMPORT_[A-Z_]+)\1\s*,\s*\{\s*default\s*:\s*(['"])([A-Za-z0-9][A-Za-z0-9._:/-]*)\3\s*\}\s*\)\s*;/gm;
  const calls = source.match(/\bdefineString\s*\(/g) || [];
  for (const match of source.matchAll(declaration)) {
    const name = match[2];
    if (!PARAMS.includes(name) || defaults.has(name)) throw new Error('Unexpected or duplicate deployment parameter declaration.');
    defaults.set(name,match[4]);
  }
  if (calls.length !== PARAMS.length || defaults.size !== PARAMS.length || PARAMS.some(name => !defaults.has(name))) {
    throw new Error('Cannot safely derive all deployment parameter defaults from functions/index.js.');
  }
  return defaults;
}

function readOptional(file) {
  try { return fs.readFileSync(file,'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

export function prepareDeploymentParams(functionsDir, project) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new Error('Invalid Firebase project ID.');
  // Validate every declaration before touching dotenv files. A changed source
  // format must be reviewed, never silently replaced with guessed model names.
  const defaults = readModelDefaults(fs.readFileSync(path.join(functionsDir,'index.js'),'utf8'));
  const target = path.join(functionsDir,'.env.'+project);
  const existing = readOptional(target);
  const present = new Set();
  // Base dotenv settings are overrides too. Inspect key names only; do not
  // evaluate, print or alter values, and never open any .secret files.
  for (const text of [readOptional(path.join(functionsDir,'.env')),existing]) {
    for (const line of text.split(/\r?\n/)) {
      const key = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      if (key) present.add(key);
    }
  }
  const missing = [...defaults].filter(([name]) => !present.has(name));
  if (missing.length) {
    const newline = existing.includes('\r\n') ? '\r\n' : '\n';
    const prefix = existing && !existing.endsWith('\n') ? newline : '';
    fs.appendFileSync(target,prefix+missing.map(([name,value]) => name+'='+value).join(newline)+newline,{encoding:'utf8',mode:0o600});
  }
  return missing.length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const count = prepareDeploymentParams(fileURLToPath(new URL('./functions/',import.meta.url)),process.argv[2] || '');
    console.log('Prepared '+count+' missing nonsecret deployment parameter(s).');
  } catch (error) {
    console.error('Deployment parameter preparation failed: '+error.message);
    process.exitCode = 1;
  }
}
