#!/usr/bin/env node
// Checks user facing copy in this package for the house rules:
// no em dash, no en dash, no double hyphen used as a dash, no claim of instant updates.
// Command line flags such as --access are fine; a double hyphen between spaces is not.
// Usage: node scripts/check-copy.mjs [directory]   (defaults to this package)

import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = new Set(['.md', '.mjs', '.js', '.cjs', '.ts', '.json', '.svg', '.yml', '.yaml']);
const SKIP = new Set(['node_modules', 'dist', '.git']);
const RULES = [
  [new RegExp(String.fromCharCode(0x2014)), 'em dash'],
  [new RegExp(String.fromCharCode(0x2013)), 'en dash'],
  [new RegExp(' ' + '-'.repeat(2) + ' '), 'double hyphen used as a dash'],
  [new RegExp('real' + '[ -]' + 'time', 'i'), 'instant update claim'],
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXT.has(extname(entry.name)) && entry.name !== 'check-copy.mjs') yield path;
  }
}

let problems = 0;
for await (const file of walk(root)) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    for (const [re, label] of RULES) {
      if (re.test(line)) {
        problems++;
        console.error(`${relative(root, file)}:${i + 1}: ${label}: ${line.trim().slice(0, 120)}`);
      }
    }
  });
}
if (problems) {
  console.error(`${problems} copy problem(s).`);
  process.exit(1);
}
console.log('Copy check passed.');
