import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scaffold, type DiscoveryScreen, type DiscoveryComponent } from '../pom-scaffolder.ts';

// Uso: scaffold-poms.ts [discovery-report] [pages-dir] [components-dir]
// El command pasa rutas namespaciadas por sitio (tests/pages/<site-id>, tests/components/<site-id>).
// Defaults sin namespace para compatibilidad / uso manual.
const workDir = process.env.QA_WORK_DIR || '.work';
const discoveryPath = process.argv[2] ?? `${workDir}/discovery-report.json`;
const outputDir = process.argv[3] ?? 'tests/pages';
const componentsDir = process.argv[4] ?? 'tests/components';

const raw = readFileSync(resolve(discoveryPath), 'utf8');
const dr = JSON.parse(raw) as { screens: DiscoveryScreen[]; components?: DiscoveryComponent[] };

const result = scaffold(dr.screens, { outputDir, componentsDir, components: dr.components });

console.log(`Scaffolded ${result.files.length} POM file(s) to ${outputDir}:`);
for (const f of result.files) {
  console.log(`  ${f.className} -> ${f.path}`);
}
