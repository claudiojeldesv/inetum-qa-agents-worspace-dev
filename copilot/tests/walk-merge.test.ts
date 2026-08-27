/**
 * Fundir el parche del panel en el guion.
 *
 * Los pares que importan, y por qué:
 *
 *  - **La restricción innegociable**: el SPEC dice dos veces que el parche nunca se
 *    aplica solo. El test que la protege es el más aburrido y el más importante.
 *  - **Los tres campos que rompen**: `value` (y con él `secret`), y el trío
 *    `retry_safe`+`expect_transition`+`screen`. No son pérdida de comodidad: sin
 *    arrastrarlos el guion **deja de validar**, o se vuelca una contraseña.
 *  - **La continuidad del id**: si el objetivo no conserva el id del paso al que
 *    sustituye, todas las decisiones ya firmadas en el acta pasan a nombrar un paso
 *    que el FD nunca describió.
 *  - **Dos grupos, no siete**: el par falsable que el plan del panel fija literalmente.
 */
import { describe, it, expect } from 'vitest';
import {
  agruparPorPeso,
  derivarIds,
  esMismoElemento,
  fundirGuion,
  gradoDeEvidencia,
  parcheIntegro,
  validarFundido,
  CAMPOS_AL_TARGET,
} from '../src/walk-merge.ts';
import { assistStepsToWalkSteps } from '../src/walk-core.ts';
import type { AssistPatch, AssistPatchStep, WalkScript, WalkStep } from '../src/walk-types.ts';

// ------------------------------------------------------------ constructores

const abridor = (name: string): AssistPatchStep => ({
  action: 'hover',
  hint: { role: 'link', name },
  locator: `getByRole('link', { name: '${name}' })`,
  role: 'opener',
});

const objetivo = (action: AssistPatchStep['action'], hint: AssistPatchStep['hint']): AssistPatchStep => ({
  action,
  hint,
  locator: `getByRole('button', { name: '${hint.name ?? 'X'}' })`,
  role: 'target',
});

const comprobacion = (value: string): AssistPatchStep => ({
  action: 'expect_text',
  hint: {},
  locator: '',
  role: 'assertion',
  value,
});

function guion(paso: WalkStep, flow = 'compra'): WalkScript {
  return {
    version: 1,
    site_id: 'sitio',
    entry: '/',
    flows: [{ flow, criteria: ['RF-001'], steps: [{ id: 's1', action: 'goto', target: '/' }, paso] }],
  };
}

function parche(pasos: AssistPatchStep[], opts: Partial<AssistPatch['entries'][number]> = {}): AssistPatch {
  const replaces = opts.replaces_step ?? 's6';
  return {
    version: 1,
    site_id: 'sitio',
    generated_at: '2026-08-26T10:00:00.000Z',
    entries: [
      {
        flow: 'compra',
        replaces_step: replaces,
        steps: pasos,
        walk_steps: assistStepsToWalkSteps(pasos, replaces),
        verified: true,
        ...opts,
      },
    ],
  };
}

const pasoDe = (r: { script: WalkScript }, id: string): WalkStep | undefined =>
  r.script.flows[0].steps.find((s) => s.id === id);

// ---------------------------------------------------------------- los pares

describe('la restricción innegociable — el parche no se aplica solo', () => {
  it('EL PAR: fundir devuelve una COPIA y no toca la entrada', () => {
    const original = guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } });
    const antes = JSON.stringify(original);
    const r = fundirGuion(original, parche([abridor('Menú'), objetivo('click', { name: 'Comprar' })]));
    expect(JSON.stringify(original), 'el guion de entrada se ha mutado').toBe(antes);
    expect(r.script).not.toBe(original);
    // y sí produjo algo: si no, el test pasaría por vacío
    expect(r.script.flows[0].steps.map((s) => s.id)).toContain('s6#a1');
  });
});

