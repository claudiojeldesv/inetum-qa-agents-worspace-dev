#!/usr/bin/env node
/**
 * build-showcase — genera un reporte HTML ejecutivo single-file a partir de los artefactos
 * de un run de ia4d-qa-automator. Determinístico (sin LLM), sin Java, sin tocar allure-results.
 *
 * Lee de QA_WORK_DIR (default .work) los JSON del run y rellena una plantilla fija con slots:
 * la estructura y las frases son fijas; los datos salen de los artefactos. Render adaptativo:
 * el callout de drift, los gauges del judge y la columna RF aparecen solo si su artefacto existe.
 *
 * Todo valor dinámico que provenga de un artefacto se escapa con esc() — los JSON de `.work/`
 * no se validan contra schema, así que el reporte (evidencia auditable) no confía en su forma.
 *
 * Uso:  tsx src/scripts/build-showcase.ts [--work-dir=.work/<site>] [--output=<dir>/showcase-report.html]
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendAuditEntry } from '../audit-log.ts';

// ---------------------------------------------------------------- tipos (laxos: JSON sin schema)

interface FeedbackItem {
  category?: string;
  severity?: string;
  location?: { line?: number; column?: number };
  description?: string;
  suggested_fix?: string;
}
interface ReviewEntry {
  test_file?: string;
  iteration?: number;
  verdict?: string;
  feedback?: FeedbackItem[];
  feedback_summary?: string;
}
interface JudgeEntry {
  test_file?: string;
  criterion?: string;
  score?: number;
  axes?: Record<string, unknown>;
}
interface Criterion {
  id: string;
  title?: string;
  flow?: string;
  given?: string;
  when?: string;
  then?: string;
  source_ref?: string;
}
interface TestEntry {
  rf?: string;
  tc_id?: string;
  title?: string;
  flow?: string;
  scenario?: string;
  spec: string;
  tags?: string[];
  severity?: string;
  criterion_citation?: string;
  source_ref?: string;
  writer_iterations?: number;
  reviewer_verdict?: string;
  must_fix?: number;
  should_fix?: number;
  nits?: number;
  judge_score?: number;
  judge_axes?: Record<string, unknown>;
  run_result?: string;
  a11y?: string;
}
interface RunSummary {
  module?: string;
  mode?: string;
  target_url?: string;
  source_fd?: string;
  style_contract?: string;
  compliance_verdict?: string;
  gates?: Record<string, string>;
  criteria_total?: number;
  criteria_blocked_open_questions?: number;
  tests_generated?: TestEntry[];
  judge_summary?: { status?: string; mean_score?: number; min_score?: number; max_score?: number; below_threshold?: number };
  a11y?: { axe_injected_all_specs?: boolean; fail_on_violations?: boolean; mode?: string; specs?: number };
  playwright_run?: { result?: string; workers?: number };
  verification?: { workers?: number };
  run_date?: string;
  run_id?: string;
}
interface DriftReport {
  drift?: unknown[];
  covered?: unknown[];
  summary?: string;
}

// ---------------------------------------------------------------- args + io

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Lectura tolerante: array JSON, objeto único, o objetos concatenados / JSON-lines. */
function readJsonObjects(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const t = readFileSync(path, 'utf8').trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  } catch {
    /* cae al escaneo por balance de llaves */
  }
  const out: Record<string, unknown>[] = [];
  let depth = 0,
    start = -1,
    inStr = false,
    esc2 = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc2) esc2 = false;
      else if (c === '\\') esc2 = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(t.slice(start, i + 1)));
        } catch {
          /* fragmento corrupto: se omite */
        }
        start = -1;
      }
    }
  }
  return out;
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

const fileBase = (s: string): string => s.split(/[\\/]/).pop() || s;

/** Escapa TODO valor dinámico que entre en el HTML, incluido `'` (atributos). */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const toNum = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function countPoms(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith('.page.ts') && f !== 'base.page.ts').length;
}

// ---------------------------------------------------------------- model

export interface ShowcaseData {
  summary: RunSummary;
  reviewsByFile: Record<string, ReviewEntry[]>;
  judgeByFile: Record<string, JudgeEntry>;
  criteriaById: Record<string, Criterion>;
  drift: DriftReport | null;
  pomCount: number;
  runDate: string;
  runId: string;
}

