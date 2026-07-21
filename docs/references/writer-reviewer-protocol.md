# Writer ↔ Reviewer protocol

Documentación del ping-pong entre `ia4d-writer` e `ia4d-reviewer`. Excepción nombrada a la regla "subagents no se invocan entre sí" (ver [`composition-rules.md`](composition-rules.md)).

## Estado de la iteración

```typescript
interface ReviewState {
  test_file: string;            // path al .spec.ts en revisión
  iteration: 0 | 1 | 2;         // 0 = primera escritura, 1-2 = correcciones
  verdict: 'pending' | 'approved' | 'rejected';
  feedback: ReviewFeedback[];
  history: Array<{ iteration: number; verdict: string; feedback_summary: string }>;
}

interface ReviewFeedback {
  category:
    | 'locator-strategy'        // selector no semántico, CSS bruto, xpath
    | 'assert-quality'          // assert trivial, sin valor de verificación
    | 'wait-strategy'           // waitForTimeout, sleep hardcoded
    | 'pom-violation'           // lógica de página fuera del POM
    | 'style-contract'          // viola alguna regla del style-contract.yaml
    | 'a11y-missing'            // falta AxeBuilder check
    | 'criterion-not-cited'     // JSDoc no cita criterio fuente
    | 'data-contamination';     // datos no sintéticos en el test
  severity: 'must-fix' | 'should-fix' | 'nit';
  location: { line: number; column?: number };
  description: string;
  suggested_fix?: string;
}
```

## Flujo

```
┌─────────────────────────────────────────────────────────────┐
│ Iteration 0: Writer genera .spec.ts inicial                 │
│   - Lee plan + Style Contract + POM scaffolded              │
│   - Escribe test                                            │
│   - Escribe audit-log entry                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Writer invoca Reviewer vía Task tool                        │
│   - Pasa: .spec.ts + plan + style-contract.yaml             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ Reviewer audita                                             │
│   - Aplica criterios objetivos (locators, asserts, etc.)    │
│   - Si NINGÚN must-fix → verdict: 'approved'                │
│   - Si HAY must-fix → verdict: 'rejected', feedback[]       │
│   - Escribe review-feedback.json (snapshot por iteración)   │
│   - Escribe audit-log entry                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
            approved              rejected
                │                   │
                ▼                   ▼
         END (verdict)      Iteration N+1
                            (max N=2)
                                    │
                          ┌─────────┴─────────┐
                          │ N=3? (límite)     │
                          │   YES → escalate  │
                          │   NO  → Writer    │
                          │          ajusta   │
                          └───────────────────┘
```

## Criterios de aprobación del Reviewer (must-fix)

Un test se rechaza (`rejected`) si tiene **cualquiera** de:

1. Locator CSS bruto sin `data-test` ni `getByRole`/`getByLabel`/`getByText` justificado.
   - **Excepción legacy (v0.2 Fase C)**: un selector de atributo acotado (`[name="..."]` / `#id`) taggeado `// css-fallback:` NO es violación si el contract declara ese atributo en `locators.css_fallback_attributes` y no existe locator semántico para ese elemento en discovery. Selectores de clase, descendiente o tag+class siguen siendo violación siempre.
2. Locator XPath.
3. `page.waitForTimeout(...)`.
4. Assert que solo verifica navegación (URL change) sin verificar contenido funcional.
5. Falta de `AxeBuilder({ page }).analyze()` check al inicio del `test()`.
6. JSDoc sin cita del criterio del plan (`/** @criterion ... */` o equivalente declarado en Style Contract).
7. Uso de datos PII potencialmente reales (DNI/IBAN/email dominio real fuera de allowlist).
8. Estado compartido entre tests (sin `test.afterEach` cuando hay setup).
9. **(MF-9, condicional)** Test sin post-condición de negocio cuando el Style Contract declara
   `test_design.require_business_postcondition: true`. Extiende el punto 4: un test cuyos únicos
   asserts son navegación/URL/visibilidad de chrome se rechaza; debe afirmar el *resultado* del flujo
   (p.ej. número de pedido tras checkout, elemento solo-autenticado tras login), y al menos
   `test_design.min_functional_asserts` asserts funcionales. Sin bloque `test_design` → no aplica.

## Criterios should-fix (no bloquean pero el Writer debe corregir si puede)

1. Locator `getByRole` cuando hay `data-test` disponible.
2. Asserts redundantes.
3. POM no usado (lógica de página inline en el test).
4. Naming no semántico del test (e.g. "test 1").

## Cuándo el Reviewer aprueba con must-fix sin resolver

Solo si la iteración 2 ya intentó corregir y persiste. En ese caso:
- `verdict: 'rejected'`
- `result: 'iteration_2_exhausted'` en audit-log
- El command escala al QA con flag `reviewer_unresolved: true` + el feedback completo.
- El test pasa al Judge igualmente, pero con score reducido por el campo `reviewer_unresolved`.

## Notas de diseño del Writer (justificación de reglas que el prompt enuncia escuetas)

Desplazadas de `ia4d-writer.md` en la Fase 2 token-efficiency (2026-07); el prompt conserva la regla,
aquí vive el porqué:

- **Naming sin naturaleza**: el título describe la condición probada y el resultado esperado
  (`{condicion} → {resultado}`). "Happy path" es el default implícito — nombrarlo no añade información
  y contamina títulos/slugs; la única naturaleza marcada es el tag `@negative`.
- **Tags exactamente como llegan**: la taxonomía la decidió el discovery-analyzer y la confirmó el QA
  en el checkpoint. Si el Writer inventara o quitara tags, rompería la trazabilidad de la selección.
- **`--tc-id` no construye el filename**: el command ya resolvió el ID contra el `tc_registry` y
  construyó el `--output`; el Writer solo lo cita en el JSDoc. Separación: el registro es del command.
- **Scan a11y siempre, gate off por defecto**: la evidencia (annotations) es auditable sin abortar el
  run; el assert que rompe es opt-in por contract (regla #10). Misma semántica que `ia4d-a11y-injector`
  (hoy rescate).
- **Evidencia por niveles**: `minimal` es cero-regresión respecto a specs históricos; `steps`/`full`
  solo envuelven — nunca cambian locators, asserts ni citas. `full` añade el screenshot al final de
  cada step para que Allure lo muestre bajo el step; el viewport (no `fullPage`) mantiene el reporte
  ligero, y el command complementa con `QA_SCREENSHOT=on QA_TRACE=on`.
- **Parameterización S2**: los valores de ejemplo salen SOLO de `examples.rows` del `criteria.json` —
  añadir filas sería fabricar cobertura. Una fila con PII real ya viene flaggeada por el parser
  (`pii_redaction`); se sustituye por `synthetic_fixtures`, nunca se reproduce el literal.
- **Auth setup sin AxeBuilder**: `auth.setup.ts` es un setup project, no un test del flujo — el scan
  a11y pertenece a los tests, no al login técnico.

## Output

`review-feedback.json` (un archivo por sesión, todas las revisiones consolidadas):

```jsonl
{"test_file":"login.happy-path.spec.ts","iteration":0,"verdict":"rejected","feedback":[...],"timestamp":"..."}
{"test_file":"login.happy-path.spec.ts","iteration":1,"verdict":"approved","feedback":[],"timestamp":"..."}
{"test_file":"cart.add-item.spec.ts","iteration":0,"verdict":"approved","feedback":[],"timestamp":"..."}
```
