/**
 * El acta de decisiones (P1 de `docs/tasks/plan-panel-y-acta.md`).
 *
 * Los dos pares falsables que el plan exige, literales:
 *
 *  1. Sembrar tres decisiones, alterar la del medio a mano → el validador la señala.
 *     Y —esto no lo pide el plan pero sin ello el informe es inútil— señala LA DEL
 *     MEDIO, no las tres. Un validador que pinta en rojo el acta entera ante una sola
 *     manipulación no le dice al QA dónde mirar.
 *  2. Una decisión sin `actor` se rechaza.
 *
 * Y el par que documenta el LÍMITE, que importa tanto como la garantía: truncar la cola
 * NO rompe la cadena. Está aquí escrito como test que pasa en verde, para que nadie
 * venda la cadena como algo que no es (decisión 10 del plan).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DECISIONS_GENESIS,
  appendDecision,
  canonicalPayload,
  computeHash,
  decisionsPathFor,
  effectiveDecisions,
  hashJson,
  huerfanosDeAudit,
  normalizeActor,
  parseDecisions,
  serializeEntry,
  verifyChain,
  type DecisionEntry,
} from '../../src/decisions.ts';
import { hashScript } from '../../copilot/src/walk-core.ts';
import type { WalkScript } from '../../copilot/src/walk-types.ts';

let dir: string;
let acta: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ia4d-acta-'));
  acta = join(dir, 'sitio.jsonl');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const BASE = {
  fd_hash: 'fd0011223344aabb',
  script_hash: 'sc0011223344aabb',
  actor: 'claudio.jeldes',
} as const;

/** Tres decisiones reales de la forma que produce el panel. */
function sembrarTres(): DecisionEntry[] {
  const a = appendDecision(
    { ...BASE, rf: 'RF-001', paso: 'login/s3', decision: 'app', valor_nuevo: 'Bienvenido', evidencia: 'desde-cero', timestamp: '2026-08-24T09:00:00.000Z' },
    acta,
  ).entry;
  const b = appendDecision(
    { ...BASE, rf: 'RF-004', paso: 'transfer/s7', decision: 'app', valor_nuevo: 'Transfer Complete!', evidencia: 'en-vivo', timestamp: '2026-08-24T09:05:00.000Z' },
    acta,
  ).entry;
  const c = appendDecision(
    { ...BASE, rf: 'RF-006', paso: 'bill-pay/s2', decision: 'fd', evidencia: 'sin-verificar', timestamp: '2026-08-24T09:10:00.000Z' },
    acta,
  ).entry;
  return [a, b, c];
}

const leer = () => parseDecisions(readFileSync(acta, 'utf8'));

describe('la cadena — alterar una decisión vieja se ve', () => {
  it('tres decisiones limpias: cadena coherente y head en la última', () => {
    const [, , c] = sembrarTres();
    const { entries, malformed } = leer();
    expect(malformed).toEqual([]);
    expect(entries).toHaveLength(3);
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.head).toBe(c.hash);
  });

  it('EL PAR FALSABLE: se altera la del medio a mano y el validador la señala — solo a ella', () => {
    sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    const media = JSON.parse(lineas[1]) as DecisionEntry;
    // Lo que haría alguien tapando un defecto: cambiar el veredicto sin tocar el hash.
    media.decision = 'fd';
    lineas[1] = serializeEntry(media);
    writeFileSync(acta, lineas.join('\n') + '\n', 'utf8');

    const { entries, malformed } = leer();
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(false);
    const rotos = v.issues.filter((i) => i.rule === 'hash-roto');
    expect(rotos).toHaveLength(1);
    expect(rotos[0].index).toBe(1);
    expect(rotos[0].detail).toContain('RF-004');
  });

  it('borrar una decisión del medio rompe el eslabón de la SIGUIENTE (que es donde se nota)', () => {
    sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    writeFileSync(acta, [lineas[0], lineas[2]].join('\n') + '\n', 'utf8');

    const { entries, malformed } = leer();
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(false);
    expect(v.issues.filter((i) => i.rule === 'hash-roto').map((i) => i.index)).toEqual([1]);
  });

  it('borrar la PRIMERA se ve: la semilla es explícita, no la cadena vacía', () => {
    sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    writeFileSync(acta, lineas.slice(1).join('\n') + '\n', 'utf8');

    const { entries, malformed } = leer();
    expect(verifyChain(entries, malformed).ok).toBe(false);
  });

  it('EL LÍMITE, escrito: truncar la COLA deja una cadena impecable — no es un fallo del validador', () => {
    sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    writeFileSync(acta, lineas.slice(0, 2).join('\n') + '\n', 'utf8');

    const { entries, malformed } = leer();
    // Verde, y tiene que serlo: no hay nada después que apunte a lo borrado.
    expect(verifyChain(entries, malformed).ok).toBe(true);
    expect(entries).toHaveLength(2);
  });

  it('...y el ancla externa sí lo caza: el audit-log recuerda un hash que el acta ya no tiene', () => {
    const [a, b, c] = sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    writeFileSync(acta, lineas.slice(0, 2).join('\n') + '\n', 'utf8');

    const { entries } = leer();
    expect(huerfanosDeAudit(entries, [a.hash, b.hash, c.hash])).toEqual([c.hash]);
    // Sin truncar, ningún huérfano: el cruce no inventa hallazgos.
    expect(huerfanosDeAudit([a, b, c], [a.hash, b.hash, c.hash])).toEqual([]);
  });
});