export function loadShowcaseData(workDir: string): ShowcaseData {
  const summary = readJson<RunSummary>(resolve(workDir, 'qa-automator-run-summary.json'));
  if (!summary) {
    throw new Error(
      `No se encontró qa-automator-run-summary.json en ${workDir}. Corre un módulo (autonomous/spec-refiner/req-driven) primero.`,
    );
  }
  // Feedback del Reviewer: fichero plano (consolidado/legacy) + directorio per-spec (fuente
  // preferida tras el fix de concurrencia; cada fichero sobrescribe a su spec en el plano).
  const reviewsByFile: Record<string, ReviewEntry[]> = {};
  for (const r of readJsonObjects(resolve(workDir, 'review-feedback.json')) as ReviewEntry[]) {
    if (!r?.test_file) continue;
    const k = fileBase(r.test_file);
    (reviewsByFile[k] = reviewsByFile[k] || []).push(r);
  }
  const reviewDir = resolve(workDir, 'review-feedback');
  if (existsSync(reviewDir)) {
    for (const f of readdirSync(reviewDir).filter((x) => x.endsWith('.json')).sort()) {
      const objs = (readJsonObjects(resolve(reviewDir, f)) as ReviewEntry[]).filter((r) => r?.test_file);
      if (objs.length) reviewsByFile[fileBase(objs[0].test_file as string)] = objs;
    }
  }
  const judgeByFile: Record<string, JudgeEntry> = {};
  for (const j of readJsonObjects(resolve(workDir, 'judge-report.json')) as JudgeEntry[]) {
    if (j?.axes && j?.test_file) judgeByFile[fileBase(j.test_file)] = j;
  }
  const criteriaDoc = readJson<{ criteria?: Criterion[] }>(resolve(workDir, 'criteria.json'));
  const criteriaById: Record<string, Criterion> = {};
  for (const c of criteriaDoc?.criteria ?? []) criteriaById[c.id] = c;

  const drift = readJson<DriftReport>(resolve(workDir, 'drift-report.json'));

  // POM count: por sitio (.work/<site> → tests/pages/<site>); si esa carpeta no existe, cae a la raíz.
  const siteId = basename(workDir) === '.work' ? '' : basename(workDir);
  let pomCount = countPoms(resolve(process.cwd(), 'tests/pages', siteId));
  if (pomCount === 0) pomCount = countPoms(resolve(process.cwd(), 'tests/pages'));

  return {
    summary,
    reviewsByFile,
    judgeByFile,
    criteriaById,
    drift,
    pomCount,
    runDate: esc(summary.run_date ?? new Date().toISOString().slice(0, 10)),
    runId: esc(summary.run_id ?? 'RUN'),
  };
}

// ---------------------------------------------------------------- render helpers

const sevClass = (s: string) => (s === 'must-fix' ? 'is-mf' : s === 'should-fix' ? 'is-should' : 'is-nit');

function kpi(label: string, value: string, sub: string, cls = '', dot = ''): string {
  return `<div class="kpi">${dot ? `<div class="kpi__dot ${dot}"></div>` : ''}
    <div class="kpi__label">${esc(label)}</div>
    <div class="kpi__value ${cls}">${value}</div>
    <div class="kpi__sub">${esc(sub)}</div>
  </div>`;
}

function act(n: string, title: string, desc: string, chips: { t: string; cls?: string }[]): string {
  return `<div class="act">
    <div class="act__top"><span class="act__n">${n}</span><span class="act__tick">ejecutado</span></div>
    <h3>${esc(title)}</h3>
    <p>${esc(desc)}</p>
    <div class="act__agents">${chips
      .map((c) => `<span class="agent-chip ${c.cls ?? ''}">${esc(c.t)}</span>`)
      .join('')}</div>
  </div>`;
}

/** Humaniza el prefijo de escenario (inicio-sesion → Acceso) para agrupar casos. */
function moduleLabel(scenario: string): string {
  const head = (scenario || '').split('.')[0];
  const map: Record<string, string> = {
    'inicio-sesion': 'Acceso',
    login: 'Acceso',
    checkout: 'Pago',
    pago: 'Pago',
    carrito: 'Carrito',
    cart: 'Carrito',
    catalogo: 'Catálogo',
  };
  return map[head] || (head ? head.charAt(0).toUpperCase() + head.slice(1) : 'General');
}

function caseCard(t: TestEntry, d: ShowcaseData): string {
  const fb = fileBase(t.spec);
  const reviews = d.reviewsByFile[fb] || [];
  const last = reviews[reviews.length - 1] || ({} as ReviewEntry);
  const crit = t.rf ? d.criteriaById[t.rf] : undefined;
  const rfTag = t.rf ? ` <em>· ${esc(t.rf)}</em>` : '';
  const tags = (t.tags || [])
    .map((tg) => `<span class="tag ${tg.includes('critical') ? 'is-crit' : ''}">${esc(tg)}</span>`)
    .join('');
  const mf = toNum(t.must_fix) ?? 0;
  const mfVal = `${esc(mf)} MF`;
  const mfColor = mf > 0 ? 'var(--block)' : 'var(--pass)';
  const judgeScore = toNum(t.judge_score);
  const judgeStep =
    judgeScore != null
      ? `<span class="pong__arrow">→</span><div class="pong__step"><span class="pong__role">Judge</span><span class="pong__val" style="color:var(--pass)">${esc(judgeScore)}</span></div>`
      : '';
  const iters = toNum(t.writer_iterations) ?? 1;

  const traceLine = crit
    ? `<div class="trace-line">@criterion <b>${esc(t.rf)}</b> (${esc(crit.source_ref)})</div>`
    : '';

  const fbItems = (last.feedback || []).length
    ? (last.feedback || [])
        .map(
          (f) => `<div class="fb"><span class="fb__sev ${sevClass(f.severity || '')}">${esc((f.severity || '').toUpperCase())}</span>
        <div><div class="fb__cat">${esc(f.category || '')}${f.location?.line ? ' · línea ' + esc(f.location.line) : ''}</div>
        <div class="fb__desc">${esc(f.description || '')}</div>${
            f.suggested_fix ? `<div class="fb__loc">↳ ${esc(f.suggested_fix)}</div>` : ''
          }</div></div>`,
        )
        .join('')
    : `<div class="fb"><span class="fb__sev is-clean">CLEAN</span><div><div class="fb__desc">${esc(
        last.feedback_summary || '0 must-fix, 0 should-fix.',
      )}</div><div class="fb__loc">verdict en ${esc(iters)}ª ronda</div></div></div>`;

  return `<div class="qcard">
    <button class="qcard__head" aria-expanded="false">
      <div class="tc-id">${esc(t.tc_id || t.rf)}${rfTag}<small>${esc(t.spec)}${
        crit?.source_ref ? ' · FD ' + esc((crit.source_ref || '').split(':').pop()) : ''
      }</small></div>
      <div class="qcard__title">
        <div class="qcard__scn">${esc(t.title || t.scenario || '')}</div>
        <div class="qcard__tags">${tags}</div>
      </div>
      <div class="pong">
        <div class="pong__step"><span class="pong__role">Writer</span><span class="pong__val">${esc(iters)}×</span></div>
        <span class="pong__arrow">→</span>
        <div class="pong__step"><span class="pong__role">Reviewer</span><span class="pong__val" style="color:${mfColor}">${mfVal}</span></div>
        ${judgeStep}
        <span class="verdict">${esc(t.reviewer_verdict || 'approved')} <span class="chev">▾</span></span>
      </div>
    </button>
    <div class="qcard__body">
      ${traceLine}
      <div class="verbatim-note">review-feedback.json · ${esc(t.tc_id || t.rf)}</div>
      ${fbItems}
    </div>
  </div>`;
}

