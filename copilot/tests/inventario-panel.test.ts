/**
 * D81 — el inventario del panel: «que el QA SIEMPRE pueda coger el locator».
 *
 * Estos tests protegen la doctrina, no el formato: el panel NO decide cuál es
 * el elemento correcto (eso es del QA), pero tiene prohibido dejarle elegir a
 * ciegas. Y protegen la regla que el ciclo de Tricentis escribió con dato: ante
 * un control oculto tras una fachada, se propone el CONTROL VISIBLE — un clic
 * sobre el nativo escondido deja el radio marcado a la vista sin disparar el
 * binding, y el test se pondría verde habiendo probado nada.
 */
import { describe, it, expect } from 'vitest';
import {
  filaDelInventario,
  semaforos,
  proponerObjetivo,
  ordenarInventario,
  type ElementoInventario,
} from '../src/walk-core.ts';

const base: ElementoInventario = { ref: 0, role: 'button', visible: true, locator: "getByRole('button')", estable: true };
const el = (o: Partial<ElementoInventario>): ElementoInventario => ({ ...base, ...o });

describe('filaDelInventario — el QA lee, no inspecciona', () => {
  it('un elemento con nombre se enseña por su nombre', () => {
    expect(filaDelInventario(el({ role: 'checkbox', name: 'Speeding' }))).toContain('«Speeding»');
  });

  it('SIN nombre no se descarta: se ancla al texto visible de al lado', () => {
    // Es el caso que D81 existe para rescatar: `nombresDePantalla` hacía
    // `if (!el.name) continue`, así que el QA jamás veía este elemento.
    const fila = filaDelInventario(el({ role: 'textbox', cerca: 'Engine Performance [kW]' }));
    expect(fila).toContain('sin nombre');
    expect(fila).toContain('Engine Performance [kW]');
  });

  it('un oculto CON control visible lo dice, y dice que hay salida', () => {
    const fila = filaDelInventario(
      el({ role: 'radio', name: 'Male', visible: false, motivo_oculto: 'fuera-de-pantalla', proxy: { ref: 9, via: 'label', locator: "getByText('Male')" } }),
    );
    expect(fila).toContain('fuera de pantalla');
    expect(fila).toContain('su control visible sí se pulsa');
  });

  it('un oculto SIN salida no la promete', () => {
    const fila = filaDelInventario(el({ role: 'radio', name: 'Male', visible: false, motivo_oculto: 'display-none' }));
    expect(fila).toContain('no renderizado');
    expect(fila).not.toContain('sí se pulsa');
  });

  it('jamás enseña jerga: ni CSS, ni Playwright, ni el locator', () => {
    const fila = filaDelInventario(el({ role: 'radio', name: 'Male', visible: false, motivo_oculto: 'fuera-de-pantalla', locator: 'css=#gendermale' }));
    expect(fila).not.toContain('css=');
    expect(fila).not.toContain('getByRole');
    expect(fila).not.toContain('#gendermale');
  });
});

describe('semaforos — las tres cosas que el panel SÍ sabe', () => {
  it('único, accionable y estable: los tres en verde', () => {
    const s = semaforos({ coincidencias: 1, accionable: true, estable: true, porQueEstable: 'id estable' });
    expect([s.encuentro.ok, s.acciono.ok, s.dura.ok]).toEqual([true, true, true]);
    expect(s.dura.texto).toContain('id estable');
  });

  it('varios candidatos no es «lo encontré»: pide acotar', () => {
    const s = semaforos({ coincidencias: 3, accionable: true, estable: true });
    expect(s.encuentro.ok).toBe(false);
    expect(s.encuentro.texto).toContain('3 candidatos');
  });

  it('resuelve pero NO se acciona: el caso de Tricentis, y nombra la salida', () => {
    const s = semaforos({ coincidencias: 1, accionable: false, motivoNoAccionable: 'fuera-de-pantalla', hayProxy: true, estable: true });
    expect(s.encuentro.ok).toBe(true);
    expect(s.acciono.ok).toBe(false);
    expect(s.acciono.texto).toContain('su control visible sí');
  });

  it('sin proxy, lo dice en vez de insinuar que hay salida', () => {
    const s = semaforos({ coincidencias: 1, accionable: false, motivoNoAccionable: 'display-none', hayProxy: false, estable: true });
    expect(s.acciono.texto).toContain('no encuentro control visible');
  });

  it('frágil avisa EN EL MOMENTO de que no se guardará', () => {
    // El estreno: getByRole('link').nth(8) enseñado 3 veces en RBP y promovido
    // cero, porque `aliasPromotionVerdict` tira lo frágil. El QA no lo supo
    // hasta el final; con esto lo sabe al elegir.
    const s = semaforos({ coincidencias: 1, accionable: true, estable: false });
    expect(s.dura.ok).toBe(false);
    expect(s.dura.texto).toContain('NO entra en memoria durable');
    expect(s.dura.texto).toMatch(/acótalo/i);
  });
});

describe('proponerObjetivo — la regla de Tricentis, con dato detrás', () => {
  it('visible: se usa tal cual', () => {
    const p = proponerObjetivo(el({ locator: "getByRole('button', { name: 'Next' })" }));
    expect(p.esProxy).toBe(false);
    expect(p.locator).toContain('Next');
  });

  it('oculto CON proxy: se propone el CONTROL VISIBLE, jamás el input escondido', () => {
    const p = proponerObjetivo(
      el({ name: 'Male', visible: false, motivo_oculto: 'fuera-de-pantalla', locator: 'css=#gendermale', proxy: { ref: 9, via: 'envoltorio', locator: 'css=.ideal-radio' } }),
    );
    expect(p.esProxy).toBe(true);
    expect(p.locator).toBe('css=.ideal-radio');
    expect(p.locator).not.toContain('gendermale');
    expect(p.explicacion).toContain('pulsaría un usuario');
  });

  it('oculto SIN proxy: no se inventa una salida, se avisa', () => {
    const p = proponerObjetivo(el({ visible: false, motivo_oculto: 'display-none', locator: 'css=#x' }));
    expect(p.esProxy).toBe(false);
    expect(p.explicacion).toContain('no hay control visible');
  });
});

describe('ordenarInventario — lo que busca el QA, arriba', () => {
  const lista = [
    el({ ref: 0, role: 'link', name: 'Inicio' }),
    el({ ref: 1, role: 'radio', name: 'Male', visible: false, motivo_oculto: 'fuera-de-pantalla', proxy: { ref: 5, via: 'label', locator: 'x' } }),
    el({ ref: 2, role: 'radio', name: 'Female', visible: false, motivo_oculto: 'display-none' }),
    el({ ref: 3, role: 'button', name: 'Guardar' }),
  ];

  it('sin pedido: primero lo accionable, luego lo oculto con salida, al final lo perdido', () => {
    expect(ordenarInventario(lista).map((e) => e.ref)).toEqual([0, 3, 1, 2]);
  });

  it('con pedido, lo que se le parece manda aunque esté oculto', () => {
    expect(ordenarInventario(lista, 'Male')[0].ref).toBe(1);
  });

  it('el orden es estable: a igualdad de puntuación, el de la página primero', () => {
    const r = ordenarInventario(lista, 'no-existe-nada-asi').map((e) => e.ref);
    expect(r).toEqual([0, 3, 1, 2]);
  });
});