describe('los campos que rompen si no se arrastran', () => {
  it('EL PAR de la contraseña: un fill con value + secret los conserva, y el guion valida', () => {
    const original: WalkStep = {
      id: 's6',
      action: 'fill',
      hint: { label: 'Contraseña' },
      value: '$fixtures.credentials[0].password',
      secret: true,
    };
    const r = fundirGuion(guion(original), parche([abridor('Acceso'), objetivo('fill', { label: 'Contraseña' })]));
    expect(r.rechazos).toEqual([]);
    const target = pasoDe(r, 's6');
    expect(target?.value, 'sin value el guion no valida').toBe('$fixtures.credentials[0].password');
    expect(target?.secret, 'perder secret vuelca la contraseña al dom-map').toBe(true);
    expect(validarFundido(r.script).ok).toBe(true);
  });

  it('EL PAR del oráculo: retry_safe + expect_transition + screen sobreviven juntos', () => {
    const original: WalkStep = {
      id: 's6',
      action: 'click',
      hint: { name: 'Siguiente' },
      retry_safe: true,
      expect_transition: true,
      screen: 'resumen',
    };
    const r = fundirGuion(guion(original), parche([abridor('Menú'), objetivo('click', { name: 'Siguiente' })]));
    const target = pasoDe(r, 's6');
    expect(target?.retry_safe).toBe(true);
    expect(target?.expect_transition).toBe(true);
    expect(target?.screen).toBe('resumen');
    // El trío es atómico: sin expect_transition, retry_safe deja de validar.
    expect(validarFundido(r.script).ok).toBe(true);
  });

  it('CONTROL con mutante: quitar el arrastre pone rojo el guion', () => {
    const original: WalkStep = { id: 's6', action: 'fill', hint: { label: 'Usuario' }, value: 'x' };
    const r = fundirGuion(guion(original), parche([objetivo('fill', { label: 'Usuario' })]));
    const sinValue = JSON.parse(JSON.stringify(r.script)) as WalkScript;
    delete (sinValue.flows[0].steps.find((s) => s.id === 's6') as unknown as Record<string, unknown>).value;
    expect(validarFundido(sinValue).ok, 'el test tiene que poder ponerse rojo').toBe(false);
  });

  it('la tabla de campos es DATO: cada entrada existe de verdad en un WalkStep', () => {
    const muestra: Record<string, unknown> = {
      value: 'v', secret: true, dialog: 'accept', target: '/x', operator: '>', each: { hint: {}, operator: '>', value: '0' },
      container: { role: 'main' }, max_steps: 3, debounced: true, debounce_ms: 400, expect_after: 'ok',
      expect_transition: true, screen: 'p', retry_safe: true, settle: { quiet_ms: 100 },
    };
    for (const campo of CAMPOS_AL_TARGET) {
      expect(muestra, `CAMPOS_AL_TARGET nombra '${campo}', que no existe en WalkStep`).toHaveProperty(campo);
    }
  });
});

describe('rechazos duros — no se ofrecen a aprobar', () => {
  it('un secreto sin con qué rellenarlo NO se funde', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'Entrar' }, secret: true };
    const r = fundirGuion(guion(original), parche([objetivo('click', { name: 'Entrar' })]));
    expect(r.rechazos).toHaveLength(1);
    expect(r.rechazos[0].motivo).toMatch(/secreto/i);
  });

  it('un expect_after que no cabe en la acción resuelta NO se funde', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'Ver' }, expect_after: 'Listado' };
    // El objetivo resuelto es una comprobación: expect_after no aplica ahí.
    const r = fundirGuion(guion(original), parche([objetivo('expect_text', { name: 'Ver' })]));
    expect(r.rechazos.some((x) => /oráculo/i.test(x.motivo))).toBe(true);
  });
});

