/**
 * D71 — el viewport declarado, y la nota que distingue layout de drift.
 *
 * El defecto se midió en EspoCRM (ciclo E2E en terreno virgen III): el enlace
 * 'Cuentas' del menú lateral NUNCA es visible a 1280×720 —existe en el DOM,
 * oculto— y aparece a los 1553 ms a 1400×900. Ninguna capa declaraba el viewport,
 * así que los tres ciclos corrieron con el default de Playwright sin saberlo.
 */
import { describe, it, expect } from 'vitest';
import { resolveViewport, notaTextoOculto } from '../src/walk-core.ts';

describe('resolveViewport — precedencia CLI > contract > default de Playwright', () => {
  it('sin CLI ni contract devuelve null: NO se inventa un default propio', () => {
    // Inventarlo movería en silencio la línea base de todas las mediciones
    // anteriores, que es exactamente el error que D71 documenta.
    expect(resolveViewport({})).toBeNull();
    expect(resolveViewport({ contract: null })).toBeNull();
  });

  it('el contract declara el viewport del sitio', () => {
    expect(resolveViewport({ contract: { width: 1400, height: 900 } })).toEqual({ width: 1400, height: 900 });
  });

  it('la CLI gana al contract', () => {
    expect(resolveViewport({ cli: '1600x1000', contract: { width: 1400, height: 900 } })).toEqual({
      width: 1600,
      height: 1000,
    });
  });

  it('acepta las tres formas de separador y espacios', () => {
    expect(resolveViewport({ cli: '1400x900' })).toEqual({ width: 1400, height: 900 });
    expect(resolveViewport({ cli: '1400X900' })).toEqual({ width: 1400, height: 900 });
    expect(resolveViewport({ cli: ' 1400 × 900 ' })).toEqual({ width: 1400, height: 900 });
  });

  it('un viewport mal escrito revienta en la puerta, no a mitad de run', () => {
    expect(() => resolveViewport({ cli: '1400' })).toThrow(/viewport inválido/);
    expect(() => resolveViewport({ cli: 'ancho x alto' })).toThrow(/viewport inválido/);
  });

  it('un contract con medidas absurdas se ignora en vez de romper el run', () => {
    expect(resolveViewport({ contract: { width: 0, height: 900 } })).toBeNull();
  });
});

describe('notaTextoOculto — layout no es drift del negocio', () => {
  it('sin nodos ocultos no dice nada: el hallazgo es del negocio y se respeta', () => {
    expect(notaTextoOculto({ nodosOcultos: 0, viewport: { width: 1400, height: 900 } })).toBe('');
  });

  it('con un nodo oculto nombra el viewport declarado y apunta a la maqueta', () => {
    const nota = notaTextoOculto({ nodosOcultos: 1, viewport: { width: 1280, height: 720 } });
    expect(nota).toContain('1 nodo');
    expect(nota).toContain('OCULTO');
    expect(nota).toContain('1280×720');
    expect(nota).toContain('layout, no drift');
  });

  it('sin viewport declarado DICE que es el default no declarado (el caso de D71)', () => {
    const nota = notaTextoOculto({ nodosOcultos: 2, viewport: null });
    expect(nota).toContain('2 nodos');
    expect(nota).toContain('no declarado');
  });
});