const AXIS_LABEL: Record<string, string> = {
  assertions: 'Assertions',
  selectors: 'Selectors',
  waits: 'Waits',
  isolation: 'Isolation',
  criterion_coverage: 'Trazabilidad',
  a11y: 'A11y coverage',
  structure: 'Structure',
};

function judgeCard(d: ShowcaseData): string {
  const js = d.summary.judge_summary || {};
  const on = js.status === 'enabled' || js.mean_score != null;
  if (!on) {
    return `<div class="card">
      <div class="card__kick">Quality layer</div><h3 class="card__title">Judge</h3>
      <div class="ribbon">● No ejecutado en este run — QA_ENABLE_JUDGE sin set</div>
      <p class="note">El Judge es métrica de reporte opcional, off por defecto. Cuando se activa
      (QA_ENABLE_JUDGE=1), estos ejes se rellenan con el score real del run.</p>
    </div>`;
  }
  const axes = Object.keys(AXIS_LABEL);
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const j of Object.values(d.judgeByFile)) {
    for (const a of axes) {
      const v = toNum(j.axes?.[a]);
      if (v != null) {
        sums[a] = (sums[a] || 0) + v;
        counts[a] = (counts[a] || 0) + 1;
      }
    }
  }
  const gauges = axes
    .filter((a) => counts[a])
    .map((a) => {
      const v = sums[a] / counts[a];
      return `<div class="gauge"><span class="gauge__label">${esc(AXIS_LABEL[a])}</span>
        <div class="gauge__track"><div class="gauge__fill on" style="width:${Math.round(v * 100)}%"></div></div>
        <span class="gauge__num">${esc(v.toFixed(2))}</span></div>`;
    })
    .join('');
  return `<div class="card">
    <div class="card__kick">Quality layer</div><h3 class="card__title">Judge · media ${esc(js.mean_score)}</h3>
    <p class="note" style="margin:0 0 14px">${esc(Object.keys(d.judgeByFile).length)} specs puntuados · mín ${esc(js.min_score)} · máx ${esc(js.max_score)} · ${esc(js.below_threshold || 0)} bajo umbral 0.5</p>
    ${gauges}
  </div>`;
}