describe('el id del objetivo — la continuidad del acta', () => {
  it('EL PAR: con abridores, el objetivo CONSERVA el id del paso original', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'Comprar' } };
    const r = fundirGuion(guion(original), parche([abridor('Menú'), abridor('Submenú'), objetivo('click', { name: 'Comprar' })]));
    const ids = r.script.flows[0].steps.map((s) => s.id);
    expect(ids).toEqual(['s1', 's6#a1', 's6#a2', 's6']);
    // lo que decide: 'compra/s6' sigue nombrando el acto que el plan describía
    expect(pasoDe(r, 's6')?.action).toBe('click');
  });

  it('CONTROL: sin re-clavar, el id del plan se lo quedaba el hover', () => {
    const pasos = [abridor('Menú'), objetivo('click', { name: 'Comprar' })];
    const crudos = assistStepsToWalkSteps(pasos, 's6');
    expect(crudos[0].id, 'así es como los deriva el walker').toBe('s6');
    expect(crudos[0].action, 'y s6 pasaba a ser el hover del menú').toBe('hover');
  });

  it('las comprobaciones se numeran aparte de los abridores', () => {
    expect(derivarIds('s6', ['opener', 'target', 'assertion', 'assertion'])).toEqual(['s6#a1', 's6', 's6#v1', 's6#v2']);
  });

  it('los ids nuevos no chocan con los que ya hay en el flujo', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'X' } };
    const r = fundirGuion(guion(original), parche([abridor('M'), objetivo('click', { name: 'X' })]));
    const ids = r.script.flows[0].steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('peso — dos grupos, no una lista', () => {
  it('EL PAR DEL PLAN: 6 de coreografía y 1 de resultado esperado → DOS grupos', () => {
    const pasos = [
      abridor('A'), abridor('B'), abridor('C'), abridor('D'), abridor('E'),
      objetivo('click', { name: 'Comprar' }),
      comprobacion('Pedido confirmado'),
    ];
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } }), parche(pasos));
    const g = agruparPorPeso(r.cambios);
    expect(g.coreografia).toHaveLength(6); // 5 abridores + la identidad refinada
    expect(g.oraculo).toHaveLength(1);
    expect(Object.keys(g)).toHaveLength(2);
  });

  it('...y con 20 de coreografía SIGUEN siendo dos grupos', () => {
    const pasos = [
      ...Array.from({ length: 19 }, (_, i) => abridor(`M${i}`)),
      objetivo('click', { name: 'Comprar' }),
      comprobacion('Hecho'),
    ];
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } }), parche(pasos));
    const g = agruparPorPeso(r.cambios);
    expect(g.coreografia).toHaveLength(20);
    expect(g.oraculo).toHaveLength(1);
  });

  it('el mismo elemento con más precisión es COREOGRAFÍA — no se molesta al QA', () => {
    const r = fundirGuion(
      guion({ id: 's6', action: 'click', hint: { name: 'Usuario' } }),
      parche([objetivo('click', { role: 'textbox', name: 'Usuario' })], { original_hint: { name: 'Usuario' } }),
    );
    expect(r.cambios.find((c) => c.paso === 's6')?.peso).toBe('coreografia');
  });

  it('EL PAR: si el elemento es OTRO, sube a oráculo', () => {
    const r = fundirGuion(
      guion({ id: 's6', action: 'click', hint: { name: 'Usuario' } }),
      parche([objetivo('click', { name: 'Contraseña' })], { original_hint: { name: 'Usuario' } }),
    );
    const c = r.cambios.find((x) => x.paso === 's6');
    expect(c?.peso).toBe('oraculo');
    expect(c?.clase).toBe('elemento-distinto');
  });
});

describe('esMismoElemento — la regla del superset', () => {
  it('enriquecer no es cambiar', () => {
    expect(esMismoElemento({ name: 'Usuario' }, { role: 'textbox', name: 'Usuario' })).toBe(true);
  });
  it('tolera acentos y espacios, que es lo que normaliza el motor', () => {
    expect(esMismoElemento({ name: 'Simulación  /  Rescates' }, { name: 'Simulacion / Rescates' })).toBe(true);
  });
  it('perder un campo SÍ es cambiar', () => {
    expect(esMismoElemento({ role: 'button', name: 'X' }, { name: 'X' })).toBe(false);
  });
  it('sin original no hay nada que contradecir', () => {
    expect(esMismoElemento(undefined, { name: 'X' })).toBe(true);
  });
});

