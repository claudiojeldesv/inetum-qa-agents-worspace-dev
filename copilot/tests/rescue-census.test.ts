/**
 * Fase 0 del plan del rescate en proceso — el censo de bloqueos.
 *
 * Lo que estos tests protegen no es un cálculo bonito: es que la cifra que va a
 * decidir el diseño (cuántos bloqueos son MATERIAL DE RESCATE de verdad) no se
 * infle. Medido en los tres ciclos E2E: de 39/64/18 «bloqueados» solo 3/2/7 lo
 * eran. Si `clasificar` se relaja, el censo justifica construir lo que no hace
 * falta.
 */
import { describe, it, expect } from 'vitest';
import { clasificar, censar } from '../src/rescue-census.ts';

const DRIFT = "drift: postcondición del FD no observada — texto 'Cuentas' no visible";
const ACCION =
  "la acción 'check' falló sobre getByLabel('Male'): locator.check: Timeout 10000ms exceeded. (<span class=\"ideal-radio\"></span> intercepts pointer events)";
const AMBIGUO =
  "getByRole('link', { name: 'Contact' }) matchea VARIOS elementos visibles: el hint designa a más de una cosa";
const AMBITO = 'el hint NO está dentro del ámbito {"text":"Single"}, pero sí aparece 3 veces fuera de él';
const IRRESOLUBLE = 'hint irresoluble y presupuesto de rescates agotado (0)';

describe('clasificar — las cinco familias, y solo una es material de rescate', () => {
  it('drift no es rescate ni aunque haya una puerta bloqueada antes', () => {
    // El locator no falló: falló el oráculo. Preguntarle a un LLM dónde está un
    // texto no hace que el texto esté. Y contarlo como cascada inflaría la cifra
    // que este censo existe para medir.
    expect(clasificar({ reason: DRIFT, puertaBloqueada: null }).familia).toBe('drift');
    expect(clasificar({ reason: DRIFT, puertaBloqueada: 's3' }).familia).toBe('drift');
  });

  it('una acción que falla con el locator YA resuelto no es rescate (familia D70)', () => {
    expect(clasificar({ reason: ACCION, puertaBloqueada: null }).familia).toBe('accion');
    expect(clasificar({ reason: ACCION, puertaBloqueada: 's26' }).familia).toBe('accion');
  });

  it('la cascada gana a la ambigüedad: con la puerta cerrada, lo observado es de otra pantalla', () => {
    const v = clasificar({ reason: AMBIGUO, puertaBloqueada: 's4' });
    expect(v.familia).toBe('cascada');
    expect(v.puerta).toBe('s4');
  });

  it('ambigüedad y ámbito van al panel del QA, no al LLM', () => {
    expect(clasificar({ reason: AMBIGUO, puertaBloqueada: null }).familia).toBe('panel');
    expect(clasificar({ reason: AMBITO, puertaBloqueada: null }).familia).toBe('panel');
  });

  it('solo el hint irresoluble limpio es rescate', () => {
    expect(clasificar({ reason: IRRESOLUBLE, puertaBloqueada: null }).familia).toBe('rescate');
  });
});

const guion = {
  site_id: 'demo',
  flows: [
    {
      flow: 'cp001',
      steps: [
        { id: 's1', action: 'goto' },
        { id: 's2', action: 'fill' },
        { id: 's3', action: 'click' }, // puerta
        { id: 's4', action: 'click' }, // puerta, adyacente a s3
        { id: 's5', action: 'expect_text' },
      ],
    },
  ],
};

describe('censar — capas y pares de puertas', () => {
  it('cuenta las capas: cada puerta bloqueada por delante es una pasada extra del modelo diferido', () => {
    const c = censar(
      {
        site_id: 'demo',
        open_questions: [
          { flow: 'cp001', step: 's3', action: 'click', reason: IRRESOLUBLE },
          { flow: 'cp001', step: 's4', action: 'click', reason: IRRESOLUBLE },
          { flow: 'cp001', step: 's5', action: 'expect_text', reason: IRRESOLUBLE },
        ],
      },
      guion,
    );
    expect(c.cascade_depth_max).toBe(2); // s5 tiene s3 y s4 por delante
    expect(c.familias.rescate).toBe(1); // solo s3: s4 y s5 están condenados
    expect(c.familias.cascada).toBe(2);
  });

  it('caza el par de puertas ADYACENTES bloqueadas — el caso «pulsar Aceptar / pulsar Cerrar»', () => {
    const c = censar(
      {
        site_id: 'demo',
        open_questions: [
          { flow: 'cp001', step: 's3', action: 'click', reason: IRRESOLUBLE },
          { flow: 'cp001', step: 's4', action: 'click', reason: IRRESOLUBLE },
        ],
      },
      guion,
    );
    expect(c.gate_pairs).toEqual([{ flow: 'cp001', a: 's3', b: 's4' }]);
    expect(c.puertas_bloqueadas).toBe(2);
  });

  it('dos puertas bloqueadas NO adyacentes no son un par', () => {
    const separado = {
      site_id: 'demo',
      flows: [
        {
          flow: 'cp001',
          steps: [
            { id: 's1', action: 'click' },
            { id: 's2', action: 'fill' },
            { id: 's3', action: 'click' },
          ],
        },
      ],
    };
    const c = censar(
      {
        site_id: 'demo',
        open_questions: [
          { flow: 'cp001', step: 's1', action: 'click', reason: IRRESOLUBLE },
          { flow: 'cp001', step: 's3', action: 'click', reason: IRRESOLUBLE },
        ],
      },
      separado,
    );
    expect(c.gate_pairs).toEqual([]);
    expect(c.cascade_depth_max).toBe(1);
  });

  it('delata la discrepancia cuando el walker escribió una cascada que el censo no ve', () => {
    // Comprobación cruzada: si mi recálculo y el walker no coinciden, el censo lo
    // dice. Un censo que se calla las discrepancias se está midiendo a sí mismo.
    const c = censar(
      {
        site_id: 'demo',
        open_questions: [
          {
            flow: 'cp001',
            step: 's5',
            action: 'expect_text',
            reason: 'hint irresoluble — en cascada de s9: la puerta que abría esta pantalla quedó bloqueada',
          },
        ],
      },
      guion,
    );
    expect(c.discrepancias).toHaveLength(1);
    expect(c.discrepancias[0].walker).toBe('cascada de s9');
  });

  it('un flujo que el guion no tiene no se adivina: se cuenta y se sigue', () => {
    const c = censar(
      { site_id: 'demo', open_questions: [{ flow: 'inexistente', step: 's1', action: 'click', reason: IRRESOLUBLE }] },
      guion,
    );
    expect(c.steps_blocked).toBe(1);
    expect(c.familias.rescate).toBe(1);
  });
});
