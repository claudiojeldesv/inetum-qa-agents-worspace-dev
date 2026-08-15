import { describe, it, expect } from 'vitest';
import { clasificar } from '../src/rescue-bench.ts';

/**
 * El clasificador es lo único que decide si el banco de rescates mide algo, y por
 * eso está puro y aparte del navegador. La tentación era medir "tasa de acierto";
 * con el corpus real delante se ve por qué no sirve: CUATRO de siete casos que el
 * walker bloquea no tienen respuesta única (tres etiquetas idénticas, tres botones
 * idénticos, tres campos 'Email'), y ahí declinar es acertar.
 */
describe('banco de rescates — la taxonomía distingue declinar bien de declinar mal', () => {
  it('declinar donde no había respuesta única es un ACIERTO del protocolo, no un fallo', () => {
    expect(clasificar('declinar', false, null)).toBe('planta-correcta');
  });

  it('declinar donde SÍ había respuesta es lo que hay que perseguir', () => {
    expect(clasificar('resoluble', false, null)).toBe('planta-cobarde');
  });

  it('resolver al elemento marcado por una persona es acierto', () => {
    expect(clasificar('resoluble', true, true)).toBe('acierto');
  });

  it('resolver a OTRO elemento es EQUIVOCADO: el fallo mudo, la métrica que manda', () => {
    expect(clasificar('resoluble', true, false)).toBe('EQUIVOCADO');
  });

  it('elegir donde no había a quién elegir también es EQUIVOCADO, no un acierto por suerte', () => {
    // en un control la respuesta correcta es declinar; comprometerse con uno de
    // los tres candidatos idénticos es exactamente la conducta prohibida, aunque
    // el elemento elegido resulte ser "razonable"
    expect(clasificar('declinar', true, true)).toBe('EQUIVOCADO');
    expect(clasificar('declinar', true, false)).toBe('EQUIVOCADO');
  });
});
