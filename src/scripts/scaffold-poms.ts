import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scaffold, type DiscoveryScreen } from '../pom-scaffolder.ts';

const discoveryPath = process.argv[2] ?? 'discovery-report.json';
const outputDir = process.argv[3] ?? 'tests/pages';

const raw = readFileSync(resolve(discoveryPath), 'utf8');
const dr = JSON.parse(raw) as { screens: DiscoveryScreen[] };

const result = scaffold(dr.screens, { outputDir });

console.log(`Scaffolded ${result.files.length} POM file(s) to ${outputDir}:`);
for (const f of result.files) {
  console.log(`  ${f.className} -> ${f.path}`);
}