describe('el actor — fail-closed', () => {
  it('EL PAR FALSABLE: sin actor no hay decisión', () => {
    expect(() =>
      appendDecision({ ...BASE, actor: '', rf: 'RF-001', paso: 'login/s3', decision: 'app', evidencia: 'en-vivo' }, acta),
    ).toThrow(/actor/i);
  });

  it('un actor de solo espacios es un actor ausente, no un actor raro', () => {
    expect(normalizeActor('   \t ')).toBeNull();
    expect(() =>
      appendDecision({ ...BASE, actor: '  ', rf: 'RF-001', paso: 'login/s3', decision: 'app', evidencia: 'en-vivo' }, acta),
    ).toThrow(/actor/i);
  });

  it('una entrada sin actor en el fichero se reporta como línea ilegible, no se cuela como válida', () => {
    const [a] = sembrarTres();
    const sinActor = { ...a, actor: '' };
    writeFileSync(acta, JSON.stringify(sinActor) + '\n', 'utf8');
    const { entries, malformed } = leer();
    expect(entries).toHaveLength(0);
    expect(malformed[0].reason).toMatch(/actor/i);
    expect(verifyChain(entries, malformed).ok).toBe(false);
  });

  it('el actor se normaliza pero NO se inventa: un nombre con saltos cabría romper el JSONL', () => {
    expect(normalizeActor('  claudio\n  jeldes ')).toBe('claudio jeldes');
  });
});

describe('enums y campos obligatorios — el schema tampoco se negocia', () => {
  const casos: Array<[string, Record<string, unknown>]> = [
    ['decision inventada', { decision: 'quiza' }],
    ['evidencia inventada', { evidencia: 'creo-que-si' }],
    ['sin rf', { rf: '' }],
    ['sin paso', { paso: '' }],
    ['sin fd_hash', { fd_hash: '' }],
    ['sin script_hash', { script_hash: '' }],
  ];
  for (const [nombre, parche] of casos) {
    it(`rechaza: ${nombre}`, () => {
      expect(() =>
        appendDecision(
          { ...BASE, rf: 'RF-001', paso: 'login/s3', decision: 'app', evidencia: 'en-vivo', ...parche } as never,
          acta,
        ),
      ).toThrow();
    });
  }
});

describe('appendDecision se niega a escribir sobre una cadena rota', () => {
  it('encadenar encima de una manipulación la sellaría — así que no se encadena', () => {
    sembrarTres();
    const lineas = readFileSync(acta, 'utf8').trimEnd().split('\n');
    const media = JSON.parse(lineas[1]) as DecisionEntry;
    media.valor_nuevo = 'lo que me conviene';
    lineas[1] = serializeEntry(media);
    writeFileSync(acta, lineas.join('\n') + '\n', 'utf8');

    expect(() =>
      appendDecision({ ...BASE, rf: 'RF-009', paso: 'x/s1', decision: 'app', evidencia: 'en-vivo' }, acta),
    ).toThrow(/cadena rota/i);
    // Y no ha escrito nada: siguen siendo tres líneas.
    expect(readFileSync(acta, 'utf8').trimEnd().split('\n')).toHaveLength(3);
  });
});

describe('supersedes — revisable, con la traza intacta', () => {
  it('manda la última y la anterior sigue en el fichero', () => {
    const [, b] = sembrarTres();
    const nueva = appendDecision(
      {
        ...BASE,
        rf: 'RF-004',
        paso: 'transfer/s7',
        decision: 'fd',
        evidencia: 'desde-cero',
        supersedes: b.hash,
        timestamp: '2026-08-24T11:00:00.000Z',
      },
      acta,
    ).entry;

    const { entries, malformed } = leer();
    expect(entries).toHaveLength(4);
    expect(verifyChain(entries, malformed).ok).toBe(true);
    const vigente = effectiveDecisions(entries).get('RF-004 transfer/s7');
    expect(vigente?.hash).toBe(nueva.hash);
    expect(vigente?.decision).toBe('fd');
    // La revocada NO desaparece: la traza es el punto.
    expect(entries.some((e) => e.hash === b.hash)).toBe(true);
  });

  it('supersedes que no apunta a ninguna entrada anterior es un error', () => {
    sembrarTres();
    appendDecision(
      { ...BASE, rf: 'RF-004', paso: 'transfer/s7', decision: 'fd', evidencia: 'en-vivo', supersedes: 'ffffffffffffffffffffffffffffffff' },
      acta,
    );
    const { entries, malformed } = leer();
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(false);
    expect(v.issues.some((i) => i.rule === 'supersedes-inexistente')).toBe(true);
  });

  it('revocar la decisión de OTRO criterio avisa pero no bloquea: es legible, solo sospechoso', () => {
    const [a] = sembrarTres();
    appendDecision(
      { ...BASE, rf: 'RF-006', paso: 'bill-pay/s2', decision: 'app', valor_nuevo: 'x', evidencia: 'en-vivo', supersedes: a.hash },
      acta,
    );
    const { entries, malformed } = leer();
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(true);
    expect(v.issues.map((i) => i.rule)).toContain('supersedes-cruzado');
  });
});

