// CLI: `npm run validate` — checks data/languages.json against the shared schema.
// Run this after hand-editing the data file.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDoc } from '../js/validate.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'data', 'languages.json');

let doc;
try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
    console.error(`x ${file} is not readable JSON: ${e.message}`);
    process.exit(1);
}

const errors = validateDoc(doc);
if (errors.length) {
    console.error(`x ${errors.length} problem(s) in data/languages.json:`);
    for (const e of errors) console.error(`  ${e.path}: ${e.message}`);
    process.exit(1);
}

console.log(`ok - data/languages.json valid: ${doc.languages.length} languages, ${(doc.borrowings ?? []).length} borrowings, present year ${doc.config.presentYear}.`);
