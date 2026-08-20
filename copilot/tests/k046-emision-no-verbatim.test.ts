/**
 * D20 — la notación de diagnóstico NO puede colarse como código.
 *
 * Medido en el segundo run de campo contra ParaBank: `chainToCode` volcaba verbatim
 * cualquier segmento que no empezara por `css=`, y el tier anclado emite su propia
 * notación —`anchored(label:'Username')`—. Eso acabó en el fichero generado como
 * `page.anchored(label:'Username')`, el POM no parseó, y con él murieron los TRES
 * specs del sitio: `Total: 0 tests in 0 files`. Un solo paso resuelto por ese
 * peldaño mataba la emisión entera.
 *
 * Y reventaba justo donde el peldaño existe para servir: el legacy sin `label for`
 * (K0.19/K0.21). O sea que la emisión a coste cero —la pieza insignia de K0.42—
 * no producía nada usable precisamente en su caso de uso principal.
 *
 * La lista es BLANCA y no negra a propósito: con una lista negra, cada peldaño
 * nuevo que emitiera notación propia volvería a colarse sin que nada se queje, que
 * es exactamente cómo llegó aquí.
 */
import { describe, it, expect } from 'vitest';
import { chainToCode, flowEligibility, primerSegmentoNoExpresable } from '../src/walk-to-spec.ts';
import type { StepReport, WalkFlow } from '../src/walk-types.ts';

const rep = (step: string, extra: Partial<StepReport> = {}): StepReport => ({
  flow: 'login',
  step,
  action: 'fill',
  outcome: 'ok',
  action_ms: 10,
  settle: { waited_ms: 1, busy_cycles: 0, resets: 0, timed_out: false, signals: [] },
  retried: false,
  ...extra,
});

const flujo = (): WalkFlow => ({
  flow: 'login',
  steps: [
    { id: 's1', action: 'fill', hint: { label: 'Usuario' }, value: 'x' },
    { id: 's2', action: 'fill', hint: { label: 'Contraseña' }, value: 'y' },
  ],
});

const mapa = (rs: StepReport[]) => new Map(rs.map((r) => [`login/${r.step}`, r]));

describe('D20 — qué segmentos son código y cuáles no', () => {
  /**
   * NO era un peldaño, eran TRES, y de tres familias de stack distintas: el defecto
   * mataba la emisión determinista en todo el legacy corporativo, no en ParaBank.
   * ParaBank es solo donde se vio.
   */
  it.each([
    ["anchored(label:'Username')", 'K0.19/K0.21 — onesait, JSF sin label for'],
    ["labelFor('Precio')", 'K0.36 — Angular 19 + PrimeNG, la etiqueta apunta al componente'],
    ["ariaLabelledby('Email')", 'K0.38 — Vaadin Flow, el IDREF cruza al shadow root'],
  ])('%s no es código (%s)', (notacion) => {
    expect(primerSegmentoNoExpresable(notacion)).toBe(notacion);
  });

  it('y tampoco lo es cuando va detrás de un ámbito válido (el caso real de campo)', () => {
    // el walker la encadena: `${via} >> anchored(...)`, así que revisar solo el
    // primer segmento habría dejado pasar la mitad de los casos
    expect(primerSegmentoNoExpresable("getByRole('dialog') >> anchored(label:'Precio')")).toBe(
      "anchored(label:'Precio')",
    );
  });

  it('el par falsable: toda la gramática real sigue siendo código', () => {
    for (const c of [
      "getByTestId('login')",
      "getByRole('button', { name: 'Acceder' })",
      "getByLabel('Usuario')",
      "getByPlaceholder('Search', { exact: true })",
      "getByText('Medicamentos', { exact: true })",
      'css=#username',
      "getByRole('dialog') >> getByLabel('Precio')",
    ]) {
      expect(primerSegmentoNoExpresable(c), c).toBeNull();
    }
  });

  it('chainToCode revienta en vez de escribir algo que no compila', () => {
    // el cinturón: `flowEligibility` ya descarta el flujo, pero esta función es
    // exportada y el fallo MUDO es lo que produjo el POM ilegible
    expect(() => chainToCode("anchored(label:'Username')")).toThrow(/no es código Playwright/);
  });

  it('y sigue traduciendo lo bueno igual que antes', () => {
    expect(chainToCode('css=#username')).toBe("locator('#username').filter({ visible: true })");
  });
});

describe('D20 — el flujo se rehúsa con motivo, no se emite roto', () => {
  it('un paso resuelto por el tier anclado deja el flujo FUERA, nombrando la causa', () => {
    const { steps, reasons } = flowEligibility(
      flujo(),
      mapa([rep('s1', { resolved_via: "getByLabel('Usuario')" }), rep('s2', { resolved_via: "anchored(label:'Password')" })]),
      [],
    );
    expect(steps).toHaveLength(1);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/notación de diagnóstico/);
    expect(reasons[0]).toMatch(/anchored\(label:'Password'\)/); // dice CUÁL, no "algo falló"
    expect(reasons[0]).toMatch(/D20/);
  });

  it('el par falsable: el mismo flujo con locators emisibles entra completo', () => {
    const { steps, reasons } = flowEligibility(
      flujo(),
      mapa([rep('s1', { resolved_via: "getByLabel('Usuario')" }), rep('s2', { resolved_via: 'css=[name="password"]' })]),
      [],
    );
    expect(reasons).toEqual([]);
    expect(steps).toHaveLength(2);
  });

  it('`emit_locator` manda sobre `resolved_via`, que es diagnóstico', () => {
    // el punto de cableado para recuperar la emisión en legacy: cuando el walker
    // sepa derivar un selector concreto del elemento anclado, lo pone aquí y el
    // flujo vuelve a emitirse — sin tocar `resolved_via`, que lo parsea classifyVia
    const { steps, reasons } = flowEligibility(
      flujo(),
      mapa([
        rep('s1', { resolved_via: "getByLabel('Usuario')" }),
        rep('s2', { resolved_via: "anchored(label:'Password')", emit_locator: 'css=[name="password"]' }),
      ]),
      [],
    );
    expect(reasons).toEqual([]);
    expect(steps).toHaveLength(2);
    expect(steps[1].chain).toBe('css=[name="password"]');
  });
});