describe('la huella canónica', () => {
  it('un valor_nuevo ausente y uno undefined dan el MISMO hash', () => {
    const base = {
      rf: 'RF-001',
      paso: 'login/s3',
      decision: 'fd' as const,
      fd_hash: BASE.fd_hash,
      script_hash: BASE.script_hash,
      evidencia: 'en-vivo' as const,
      actor: BASE.actor,
      timestamp: '2026-08-24T09:00:00.000Z',
    };
    expect(canonicalPayload(base)).toBe(canonicalPayload({ ...base, valor_nuevo: undefined }));
    expect(computeHash(base, DECISIONS_GENESIS)).toBe(computeHash({ ...base, valor_nuevo: undefined }, DECISIONS_GENESIS));
  });

  it('cambiar cualquier campo cambia el hash', () => {
    const base = {
      rf: 'RF-001',
      paso: 'login/s3',
      decision: 'app' as const,
      valor_nuevo: 'Bienvenido',
      fd_hash: BASE.fd_hash,
      script_hash: BASE.script_hash,
      evidencia: 'en-vivo' as const,
      actor: BASE.actor,
      timestamp: '2026-08-24T09:00:00.000Z',
    };
    const h = computeHash(base, DECISIONS_GENESIS);
    expect(computeHash({ ...base, valor_nuevo: 'Bienvenido ' }, DECISIONS_GENESIS)).not.toBe(h);
    expect(computeHash({ ...base, evidencia: 'desde-cero' }, DECISIONS_GENESIS)).not.toBe(h);
    expect(computeHash({ ...base, actor: 'otro' }, DECISIONS_GENESIS)).not.toBe(h);
    // Y el eslabón previo también entra: la misma decisión en otra posición no vale.
    expect(computeHash(base, 'aaaa')).not.toBe(h);
  });

  it('ACOPLAMIENTO: hashJson es el mismo algoritmo que hashScript del walker', () => {
    // No se importa walk-core desde src/ (src es la capa baja). Este test es lo que
    // impide que las dos funciones deriven en silencio y el script_hash del acta deje
    // de coincidir con el que calcula el walker.
    const script: WalkScript = {
      version: 1,
      site_id: 'parabank',
      entry: '/parabank/index.htm',
      flows: [{ flow: 'login', steps: [{ id: 's1', action: 'goto', target: '/parabank/index.htm' }] }],
    };
    expect(hashJson(script)).toBe(hashScript(script));
  });
});

describe('lectura tolerante — un BOM no puede significar «acta vacía»', () => {
  it('BOM, CRLF y líneas en blanco no rompen la verificación', () => {
    const [, , c] = sembrarTres();
    const crudo = readFileSync(acta, 'utf8').trimEnd().split('\n');
    writeFileSync(acta, '\uFEFF' + crudo.join('\r\n') + '\r\n\r\n', 'utf8');
    const { entries, malformed } = leer();
    expect(malformed).toEqual([]);
    expect(entries).toHaveLength(3);
    const v = verifyChain(entries, malformed);
    expect(v.ok).toBe(true);
    expect(v.head).toBe(c.hash);
  });

  it('una línea basura se reporta con su número, y no tumba a las buenas', () => {
    sembrarTres();
    const crudo = readFileSync(acta, 'utf8').trimEnd().split('\n');
    crudo.splice(2, 0, 'esto no es json');
    writeFileSync(acta, crudo.join('\n') + '\n', 'utf8');
    const { entries, malformed } = leer();
    expect(entries).toHaveLength(3);
    expect(malformed).toHaveLength(1);
    expect(malformed[0].line).toBe(3);
    // Pero el acta NO pasa: hay una línea que nadie puede explicar.
    expect(verifyChain(entries, malformed).ok).toBe(false);
  });
});

describe('dónde vive el acta', () => {
  it('config/decisions/<site>.jsonl — durable como los hint-aliases, no efímero como .work/', () => {
    expect(decisionsPathFor('parabank', '/repo').replace(/\\/g, '/')).toMatch(/\/repo\/config\/decisions\/parabank\.jsonl$/);
  });

  it('un site_id con separadores no se escapa del directorio', () => {
    expect(decisionsPathFor('../../etc/passwd', '/repo').replace(/\\/g, '/')).toMatch(/\/repo\/config\/decisions\/[^/]+\.jsonl$/);
  });

  it('un site_id vacío no produce un acta anónima', () => {
    expect(() => decisionsPathFor('   ')).toThrow();
  });
});
