/**
 * D27 — el panel recibe la CAUSA, no la pista.
 *
 * El caso de campo, literal: el QA respondió **«No existe»** a un elemento que
 * existía **tres veces**. No se equivocó él — el panel le enseñaba la forma del
 * hint (`click sobre texto "Ref."`) y ni una palabra sobre si el elemento faltaba
 * o sobraba. Una ambigüedad presentada como ausencia induce la respuesta
 * equivocada, y esa respuesta se promueve a memoria durable.
 *
 * Aquí se prueba la función pura que produce el texto. El par que importa es el
 * primero: MISMO elemento pedido, distinta realidad de pantalla → mensajes que
 * llevan a acciones distintas. Si los dos dijeran lo mismo, D27 seguiría abierto.
 *
 * Y de paso la pasada de textos de P0: ninguna salida puede contener vocabulario
 * del motor. El QA no tiene por qué saber que dentro hay una escalera de locators.
 */
import { describe, it, expect } from 'vitest';
import { textoAsistencia, pedidoDelPaso } from '../src/walk-core.ts';
import { candidatosParaInforme, pedidoSinPalabrasUtiles, resultadosOrdenados } from '../../src/locator-candidates.ts';

/** Palabras del motor. Ninguna puede llegar a la pantalla del QA. */
const JERGA = [
  'hint', 'drift', 'irresoluble', 'locator', 'selector', 'peldaño', 'escalera',
  'testid', 'getByRole', 'retry_safe', 'scope', 'postcondición', 'walk-script',
];

function sinJerga(texto: string): string[] {
  const t = texto.toLowerCase();
  return JERGA.filter((j) => t.includes(j.toLowerCase()));
}

describe('D27 — la misma petición, dos realidades, dos mensajes', () => {
  const pedido = 'Ref.';

  it('EL PAR FALSABLE: existe TRES veces → dice que hay varios, no que no está', () => {
    const t = textoAsistencia({
      causa: 'ambiguo',
      pedido,
      coincidencias: 3,
      candidatos: ['Ref.', 'Ref. customer', 'Project ref.'],
    });
    expect(t).toContain('3 veces');
    expect(t).toContain('No es que no exista');
    expect(t).toContain('Ref. customer');
    // Lo que NO puede decir: nada que sugiera ausencia. Es el error que se midió.
    expect(t).not.toMatch(/No encuentro/i);
  });

  it('...y cuando de verdad no está, lo dice de otra manera', () => {
    const t = textoAsistencia({ causa: 'ausente', pedido, coincidencias: 0, candidatos: [] });
    expect(t).toMatch(/No encuentro/i);
    expect(t).toContain('No existe aquí');
    expect(t).not.toContain('veces');
  });

  it('los dos mensajes son DISTINTOS — si coincidieran, D27 seguiría abierto', () => {
    const ambiguo = textoAsistencia({ causa: 'ambiguo', pedido, coincidencias: 3, candidatos: ['Ref.', 'Ref. customer'] });
    const ausente = textoAsistencia({ causa: 'ausente', pedido, coincidencias: 0, candidatos: [] });
    expect(ambiguo).not.toBe(ausente);
  });
});

describe('los candidatos son la mitad del mensaje', () => {
  it('sin candidatos, el mensaje pide otro camino en vez de callarse', () => {
    const t = textoAsistencia({ causa: 'ausente', pedido: 'iniciar sesión', candidatos: [] });
    expect(t).toContain('ni nada que se le parezca');
  });

  it('con candidatos, los enseña: es el caso medido en ParaBank', () => {
    // Pantalla real del run: el paso pedía "iniciar sesión" (FD en castellano) y
    // el botón se llamaba "Log In". Estaba capturado en el mismo dom-map.
    const pantalla = ['Log In', 'Forgot login info?', 'About Us', 'Home', 'Contact Us'];
    const cand = candidatosParaInforme(pantalla, 'login', false);
    const t = textoAsistencia({ causa: 'ausente', pedido: 'login', candidatos: cand });
    expect(cand).toContain('Log In');
    expect(t).toContain('Log In');
    expect(t).toContain('Lo más parecido');
  });

  it('CONTROL: la lista no se convierte en un volcado de la pantalla', () => {
    const muchos = Array.from({ length: 60 }, (_, i) => `Opción login ${i}`);
    expect(candidatosParaInforme(muchos, 'login', false)).toHaveLength(8);
  });
});

