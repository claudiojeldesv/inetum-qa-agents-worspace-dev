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
2. Locator XPath.
3. `page.waitForTimeout(...)`.
4. Assert que solo verifica navegación (URL change) sin verificar contenido funcional.
5. Falta de `AxeBuilder({ page }).analyze()` check al inicio del `test()`.
6. JSDoc sin cita del criterio del plan (`/** @criterion ... */` o equivalente declarado en Style Contract).
7. Uso de datos PII potencialmente reales (DNI/IBAN/email dominio real fuera de allowlist).
8. Estado compartido entre tests (sin `test.afterEach` cuando hay setup).

## Criterios should-fix (no bloquean pero el Writer debe corregir si puede)

1. Locator `getByRole` cuando hay `data-test` disponible.
2. Asserts redundantes.
3. POM no usado (lógica de página inline en el test).
4. Naming no semántico del test (e.g. "test 1").

## Cuándo el Reviewer aprueba con must-fix sin resolver

Solo si la iteración 2 ya intentó corregir y persiste. En ese caso:
- `verdict: 'rejected'`
- `result: 'iteration_2_exhausted'` en audit-log
- El command escala al SDET con flag `reviewer_unresolved: true` + el feedback completo.
- El test pasa al Judge igualmente, pero con score reducido por el campo `reviewer_unresolved`.

## Output

`review-feedback.json` (un archivo por sesión, todas las revisiones consolidadas):

```jsonl
{"test_file":"login.happy-path.spec.ts","iteration":0,"verdict":"rejected","feedback":[...],"timestamp":"..."}
{"test_file":"login.happy-path.spec.ts","iteration":1,"verdict":"approved","feedback":[],"timestamp":"..."}
{"test_file":"cart.add-item.spec.ts","iteration":0,"verdict":"approved","feedback":[],"timestamp":"..."}
```
