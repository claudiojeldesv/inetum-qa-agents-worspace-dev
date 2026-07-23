#!/usr/bin/env node
/**
 * dom-map-to-discovery — adaptador determinístico (0 tokens) del flavor lean S3.
 *
 * El dom-walker emite `dom-map.json` (schema propio: screens con `elements`,
 * `forms`, `landmarks`, `transitions`). El resto del pipeline determinístico de
 * catálogo (verify-locators, pom-scaffolder) consume `discovery-report.json`
 * (schema: screens con `interactive_elements` + `components`). Este adaptador
 * traduce uno en otro sin LLM, para reusar las piezas ya validadas sin duplicar
 * lógica ni tocar el core.
 *
 * Es faithful: NO poda ni inventa dedupe (el walker ya podó y dedupó). Une los
 * campos de forma que el scaffolder produzca POMs y verify-locators pueda
 * resolver cada locator contra el DOM real.
 *
 * Uso:  tsx copilot/src/dom-map-to-discovery.ts --dom-map=<path> [--out=<path>]
 * Salida: discovery-report.json junto al dom-map (o en --out). Exit 0 OK, 1 error.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { DomMap, DomElement, DomScreen } from './walk-types.ts';

/** Elemento del discovery-report (espejo de pom-scaffolder.InteractiveElement). */
interface DiscoveryElement {
  role: string;
  name?: string;
  test_id?: string;
  label?: string;
}

interface DiscoveryScreen {
  name: string;
  url_pattern?: string;
  interactive_elements: DiscoveryElement[];
  components: string[];
}

interface DiscoveryReport {
  target_url: string;
  discovery_timestamp: string;
  source_plan: string;
  inferred_domain: string;
  screens: DiscoveryScreen[];
  components: unknown[];
}

/**
 * Rango de rol para ordenar los elementos del screen. Los campos de formulario
 * van ANTES que botones/links: el heurístico `findLoginForm` de verify-locators
 * elige el usuario como el primer elemento que matchea /login|user.../, y un
 * botón "Login" que aparezca antes del textbox de usuario lo desvía (fill sobre
 * un botón → excepción → bootstrap failed). Orden estable dentro de cada rango.
 */
const ROLE_RANK: Record<string, number> = {
  textbox: 0,
  searchbox: 0,
  combobox: 0,
  checkbox: 0,
  radio: 0,
  spinbutton: 0,
  slider: 0,
  button: 1,
  link: 2,
};

function roleRank(role: string): number {
  return ROLE_RANK[role] ?? 3;
}

function toDiscoveryElement(el: DomElement): DiscoveryElement {
  const out: DiscoveryElement = { role: el.role };
  if (el.name !== undefined) out.name = el.name;
  if (el.test_id !== undefined) out.test_id = el.test_id;
  if (el.label !== undefined) out.label = el.label;
  return out;
}

/**
 * Un elemento del screen del discovery. Une los `elements` con los `landmarks`
 * (footer/nav son interactivos-adyacentes que el scaffolder puede querer) y
 * deriva un url_pattern de path relativo cuando el dom-map trae URL absoluta,
 * porque el scaffolder/verify-locators esperan el fragmento.
 */
function toDiscoveryScreen(screen: DomScreen, baseUrl: string): DiscoveryScreen {
  const elements = [...screen.elements, ...screen.landmarks].map(toDiscoveryElement);
  // dedupe estable por (role|test_id|name) — el walker ya dedupó por pantalla,
  // pero al unir landmarks puede reaparecer el footer; mantener orden.
  const seen = new Set<string>();
  const deduped: DiscoveryElement[] = [];
  for (const el of elements) {
    const key = `${el.role}|${el.test_id ?? ''}|${el.name ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(el);
  }
  const ordered = deduped
    .map((el, i) => ({ el, i }))
    .sort((a, b) => roleRank(a.el.role) - roleRank(b.el.role) || a.i - b.i)
    .map((x) => x.el);
  return {
    name: screen.name,
    url_pattern: relativePattern(screen.url_pattern, baseUrl),
    interactive_elements: ordered,
    components: [],
  };
}

/** URL absoluta del dom-map → fragmento relativo que espera el discovery. */
function relativePattern(urlPattern: string, baseUrl: string): string {
  if (baseUrl && urlPattern.startsWith(baseUrl)) {
    const rest = urlPattern.slice(baseUrl.length);
    return rest === '' ? '/' : rest;
  }
  try {
    const u = new URL(urlPattern);
    return u.pathname + u.search;
  } catch {
    return urlPattern;
  }
}

export function domMapToDiscovery(map: DomMap): DiscoveryReport {
  const baseUrl = map.target_url.replace(/\/$/, '');
  return {
    target_url: map.target_url,
    discovery_timestamp: map.generated_at,
    source_plan: `dom-walker (${map.stats.flows} flujos, ${map.stats.screens} pantallas)`,
    inferred_domain: 'unknown',
    screens: map.screens.map((s) => toDiscoveryScreen(s, baseUrl)),
    components: [],
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'dom-map': { type: 'string' },
      out: { type: 'string' },
    },
  });

  if (!values['dom-map']) {
    console.error('Uso: tsx copilot/src/dom-map-to-discovery.ts --dom-map=<path> [--out=<path>]');
    process.exit(1);
  }

  const mapPath = resolve(values['dom-map']);
  if (!existsSync(mapPath)) {
    console.error(`[dom-map-to-discovery] no existe: ${mapPath}`);
    process.exit(1);
  }

  const map = JSON.parse(readFileSync(mapPath, 'utf8')) as DomMap;
  const discovery = domMapToDiscovery(map);

  const outPath = resolve(values.out ?? resolve(dirname(mapPath), 'discovery-report.json'));
  writeFileSync(outPath, JSON.stringify(discovery, null, 2), 'utf8');
  console.log(
    `[dom-map-to-discovery] OK  ${discovery.screens.length} pantallas → ${outPath}`,
  );
  process.exit(0);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '');
if (isDirectRun) {
  main();
}