describe('el guion se movió — el gate es la rebanada, no el hash', () => {
  it('si el paso ya no está, se rechaza y no se inventa dónde meterlo', () => {
    const r = fundirGuion(guion({ id: 's7', action: 'click', hint: { name: 'X' } }), parche([objetivo('click', { name: 'X' })]));
    expect(r.rechazos[0].motivo).toMatch(/ya no está en el plan/);
  });

  it('si el flujo ya no está, se rechaza', () => {
    const g = guion({ id: 's6', action: 'click', hint: { name: 'X' } }, 'otro-flujo');
    expect(fundirGuion(g, parche([objetivo('click', { name: 'X' })])).rechazos[0].motivo).toMatch(/flujo/);
  });

  it('EL PAR: si alguien reescribió ESE paso, se rechaza', () => {
    const r = fundirGuion(
      guion({ id: 's6', action: 'click', hint: { name: 'Cancelar' } }),
      parche([objetivo('click', { name: 'Comprar' })], { original_hint: { name: 'Comprar' } }),
    );
    expect(r.rechazos[0].motivo).toMatch(/reescribió/);
  });

  it('CONTROL: tocar OTRO flujo no molesta — es más preciso que un hash del fichero', () => {
    const g = guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } });
    g.flows.push({ flow: 'devolucion', steps: [{ id: 's1', action: 'goto', target: '/dev' }] });
    const r = fundirGuion(g, parche([objetivo('click', { name: 'Comprar' })], { original_hint: { name: 'Comprar' } }));
    expect(r.rechazos).toEqual([]);
  });
});

describe('scope y locator no pueden convivir', () => {
  it('con locator, el scope se retira y se declara como cambio', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'X' }, scope: { role: 'dialog', name: 'Aviso' } };
    const r = fundirGuion(guion(original), parche([objetivo('click', { name: 'X' })]));
    expect(pasoDe(r, 's6')?.scope).toBeUndefined();
    expect(r.cambios.some((c) => c.clase === 'scope-retirado')).toBe(true);
    expect(validarFundido(r.script).ok).toBe(true);
  });

  it('EL PAR: sin locator, el scope SOBREVIVE — el paso sigue resolviendo por descripción', () => {
    const original: WalkStep = { id: 's6', action: 'click', hint: { name: 'X' }, scope: { role: 'dialog', name: 'Aviso' } };
    const sinLocator: AssistPatchStep = { action: 'click', hint: { name: 'X' }, locator: '', role: 'target' };
    const r = fundirGuion(guion(original), parche([sinLocator]));
    expect(pasoDe(r, 's6')?.scope).toEqual({ role: 'dialog', name: 'Aviso' });
    expect(validarFundido(r.script).ok).toBe(true);
  });
});

describe('grado de evidencia', () => {
  const casos: Array<[string, { verified: boolean; verify_reason?: string }, string]> = [
    ['replay en limpio', { verified: true }, 'desde-cero'],
    ['degradado en vivo', { verified: true, verify_reason: 'verificado SOLO EN VIVO: el camino previo…' }, 'en-vivo'],
    ['no verificado', { verified: false, verify_reason: 'replay falló: …' }, 'sin-verificar'],
    ['motivo desconocido', { verified: true, verify_reason: 'algo que no sabemos leer' }, 'sin-verificar'],
  ];
  for (const [nombre, entry, esperado] of casos) {
    it(`${nombre} → ${esperado}`, () => {
      expect(gradoDeEvidencia(entry)).toBe(esperado);
    });
  }

  it('un parche sin verificar SE FUNDE igual, marcado (decisión 3 del plan)', () => {
    const r = fundirGuion(
      guion({ id: 's6', action: 'click', hint: { name: 'X' } }),
      parche([objetivo('click', { name: 'X' })], { verified: false, verify_reason: 'replay falló' }),
    );
    expect(r.rechazos).toEqual([]);
    expect(r.cambios.every((c) => c.grado === 'sin-verificar')).toBe(true);
  });
});

describe('entradas repetidas', () => {
  it('lo mismo grabado dos veces: vale la última, con aviso', () => {
    const pasos = [objetivo('click', { name: 'X' })];
    const p = parche(pasos);
    p.entries.push({ ...p.entries[0], verified: false });
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'X' } }), p);
    expect(r.script.flows[0].steps.filter((s) => s.id === 's6')).toHaveLength(1);
    expect(r.avisos.some((a) => /última/.test(a.texto))).toBe(true);
  });

  it('EL PAR: dos versiones DISTINTAS avisan en grande', () => {
    const p = parche([objetivo('click', { name: 'X' })]);
    const otros = [objetivo('click', { name: 'Y' })];
    p.entries.push({ flow: 'compra', replaces_step: 's6', steps: otros, walk_steps: assistStepsToWalkSteps(otros, 's6'), verified: true });
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'X' } }), p);
    expect(r.avisos.some((a) => /VERSIONES DISTINTAS/.test(a.texto))).toBe(true);
  });
});

