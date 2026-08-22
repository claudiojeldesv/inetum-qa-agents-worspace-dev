import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
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

/**
 * `testIdAttribute` del proyecto: se toma del Style Contract si lo declara, si no del
 * default de Playwright que usa el template. Importa porque el scaffolder solo emite
 * `getByTestId` cuando el atributo del que salió el valor coincide (D34).
 */
const contractArg = process.argv.find((a) => a.startsWith('--style-contract='))?.slice('--style-contract='.length);
let testIdAttribute = 'data-test';
if (contractArg && existsSync(resolve(contractArg))) {
  try {
    const c = parseYaml(readFileSync(resolve(contractArg), 'utf8')) as Record<string, any> | null;
    const declarado = c?.locators?.test_id_attribute;
    if (typeof declarado === 'string' && declarado) testIdAttribute = declarado;
  } catch {
    /* contract ilegible: se usa el default y no se inventa nada */
  }
}

const result = scaffold(dr.screens, { outputDir, componentsDir, components: dr.components, testIdAttribute });

console.log(`Scaffolded ${result.files.length} POM file(s) to ${outputDir}:`);
for (const f of result.files) {
  console.log(`  ${f.className} -> ${f.path}`);
}
