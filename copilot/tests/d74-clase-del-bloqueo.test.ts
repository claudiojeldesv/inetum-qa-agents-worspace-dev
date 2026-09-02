/**
 * D74 — la clase del bloqueo es un CAMPO, no una deducción del texto.
 *
 * El defecto se midió en Restful Booker comparando dos runs del MISMO guion
 * sobre el MISMO sitio: la clase `panel` (ambigüedad/ámbito) cayó de 6 a 1 y
 * `rescate` subió de 3 a 11. No cambió el sitio: cambió el texto.
 *
 * Y al leer el camino real apareció un matiz que corrige el diagnóstico
 * original —y que estos tests fijan para que no se vuelva a colar—: **no es que
 * el `reason` se sobrescriba**. Es que con presupuesto de rescate el PRIMER
 * bloqueo ya llega con el desenlace de la llamada («rescate LLM respondió
 * locator=null»), así que la ambigüedad original nunca se escribe. Clasificar
 * leyendo el texto la perdería exactamente igual. De ahí que la clase se decida
 * con el estado OBSERVADO por el motor y no con una expresión regular.
 */
import { describe, it, expect } from 'vitest';
import { clasificarBloqueo } from '../src/walk-core.ts';

const AMBIGUO = "getByRole('link', { name: 'Contact' }) matchea VARIOS elementos visibles";
const AMBITO = 'el hint NO está dentro del ámbito {"text":"Single"}, pero sí aparece 3 veces fuera';
const DESENLACE_RESCATE = 'rescate LLM respondió locator=null: elemento no presente en el snapshot';

describe('clasificarBloqueo — el estado observado manda sobre el texto', () => {
  it('EL CASO DEL DEFECTO: motivo con el desenlace del rescate y ambigüedad observada → panel', () => {
    // Sin el estado observado esto caería en 'rescate' (el texto no dice nada de
    // ambigüedad) y volveríamos a contar 11 rescates donde había 6 ambigüedades.
    expect(
      clasificarBloqueo({ action: 'click', reason: DESENLACE_RESCATE, ambiguo: true, puertaBloqueada: null }),
    ).toBe('panel');
  });

  it('lo mismo con el ámbito fallido', () => {
    expect(
      clasificarBloqueo({ action: 'fill', reason: DESENLACE_RESCATE, fueraDeAmbito: true, puertaBloqueada: null }),
    ).toBe('panel');
  });

  it('sin estado observado cae al texto: el censo retroactivo sigue funcionando', () => {
    // Los runs viejos solo tienen prosa; esta función debe servir para ambos.
    expect(clasificarBloqueo({ action: 'click', reason: AMBIGUO, puertaBloqueada: null })).toBe('panel');
    expect(clasificarBloqueo({ action: 'fill', reason: AMBITO, puertaBloqueada: null })).toBe('panel');
  });

  it('la cascada gana a la ambigüedad: con la puerta cerrada, lo observado es de otra pantalla', () => {
    expect(
      clasificarBloqueo({ action: 'click', reason: DESENLACE_RESCATE, ambiguo: true, puertaBloqueada: 's4' }),
    ).toBe('cascada');
  });

  it('una postcondición es drift por su ACCIÓN, aunque el texto hable del rescate', () => {
    // Y aunque haya una puerta bloqueada por delante: falla el oráculo, no el
    // locator, y contarlo como cascada inflaría la cifra que decide el diseño.
    expect(
      clasificarBloqueo({ action: 'expect_text', reason: DESENLACE_RESCATE, puertaBloqueada: 's3' }),
    ).toBe('drift');
  });

  it('una acción rechazada con el locator YA resuelto no es rescate (familia D70)', () => {
    const r = "la acción 'check' falló sobre getByLabel('Male'): locator.check: Timeout";
    expect(clasificarBloqueo({ action: 'check', reason: r, puertaBloqueada: null })).toBe('accion');
    expect(clasificarBloqueo({ action: 'check', reason: r, puertaBloqueada: 's26' })).toBe('accion');
  });

  it('hint irresoluble limpio: la única clase que compra algo', () => {
    expect(
      clasificarBloqueo({ action: 'click', reason: 'hint irresoluble', ambiguo: false, puertaBloqueada: null }),
    ).toBe('rescate');
  });
});