describe('integridad del parche', () => {
  it('el parche del walker es íntegro', () => {
    expect(parcheIntegro(parche([abridor('M'), objetivo('click', { name: 'X' })]).entries[0])).toBe(true);
  });

  it('EL PAR: un parche editado a mano se detecta', () => {
    const p = parche([objetivo('click', { name: 'X' })]);
    p.entries[0].walk_steps[0].locator = 'getByRole("button")  // tocado a mano';
    expect(parcheIntegro(p.entries[0])).toBe(false);
  });
});

describe('re-aplicar el mismo parche', () => {
  /**
   * Lo primero que hace cualquiera es volver a lanzarlo. Antes contestaba «alguien
   * reescribió ese paso», que manda al QA a investigar una manipulación que no existe.
   */
  it('EL PAR: dice que ya está fundido, no que alguien tocó el plan', () => {
    const pasos = [objetivo('click', { name: 'Delete' })];
    const p = parche(pasos, { original_hint: { name: 'papelera' } });
    // el guion YA es el resultado de fundir ese parche
    const yaFundido = guion({ id: 's6', action: 'click', hint: { name: 'Delete' } });
    const r = fundirGuion(yaFundido, p);
    expect(r.rechazos[0].motivo).toMatch(/ya está fundido/);
    expect(r.rechazos[0].motivo).not.toMatch(/reescribió/);
  });

  it('CONTROL: si de verdad lo reescribieron a OTRA cosa, sigue avisando de eso', () => {
    const p = parche([objetivo('click', { name: 'Delete' })], { original_hint: { name: 'papelera' } });
    const manipulado = guion({ id: 's6', action: 'click', hint: { name: 'Otra cosa' } });
    expect(fundirGuion(manipulado, p).rechazos[0].motivo).toMatch(/reescribió/);
  });
});

describe('lo que cambia el significado no entra si no se nombra (decisión 8)', () => {
  const conComprobacion = () =>
    parche([abridor('Menú'), objetivo('click', { name: 'Comprar' }), comprobacion('Pedido confirmado')], {
      original_hint: { name: 'Comprar' },
    });

  it('EL PAR: --aplicar a secas mete el camino pero NO la comprobación', () => {
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } }), conComprobacion());
    const ids = r.script.flows[0].steps.map((s) => s.id);
    expect(ids, 'el camino sí entra: se acepta en bloque').toContain('s6#a1');
    expect(ids, 'la comprobación NO entra sin nombrarla').not.toContain('s6#v1');
  });

  it('...y nombrándola, entra', () => {
    const r = fundirGuion(guion({ id: 's6', action: 'click', hint: { name: 'Comprar' } }), conComprobacion(), {
      oraculos: ['s6#v1'],
    });
    expect(r.script.flows[0].steps.map((s) => s.id)).toContain('s6#v1');
  });

  it('EL PAR: si el objetivo es OTRO elemento, la entrada entera se salta sin permiso', () => {
    const p = parche([objetivo('click', { name: 'Delete' })], { original_hint: { name: 'papelera' } });
    const g = guion({ id: 's6', action: 'click', hint: { name: 'papelera' } });
    const r = fundirGuion(g, p);
    expect(pasoDe(r, 's6')?.hint?.name, 'no se ha fundido').toBe('papelera');
    expect(r.avisos.some((a) => /se aprueba nombrándolo/.test(a.texto))).toBe(true);
  });

  it('...y con el permiso, se funde', () => {
    const p = parche([objetivo('click', { name: 'Delete' })], { original_hint: { name: 'papelera' } });
    const g = guion({ id: 's6', action: 'click', hint: { name: 'papelera' } });
    const r = fundirGuion(g, p, { elementos: ['s6'] });
    expect(pasoDe(r, 's6')?.hint?.name).toBe('Delete');
  });
});