function driftCallout(d: ShowcaseData): string {
  if (!d.drift) return '';
  const structural = (d.drift.drift || []).length;
  const covered = (d.drift.covered || []).length;
  const ok = structural === 0;
  return `<div class="drift" style="${ok ? '' : 'border-color:var(--warn-soft);background:var(--warn-soft)'}">
    <div class="drift__icon" style="${ok ? '' : 'background:var(--warn);color:#211a06'}">${ok ? '✓' : '!'}</div>
    <div class="drift__big" style="${ok ? '' : 'color:var(--warn)'}">${esc(structural)}</div>
    <div>
      <div class="drift__t">Drift FD ↔ implementación</div>
      <div class="drift__s">${esc(d.drift.summary || `${covered} criterios mapeados contra el DOM real; ${structural} flujos declarados sin exponer.`)}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- render principal (body)

export function buildShowcaseHtml(d: ShowcaseData): string {
  const s = d.summary;
  const tests: TestEntry[] = s.tests_generated || [];
  const total = tests.length;
  const passed = tests.filter((t) => /^pass(ed)?$/i.test(String(t.run_result || '').trim())).length;
  const approved = tests.filter((t) => /^(approved|pass(ed)?)$/i.test(String(t.reviewer_verdict || '').trim())).length;
  const totalMf = tests.reduce((a, t) => a + (toNum(t.must_fix) ?? 0), 0);
  const iters = tests.reduce((a, t) => a + (toNum(t.writer_iterations) ?? 1), 0);
  const hasRf = tests.some((t) => t.rf);
  const rfCount = tests.filter((t) => t.rf).length;
  const js = s.judge_summary || {};
  const judgeOn = js.status === 'enabled' || js.mean_score != null;
  const a11y = s.a11y || {};
  const isS3orS2 = s.module === 'S3' || s.module === 'S2';
  const allPass = total > 0 && passed === total;
  const driftCount = (d.drift?.drift || []).length;

  const kpis = [
    kpi(
      'Resultado run',
      `${esc(passed)}<small>/${esc(total)}</small>`,
      String(s.playwright_run?.result || `${passed} passed`),
      allPass ? 'is-pass nums' : 'is-block nums',
      allPass ? 'is-pass' : '',
    ),
    kpi('Veredicto Reviewer', `${esc(approved)}<small>/${esc(total)}</small>`, `${totalMf} must-fix`, 'nums'),
    hasRf
      ? kpi('Trazabilidad RF', `${esc(rfCount)}<small>/${esc(total)}</small>`, `criterios citados · drift ${driftCount}`, 'is-accent nums')
      : kpi('Iteraciones W↔R', esc(iters), 'Writer/Reviewer', 'is-accent nums'),
    kpi('Scan A11y', `${esc(a11y.specs ?? total)}<small>/${esc(total)}</small>`, 'WCAG 2.1 AA · warning', 'is-a11y nums'),
    judgeOn
      ? kpi('Judge · media', esc(js.mean_score), `${esc(total)}/${esc(total)} · mín ${esc(js.min_score)}`, 'is-pass nums', 'is-pass')
      : kpi('Judge', 'OFF', 'no ejecutado', 'is-off', 'is-off'),
  ].join('');

  const flows = d.drift?.covered?.length ?? total;
  const acts = [
    act(
      '01',
      'Comprender',
      `Enrutó la entrada como ${s.module} y validó el target contra compliance: ${s.compliance_verdict}.${
        isS3orS2 ? ` Ingirió el FD en ${s.criteria_total ?? total} criterios RF-NNN (${s.criteria_blocked_open_questions ?? 0} bloqueados).` : ''
      }`,
      [{ t: 'mode-router' }, { t: 'compliance-checker' }, ...(isS3orS2 ? [{ t: 'spec-refiner' }] : [])],
    ),
    act('02', 'Mapear', `Mapeó contra el DOM real de staging. Flujos cubiertos: ${flows}. Drift: ${driftCount}.`, [
      { t: 'planner (MCP)' },
      { t: 'discovery-analyzer' },
    ]),
    act('03', 'Estructurar', `POM determinístico: ${d.pomCount} page objects. Style Contract ${fileBase(String(s.style_contract || ''))} con fixtures sintéticos.`, [
      { t: 'pom-scaffolder' },
      { t: 'style-enforcer' },
    ]),
    act('04', 'Materializar', `El Writer generó ${total} specs${hasRf ? ' citando su RF-NNN' : ''}. La capa transversal inyectó el scan A11y en cada uno.`, [
      { t: 'writer', cls: 'is-key' },
      { t: 'a11y-injector' },
    ]),
    act('05', 'Juzgar', `Reviewer auditó las ${total} specs: ${approved} approved, ${totalMf} must-fix. ${judgeOn ? `El Judge puntuó las ${total}: media ${js.mean_score}.` : 'Judge no se ejecutó.'}`, [
      { t: 'reviewer · activo', cls: 'is-key' },
      judgeOn ? { t: `judge · ${js.mean_score}`, cls: 'is-key' } : { t: 'judge · off', cls: 'is-off' },
    ]),
  ].join('');

  const groups: Record<string, TestEntry[]> = {};
  for (const t of tests) {
    const g = moduleLabel(t.scenario || t.flow || '');
    (groups[g] = groups[g] || []).push(t);
  }
  const casesHtml = Object.entries(groups)
    .map(
      ([g, arr]) =>
        `<div class="grp">Módulo · ${esc(g)} <b>· ${esc(arr.length)} ${arr.length === 1 ? 'caso' : 'casos'}</b></div>
       <div class="ql-grid">${arr.map((t) => caseCard(t, d)).join('')}</div>`,
    )
    .join('');

  const a11yRows = tests
    .map(
      (t) =>
        `<div class="a11y-row"><span class="a11y-row__name">${esc(fileBase(t.spec).replace(/\.spec\.ts$/, ''))}</span><span class="a11y-pill">scan ✓</span></div>`,
    )
    .join('');

  const g = s.gates || {};
  const gate = (name: string, state: string, cls: string, desc: string) =>
    `<div class="gate"><div class="gate__top"><span class="gate__dot ${cls}"></span><span class="gate__name">${esc(name)}</span></div>
     <div class="gate__state ${cls}">${esc(state)}</div><div class="gate__desc">${esc(desc)}</div></div>`;
  const piiOn = !!g.pii && !/off/i.test(g.pii);
  const gatesHtml = [
    gate('Writer + Reviewer', 'Activo', 'on', 'Núcleo obligatorio. Auditoría iterativa, máx. 2 rondas.'),
    gate('Gate A11y', a11y.fail_on_violations ? 'Gate' : 'Warning', a11y.fail_on_violations ? 'on' : 'warn', 'Scan inyectado siempre; gate por fail_on_violations.'),
    gate('Judge', judgeOn ? 'On' : 'Off', judgeOn ? 'on' : 'off', judgeOn ? 'Scoring activo (QA_ENABLE_JUDGE=1).' : 'Scoring no ejecutado.'),
    gate('PII scanner', piiOn ? 'On' : 'Off', piiOn ? 'on' : 'off', 'Detección DNI/IBAN/Luhn/teléfono/email ES.'),
  ].join('');

  const metaCells = [
    ['Target', String(s.target_url || '').replace(/^https?:\/\//, '')],
    ['Entrada', isS3orS2 ? `${s.module === 'S2' ? 'Gherkin' : 'FD'} + URL (${s.module})` : `URL (${s.module})`],
    ...(s.source_fd ? [['FD origen', fileBase(String(s.source_fd))]] : []),
    ['Style Contract', fileBase(String(s.style_contract || ''))],
    ['Playwright', `${s.playwright_run?.result || ''} · ${s.verification?.workers ?? ''} workers`],
    ['Compliance', String(s.compliance_verdict || '')],
  ]
    .map(([k, v]) => `<div class="metabar__cell"><div class="metabar__k">${esc(k)}</div><div class="metabar__v">${esc(v)}</div></div>`)
    .join('');

  const provExtra = `${judgeOn ? ' · judge-report.json' : ''}${d.drift ? ' · drift-report.json' : ''}`;
  const artJsons = [
    'qa-automator-run-summary.json',
    'review-feedback.json',
    judgeOn ? 'judge-report.json' : '',
    isS3orS2 ? 'criteria.json' : '',
    d.drift ? 'drift-report.json' : '',
    'discovery-report.json',
    'compliance-verdict.json',
    'audit-log.json',
  ].filter(Boolean);

  return `<div class="topbar"><div class="topbar__row">
  <div class="brand"><div class="brand__mark">Q</div><div class="brand__name">ia4d-qa-automator <span>· reporte de ejecución</span></div></div>
  <div class="topbar__spacer"></div>
  <div class="topbar__meta"><span>Módulo <b>${esc(s.module)}</b></span><span>Run <b class="nums">${d.runDate}</b></span><span class="nums">${d.runId}</span></div>
</div></div>

<div class="wrap">
  <header class="head reveal">
    <p class="eyebrow">Reporte de ejecución · módulo ${esc(s.module)}${s.mode ? ' (' + esc(s.mode) + ')' : ''}</p>
    <h1>Qué ejecutó el agente en este run</h1>
    <p class="head__desc">Resumen de lo que el agente hizo y lo que no, volcado desde los artefactos del run.</p>
    <div class="metabar">${metaCells}</div>
  </header>

  <div class="kpis reveal">${kpis}</div>

  ${driftCallout(d)}

  <section class="block reveal">
    <div class="sec-head"><div class="sec-head__kick">Marco QA propio</div><h2>Actos ejecutados</h2>
      <p>Los cinco actos que corrieron en este run y qué sub-agentes intervinieron en cada uno.</p></div>
    <div class="pipe">${acts}</div>
  </section>

  <section class="block reveal">
    <div class="sec-head"><div class="sec-head__kick">Por caso</div><h2>Detalle de casos</h2>
      <p>ID${hasRf ? ', criterio RF-NNN' : ''}, escenario, iteraciones del Writer, veredicto del Reviewer y estado.
      Pulsa una fila para ver los hallazgos del Reviewer (volcados verbatim del artefacto).</p></div>
    ${casesHtml}
  </section>

  <section class="block reveal"><div class="duo">
    <div class="card">
      <div class="card__kick">Capa transversal</div><h3 class="card__title">Accesibilidad</h3>
      <div class="badge-wcag"><div class="badge-wcag__icon">A</div>
        <div><div class="badge-wcag__t">WCAG 2.1 AA · EAA 2025</div><div class="badge-wcag__s">@axe-core/playwright · AxeBuilder en cada test()</div></div></div>
      ${a11yRows}
      <p class="note">Scan inyectado en ${esc(a11y.specs ?? total)}/${esc(total)} specs. Modo <b class="warn">${esc(a11y.mode || 'warning')}</b> (fail_on_violations: ${a11y.fail_on_violations ? 'true' : 'false'}): ${a11y.fail_on_violations ? 'aborta el test ante violaciones.' : 'reporta a las anotaciones del test sin abortar.'}</p>
    </div>
    ${judgeCard(d)}
  </div></section>

  <section class="block reveal">
    <div class="sec-head"><div class="sec-head__kick">Salida del run</div><h2>Artefactos generados</h2>
      <p>Rutas de los ficheros que el agente produjo.</p></div>
    <div class="arts">
      <div class="artgroup"><div class="artgroup__h"><span>Tests · POM</span><span>entregables</span></div>
        ${tests.map((t) => `<div class="artrow"><span class="artrow__icon">spec</span><span class="artrow__path">${esc(t.spec)}</span></div>`).join('')}
        <div class="artrow"><span class="artrow__icon">pom</span><span class="artrow__path">tests/pages/… (${esc(d.pomCount)} page objects)</span></div>
      </div>
      <div class="artgroup"><div class="artgroup__h"><span>Evidencia del run</span><span>.work/ · efímero</span></div>
        ${artJsons
          .map((f) => `<div class="artrow"><span class="artrow__icon">${f.endsWith('audit-log.json') ? 'log' : 'json'}</span><span class="artrow__path">.work/…/${esc(f)}</span></div>`)
          .join('')}
      </div>
    </div>
  </section>

  <section class="block reveal">
    <div class="sec-head"><div class="sec-head__kick">Qué se activó y qué no</div><h2>Configuración del run</h2>
      <p>Estado de cada capa opcional en este run. Lo apagado no se eliminó: se reactiva por env-var o por Style Contract.</p></div>
    <div class="gates">${gatesHtml}</div>
  </section>

  <footer><div class="foot">
    <div class="foot__prov"><b>Procedencia:</b> qa-automator-run-summary.json · review-feedback.json${provExtra} · audit-log.json<br><b>Re-generable</b> a partir de los artefactos del run</div>
    <div class="foot__tag">ia4d-qa-automator · Inetum · Documentación y Calidad</div>
  </div></footer>
</div>

<script>
  document.querySelectorAll(".qcard__head").forEach(function (h) {
    h.addEventListener("click", function () {
      var c = h.closest(".qcard"); var o = c.classList.toggle("is-open");
      h.setAttribute("aria-expanded", o ? "true" : "false");
    });
  });
</script>`;
}

// ---------------------------------------------------------------- stylesheet (fijo, va en <head>)

export const STYLE = `<title>ia4d-qa-automator — Reporte de ejecución</title>
<style>
  :root{--ink:#0B0E14;--panel:#131823;--panel-2:#1A2130;--line:#232C3D;--line-soft:#1A2230;--text:#E8ECF2;--muted:#8A95A8;--muted-2:#5C677A;--accent:#FF3D85;--accent-soft:rgba(255,61,133,.13);--accent-line:rgba(255,61,133,.35);--pass:#35D39A;--pass-soft:rgba(53,211,154,.12);--warn:#F5B544;--warn-soft:rgba(245,181,68,.12);--block:#FF5C5C;--block-soft:rgba(255,92,92,.12);--off:#5C677A;--off-soft:rgba(92,103,122,.14);--a11y:#3DD6D0;--a11y-soft:rgba(61,214,208,.12);--sans:"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"Cascadia Code","SF Mono",Menlo,Consolas,monospace;--maxw:1140px}
  *{box-sizing:border-box}
  body{margin:0;background:radial-gradient(1100px 560px at 80% -12%,rgba(255,61,133,.06),transparent 60%),var(--ink);color:var(--text);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 28px}
  .mono{font-family:var(--mono)}.nums{font-variant-numeric:tabular-nums}
  .topbar{border-bottom:1px solid var(--line);background:rgba(11,14,20,.82);backdrop-filter:blur(8px);position:sticky;top:0;z-index:30}
  .topbar__row{display:flex;align-items:center;gap:16px;padding:14px 28px;max-width:var(--maxw);margin:0 auto}
  .brand{display:flex;align-items:center;gap:11px}
  .brand__mark{width:30px;height:30px;border-radius:7px;background:linear-gradient(135deg,var(--accent),#C71F62);display:grid;place-items:center;font-family:var(--mono);font-weight:700;font-size:15px;color:#fff;box-shadow:0 0 0 1px var(--accent-line),0 6px 18px rgba(255,61,133,.22)}
  .brand__name{font-weight:650;letter-spacing:-.01em}.brand__name span{color:var(--muted);font-weight:400}
  .topbar__spacer{flex:1}.topbar__meta{font-family:var(--mono);font-size:12px;color:var(--muted);display:flex;gap:18px}.topbar__meta b{color:var(--text);font-weight:600}
  @media(max-width:720px){.topbar__meta{display:none}}
  .head{padding:44px 0 8px}
  .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 14px;display:flex;align-items:center;gap:10px}
  .eyebrow::before{content:"";width:26px;height:1px;background:var(--accent-line)}
  .head h1{font-size:clamp(26px,3.6vw,38px);line-height:1.05;letter-spacing:-.025em;font-weight:700;margin:0 0 12px;text-wrap:balance}
  .head__desc{color:var(--muted);font-size:15px;max-width:70ch;margin:0}
  .metabar{display:flex;flex-wrap:wrap;gap:0;margin:26px 0 4px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel)}
  .metabar__cell{padding:12px 18px;border-right:1px solid var(--line);flex:1 1 auto;min-width:140px}.metabar__cell:last-child{border-right:0}
  .metabar__k{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-2);margin-bottom:5px}
  .metabar__v{font-family:var(--mono);font-size:13px;color:var(--text);word-break:break-all}
  .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:14px 0 8px}
  @media(max-width:860px){.kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:460px){.kpis{grid-template-columns:1fr}}
  .kpi{background:var(--panel);padding:20px 20px 18px;position:relative}
  .kpi__label{font-family:var(--mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
  .kpi__value{font-size:33px;font-weight:700;letter-spacing:-.02em;line-height:1}.kpi__value small{font-size:16px;color:var(--muted);font-weight:500}
  .kpi__sub{font-family:var(--mono);font-size:11.5px;color:var(--muted-2);margin-top:9px}
  .kpi__value.is-pass{color:var(--pass)}.kpi__value.is-accent{color:var(--accent)}.kpi__value.is-a11y{color:var(--a11y)}.kpi__value.is-off{color:var(--off)}.kpi__value.is-block{color:var(--block)}
  .kpi__dot{position:absolute;top:20px;right:20px;width:8px;height:8px;border-radius:50%}.kpi__dot.is-pass{background:var(--pass);box-shadow:0 0 0 4px var(--pass-soft)}.kpi__dot.is-off{background:var(--off)}
  section.block{padding:44px 0 8px}.sec-head{margin-bottom:22px}
  .sec-head__kick{font-family:var(--mono);font-size:12px;color:var(--accent);letter-spacing:.07em;margin-bottom:8px}
  .sec-head h2{font-size:24px;letter-spacing:-.02em;font-weight:680;margin:0 0 6px}.sec-head p{color:var(--muted);margin:0;max-width:66ch;font-size:14.5px}
  .drift{display:flex;align-items:center;gap:16px;margin:14px 0 8px;border:1px solid var(--pass-soft);background:var(--pass-soft);border-radius:12px;padding:16px 20px}
  .drift__icon{width:38px;height:38px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;background:var(--pass);color:#06231A;font-weight:800;font-size:18px}
  .drift__big{font-size:26px;font-weight:700;letter-spacing:-.02em;color:var(--pass);line-height:1}
  .drift__t{font-weight:620;font-size:14.5px;margin-bottom:3px}.drift__s{font-family:var(--mono);font-size:11.5px;color:var(--muted)}
  @media(max-width:560px){.drift{flex-wrap:wrap}}
  .pipe{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}@media(max-width:900px){.pipe{grid-template-columns:repeat(2,1fr)}}@media(max-width:480px){.pipe{grid-template-columns:1fr}}
  .act{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 15px 18px;min-height:172px;display:flex;flex-direction:column}
  .act__top{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
  .act__n{font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:600}
  .act__tick{font-family:var(--mono);font-size:10px;color:var(--pass);border:1px solid var(--pass-soft);background:var(--pass-soft);padding:2px 7px;border-radius:20px}
  .act h3{font-size:15px;margin:0 0 8px;letter-spacing:-.01em}.act p{font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.45}
  .act__agents{margin-top:auto;display:flex;flex-wrap:wrap;gap:5px}
  .agent-chip{font-family:var(--mono);font-size:10.5px;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:3px 7px;background:var(--panel-2)}
  .agent-chip.is-key{color:var(--accent);border-color:var(--accent-line);background:var(--accent-soft)}
  .agent-chip.is-off{color:var(--off);border-color:var(--off-soft);background:var(--off-soft)}
  .grp{font-family:var(--mono);font-size:11px;color:var(--muted-2);text-transform:uppercase;letter-spacing:.09em;margin:22px 0 2px;display:flex;align-items:center;gap:10px}.grp::after{content:"";flex:1;height:1px;background:var(--line-soft)}.grp b{color:var(--muted);font-weight:600}
  .ql-grid{display:grid;gap:12px}
  .qcard{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .qcard__head{display:grid;grid-template-columns:170px 1fr auto;gap:16px;align-items:center;padding:15px 18px;cursor:pointer;width:100%;text-align:left;background:none;border:0;color:inherit;font:inherit}
  .qcard__head:hover{background:var(--panel-2)}.qcard__head:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
  .tc-id{font-family:var(--mono);font-size:13px;color:var(--accent);font-weight:600}.tc-id em{font-style:normal;color:var(--a11y)}
  .tc-id small{display:block;color:var(--muted-2);font-size:10px;font-weight:400;margin-top:3px;word-break:break-all}
  .qcard__title{min-width:0}.qcard__scn{font-size:14px;font-weight:550;letter-spacing:-.01em}
  .qcard__tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
  .tag{font-family:var(--mono);font-size:10px;color:var(--muted);border:1px solid var(--line);padding:1px 6px;border-radius:5px}.tag.is-crit{color:#FF7A7A;border-color:rgba(255,122,122,.25)}
  .pong{display:flex;align-items:center;gap:14px}.pong__step{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:54px}
  .pong__role{font-family:var(--mono);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted-2)}.pong__val{font-family:var(--mono);font-size:15px;font-weight:600}
  .pong__arrow{color:var(--line);font-size:14px}
  .verdict{font-family:var(--mono);font-size:11px;padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:var(--pass);background:var(--pass-soft);border:1px solid var(--pass-soft)}.verdict::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
  @media(max-width:760px){.qcard__head{grid-template-columns:1fr;gap:10px}.pong{flex-wrap:wrap}}
  .qcard__body{display:none;padding:4px 18px 16px;border-top:1px solid var(--line-soft)}.qcard.is-open .qcard__body{display:block}.qcard.is-open .chev{transform:rotate(180deg)}
  .chev{transition:transform .18s ease;color:var(--muted);font-size:12px}
  .verbatim-note{font-family:var(--mono);font-size:10px;color:var(--muted-2);padding:12px 0 4px;letter-spacing:.03em}
  .trace-line{font-family:var(--mono);font-size:11px;color:var(--muted);padding:10px 0 2px}.trace-line b{color:var(--a11y)}
  .fb{display:grid;grid-template-columns:auto 1fr;gap:12px;padding:13px 0;border-bottom:1px dashed var(--line-soft)}.fb:last-child{border-bottom:0}
  .fb__sev{font-family:var(--mono);font-size:10px;padding:3px 7px;border-radius:5px;height:fit-content;white-space:nowrap}
  .fb__sev.is-should{color:var(--warn);background:var(--warn-soft)}.fb__sev.is-mf{color:var(--block);background:var(--block-soft)}.fb__sev.is-nit{color:var(--muted);background:var(--off-soft)}.fb__sev.is-clean{color:var(--pass);background:var(--pass-soft)}
  .fb__cat{font-family:var(--mono);font-size:11px;color:var(--muted);margin-bottom:3px}.fb__desc{font-size:13px;color:var(--text)}.fb__loc{font-family:var(--mono);font-size:11px;color:var(--muted-2);margin-top:4px}
  .duo{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:880px){.duo{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px}
  .card__kick{font-family:var(--mono);font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}.card__title{font-size:18px;font-weight:640;letter-spacing:-.01em;margin:0 0 4px}
  .badge-wcag{display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px solid var(--a11y-soft);background:var(--a11y-soft);border-radius:10px;margin:16px 0}
  .badge-wcag__icon{width:36px;height:36px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;background:var(--a11y);color:#06201F;font-weight:800;font-size:16px}
  .badge-wcag__t{font-weight:620;font-size:14px}.badge-wcag__s{font-family:var(--mono);font-size:11px;color:var(--muted)}
  .a11y-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dashed var(--line-soft)}.a11y-row:last-child{border-bottom:0}
  .a11y-row__name{font-family:var(--mono);font-size:12px;color:var(--muted)}.a11y-pill{font-family:var(--mono);font-size:10.5px;padding:2px 8px;border-radius:14px;color:var(--a11y);background:var(--a11y-soft)}
  .note{font-size:12.5px;color:var(--muted);margin:14px 0 0;line-height:1.5}.note b.warn{color:var(--warn)}
  .ribbon{display:inline-flex;align-items:center;gap:7px;margin:14px 0 16px;font-family:var(--mono);font-size:11px;color:var(--off);background:var(--off-soft);border:1px solid var(--off-soft);padding:6px 11px;border-radius:8px}
  .gauge{display:flex;align-items:center;gap:14px;margin-bottom:13px}.gauge__label{font-family:var(--mono);font-size:12px;color:var(--muted);width:116px;flex-shrink:0}
  .gauge__track{flex:1;height:8px;background:var(--panel-2);border-radius:6px;overflow:hidden}.gauge__fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#41506b,#61708c)}.gauge__fill.on{background:linear-gradient(90deg,#6E2AA8,var(--accent))}
  .gauge__num{font-family:var(--mono);font-size:13px;font-weight:600;width:38px;text-align:right;color:var(--muted)}
  .arts{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:760px){.arts{grid-template-columns:1fr}}
  .artgroup{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px 14px}
  .artgroup__h{font-family:var(--mono);font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;display:flex;justify-content:space-between}.artgroup__h span{color:var(--muted-2)}
  .artrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line-soft)}.artrow:last-child{border-bottom:0}
  .artrow__icon{font-family:var(--mono);font-size:10px;color:var(--accent);background:var(--accent-soft);border-radius:5px;padding:2px 6px;flex-shrink:0}.artrow__path{font-family:var(--mono);font-size:12px;color:var(--text);word-break:break-all}
  .gates{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}@media(max-width:760px){.gates{grid-template-columns:repeat(2,1fr)}}@media(max-width:420px){.gates{grid-template-columns:1fr}}
  .gate{border:1px solid var(--line);border-radius:11px;padding:15px 16px;background:var(--panel)}.gate__top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .gate__dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.gate__dot.on{background:var(--pass)}.gate__dot.off{background:var(--off)}.gate__dot.warn{background:var(--warn)}
  .gate__name{font-family:var(--mono);font-size:12px;font-weight:600}.gate__state{font-family:var(--mono);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}.gate__state.on{color:var(--pass)}.gate__state.off{color:var(--off)}.gate__state.warn{color:var(--warn)}
  .gate__desc{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.45}
  footer{margin-top:52px;border-top:1px solid var(--line);padding:24px 0 60px}.foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
  .foot__prov{font-family:var(--mono);font-size:11px;color:var(--muted-2);line-height:1.7}.foot__prov b{color:var(--muted)}.foot__tag{font-family:var(--mono);font-size:11px;color:var(--muted-2)}
  @media(prefers-reduced-motion:no-preference){.reveal{opacity:0;transform:translateY(8px);animation:rise .45s ease forwards}@keyframes rise{to{opacity:1;transform:none}}}
</style>`;

/** Documento HTML completo single-file (STYLE en head, contenido en body). */
export function renderDocument(d: ShowcaseData): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf8"><meta name="viewport" content="width=device-width,initial-scale=1">${STYLE}</head><body>${buildShowcaseHtml(d)}</body></html>`;
}

// ---------------------------------------------------------------- CLI

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const workSpec = args['work-dir'] || process.env.QA_WORK_DIR || '.work';
  const workDir = resolve(process.cwd(), workSpec);
  const output = resolve(process.cwd(), args['output'] || `${workSpec}/showcase-report.html`);

  const data = loadShowcaseData(workDir);
  writeFileSync(output, renderDocument(data), 'utf8');

  try {
    appendAuditEntry({
      source: 'command',
      action: 'write_file',
      target: output,
      result: 'pass',
      metadata: {
        tests: (data.summary.tests_generated || []).length,
        judge_mean: data.summary.judge_summary?.mean_score ?? null,
        drift: (data.drift?.drift || []).length,
      },
    });
  } catch {
    /* audit best-effort */
  }

  console.log(`[build-showcase] reporte ejecutivo listo en ${output} (single-file, doble-clic, sin servidor).`);
}

// ejecutar solo como CLI (no al importar desde tests)
const invoked = process.argv[1] || '';
if (invoked.endsWith('build-showcase.ts') || import.meta.url === pathToFileURL(invoked).href) {
  main();
}
