import { readFileSync } from 'node:fs';
import { scaffold } from './src/pom-scaffolder.ts';
const dr = JSON.parse(readFileSync('discovery-report.json', 'utf8'));
scaffold(dr.screens, { outputDir: 'tests/pages' });