describe('la postcondición que no aparece habla de resultados, no de aserciones', () => {
  it('con resultados en pantalla, ofrece la lectura «el plan se quedó viejo»', () => {
    const t = textoAsistencia({
      causa: 'resultado-ausente',
      pedido: 'resumen de cuentas',
      candidatos: ['Accounts Overview', 'Account Services'],
    });
    expect(t).toContain('Accounts Overview');
    expect(t).toContain('el plan se quedó viejo');
  });

  it('SIN resultados, eso ES información y empuja al defecto (regla dura de P2)', () => {
    const t = textoAsistencia({ causa: 'resultado-ausente', pedido: 'resumen de cuentas', candidatos: [] });
    expect(t).toContain('NINGÚN resultado');
    expect(t).toContain('defecto');
    expect(t).not.toContain('plan se quedó viejo');
  });
});

describe('los resultados se ORDENAN, no se filtran', () => {
  /**
   * Se vio diseñando el ejercicio de OrangeHRM, antes de que llegara a un QA:
   * filtrar aquí hacía que el panel afirmara «esta pantalla no muestra NINGÚN
   * resultado» cuando lo cierto era «muestra tres, y ninguno se parece». Son dos
   * diagnósticos distintos y llevan a decisiones distintas: defecto vs. plan viejo.
   */
  it('lo parecido va primero, pero lo que no se parece TAMBIÉN se enseña', () => {
    const pantalla = ['No Records Found', 'Leave List', 'Leave'];
    const r = resultadosOrdenados(pantalla, 'Records encontrados');
    expect(r[0]).toBe('No Records Found');   // comparte "records"
    expect(r).toContain('Leave List');       // no se parece y aun así se enseña
    expect(r).toHaveLength(3);
  });

  it('EL PAR: sin NADA parecido sigue devolviendo lo que hay — la lista vacía significa pantalla muda', () => {
    const pantalla = ['Leave', 'Leave List'];
    expect(resultadosOrdenados(pantalla, 'Solicitudes encontradas')).toEqual(['Leave', 'Leave List']);
    expect(resultadosOrdenados([], 'Solicitudes encontradas')).toEqual([]);
  });

  it('y el mensaje solo dice «ningún resultado» cuando de verdad no hay ninguno', () => {
    const conAlgo = textoAsistencia({ causa: 'resultado-ausente', pedido: 'X', candidatos: resultadosOrdenados(['Leave'], 'X') });
    const sinNada = textoAsistencia({ causa: 'resultado-ausente', pedido: 'X', candidatos: resultadosOrdenados([], 'X') });
    expect(conAlgo).not.toContain('NINGÚN resultado');
    expect(sinNada).toContain('NINGÚN resultado');
  });

  it('CONTROL: tope de 8, igual que el informe', () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `Resultado ${i}`);
    expect(resultadosOrdenados(muchos, 'nada que ver')).toHaveLength(8);
  });
});

describe('P0 — el panel habla el idioma del QA', () => {
  const casos = [
    textoAsistencia({ causa: 'ambiguo', pedido: 'Ref.', coincidencias: 3, candidatos: ['Ref. customer'] }),
    textoAsistencia({ causa: 'ausente', pedido: 'iniciar sesión', candidatos: ['Log In'] }),
    textoAsistencia({ causa: 'ausente', pedido: 'iniciar sesión', candidatos: [] }),
    textoAsistencia({ causa: 'zona-ausente', pedido: 'Guardar', zona: 'Documento de Liquidación' }),
    textoAsistencia({ causa: 'resultado-ausente', pedido: 'resumen de cuentas', candidatos: ['Accounts Overview'] }),
    textoAsistencia({ causa: 'resultado-ausente', pedido: 'resumen de cuentas', candidatos: [] }),
  ];

  for (const [i, t] of casos.entries()) {
    it(`ninguna palabra del motor en el mensaje ${i + 1}`, () => {
      expect(sinJerga(t), `jerga encontrada en: ${t}`).toEqual([]);
    });
  }
});

describe('pedidoDelPaso — lo que el plan pedía, en palabras del plan', () => {
  it('prefiere el nombre accesible, que es lo que el QA reconoce en pantalla', () => {
    expect(pedidoDelPaso({ role: 'button', name: 'Log In', test_id: 'btn-42' })).toBe('Log In');
  });

  it('cae a label, texto y por último al test-id', () => {
    expect(pedidoDelPaso({ label: 'Username' })).toBe('Username');
    expect(pedidoDelPaso({ text: 'iniciar sesión' })).toBe('iniciar sesión');
    expect(pedidoDelPaso({ test_id: 'btn-42' })).toBe('btn-42');
  });

  it('sin hint no se inventa nada', () => {
    expect(pedidoDelPaso(undefined)).toContain('no dice qué buscar');
  });
});

// --------------------------------------------------------- el cableado, no solo el texto

/**
 * Lo anterior prueba el MENSAJE. Esto prueba que la causa se MIDE contra la página:
 * es donde D27 vivía. Se llega al método privado igual que en `verify-patch-mudo`.
 */
import { beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DomWalker, type StyleContract, type WalkerOptions } from '../src/dom-walker.ts';
import type { WalkScript, WalkState, WalkStep } from '../src/walk-types.ts';

const FIXTURES = pathToFileURL(resolve(__dirname, '../fixtures')).href;
let navegador: Browser;
let pagina: Page;

function walkerSobre(pagina: Page): (step: WalkStep) => Promise<string> {
  const workDir = mkdtempSync(resolve(tmpdir(), 'qa-d27-'));
  const script: WalkScript = { version: 1, site_id: 'd27', entry: '/', flows: [] };
  const contract: StyleContract = {
    locators: { priority: ['getByTestId', 'getByRole', 'getByLabel', 'getByText'] },
  } as StyleContract;
  const state: WalkState = {
    script_hash: 't', completed: [], rescues_used: 0, screens: [], transitions: [],
    open_questions: [], rescues: [], current_screen: null, step_reports: [],
  };
  const opts: WalkerOptions = {
    scriptPath: 't', contractPath: 't', baseUrl: FIXTURES, workDir, rescueBudget: 0, screenCap: 60,
    headed: false, assist: false, assistTimeoutMs: 1_000, assistMinimize: false,
    aliasesPath: resolve(workDir, 'a.json'), timingProfilePath: resolve(workDir, 't.json'), calibrate: false,
  };
  const w = new DomWalker(opts, script, contract, state);
  (w as unknown as { page: Page }).page = pagina;
  const fn = (w as unknown as { diagnosticarParaPanel: (s: WalkStep) => Promise<string> }).diagnosticarParaPanel;
  return fn.bind(w);
}

beforeAll(async () => {
  navegador = await chromium.launch();
  pagina = await navegador.newPage();
}, 120_000);

afterAll(async () => {
  await navegador?.close();
});

describe('D27 contra DOM real — la causa se mide, no se supone', () => {
  it('EL CASO DE CAMPO: el texto que aparece DOS veces se anuncia como varios, no como ausente', async () => {
    // 'Duplicado' esta en DOS spans no anidados con el MISMO texto exacto: la
    // escalera se planta por la regla dura de siempre (>=2 coincidencias visibles).
    await pagina.goto(`${FIXTURES}/ancla-ambigua.html`);
    const diagnosticar = walkerSobre(pagina);
    const t = await diagnosticar({ id: 's1', action: 'click', hint: { text: 'Duplicado' } });
    expect(t).toMatch(/aparece \d+ veces/);
    expect(t).toContain('No es que no exista');
    expect(t).not.toMatch(/No encuentro/i);
    expect(sinJerga(t)).toEqual([]);
  }, 120_000);

  it('lo que de verdad no esta sale como ausente, con lo parecido que si hay', async () => {
    await pagina.goto(`${FIXTURES}/texto-ambiguo.html`);
    const diagnosticar = walkerSobre(pagina);
    const t = await diagnosticar({ id: 's1', action: 'click', hint: { text: 'Parafarmacia veterinaria' } });
    expect(t).toMatch(/No encuentro/i);
    // El candidato sale de la pantalla VIVA, no del dom-map (que aqui ni existe).
    expect(t).toContain('Parafarmacia');
    expect(sinJerga(t)).toEqual([]);
  }, 120_000);

  it('CONTROL: sin nada parecido en pantalla no se inventa un candidato', async () => {
    await pagina.goto(`${FIXTURES}/texto-ambiguo.html`);
    const diagnosticar = walkerSobre(pagina);
    const t = await diagnosticar({ id: 's1', action: 'click', hint: { text: 'Hipoteca variable' } });
    expect(t).toContain('ni nada que se le parezca');
  }, 120_000);

  /**
   * El caso que destapo escribir este bloque. `texto-ambiguo.html` ya NO es ambiguo
   * para la escalera de hoy: prueba el texto exacto antes que el substring, asi que
   * 'Medicamentos' resuelve al enlace y no al parrafo del pie. Con UNA coincidencia,
   * decirle al QA "no encuentro" seria mandarlo a buscar lo que tiene delante — la
   * misma mentira que D27, por el otro lado.
   */
  it('con UNA sola coincidencia no se dice ni que falta ni que sobra', async () => {
    await pagina.goto(`${FIXTURES}/texto-ambiguo.html`);
    const diagnosticar = walkerSobre(pagina);
    const t = await diagnosticar({ id: 's1', action: 'click', hint: { text: 'Medicamentos' } });
    expect(t).toContain('Sí veo');
    expect(t).not.toMatch(/No encuentro/i);
    expect(t).not.toMatch(/aparece \d+ veces/);
    expect(sinJerga(t)).toEqual([]);
  }, 120_000);
});

describe('el pedido que no da para comparar, y la ventana que tapa el fondo', () => {
  /**
   * El FD de onesait dice literalmente «pulsar el botón de cerrar "X"» tres veces, y
   * las aplicaciones corporativas lo pintan `×`. Con un pedido de un solo carácter el
   * emparejamiento por palabras (≥3) no produce NADA nunca, así que el panel concluía
   * «ni nada que se le parezca» con el botón delante. La lista vacía significaba «no
   * se puede comparar», no «no hay nada»: afirmar lo segundo es decir algo falso.
   */
  it('EL PAR: «X» no da para emparejar, y eso NO es lo mismo que no haber nada', () => {
    expect(pedidoSinPalabrasUtiles('X')).toBe(true);
    expect(pedidoSinPalabrasUtiles('×')).toBe(true);
    expect(pedidoSinPalabrasUtiles('Buscar')).toBe(false);
    // Con el pedido corto se enseña lo que hay; con uno normal, solo lo parecido.
    const botones = ['×', 'No, Cancel', 'Yes, Delete'];
    expect(resultadosOrdenados(botones, 'X')).toEqual(botones);
    expect(candidatosParaInforme(botones, 'Buscar', false)).toEqual([]);
  });

  it('CONTROL: dos caracteres tampoco, tres sí — el umbral es el del emparejamiento', () => {
    expect(pedidoSinPalabrasUtiles('ok')).toBe(true);
    expect(pedidoSinPalabrasUtiles('Sí')).toBe(true);
    expect(pedidoSinPalabrasUtiles('Add')).toBe(false);
  });
});
