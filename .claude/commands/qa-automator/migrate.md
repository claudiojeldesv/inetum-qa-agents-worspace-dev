---
description: Módulo de migración — convierte una suite legacy Selenium (Java/Python/JS) o UFT/QTP en una suite Playwright nueva generada por el motor del agente, con paridad de cobertura auditable (migration-map) y mejoras propuestas sobre los anti-patterns del legacy. Funcional desde v0.2.x.
argument-hint: "--legacy=<dir> --url=<URL> [--tech=selenium|uft|auto] [--style=<contract.yaml>]"
---

# /qa-automator:migrate

Módulo de **migración** del agente `ia4d-qa-automator`. Entrada = **suite legacy (Selenium o
UFT/QTP) + URL de staging**. Salida = una suite Playwright **nueva** (POM, locators semánticos,
A11y, trazabilidad `@criterion`) que cubre **todas las funcionalidades que la antigua verificaba**,
con un contrato de paridad auditable (`migration-map.json`) y las mejoras aplicadas documentadas.

**No es un transpilador.** El `ia4d-legacy-analyzer` extrae la *intención* de cada caso legacy al
mismo `criteria.json` que consumen S2/S3; a partir de ahí el motor validado genera contra el DOM
real (planner map-mode → POM scaffolder → Writer↔Reviewer). Los locators frágiles, sleeps y datos
hardcoded del legacy **no viajan**: se reemplazan por el estándar del Style Contract y quedan
reportados como mejoras. La regla de oro es **paridad**: ningún caso legacy se pierde en silencio —
termina cubierto, en drift reportado, o como decisión explícita del QA.

## Arguments

- `--legacy=<dir>` (obligatorio): raíz de la suite legacy (repo o carpeta exportada de UFT).
- `--url=<URL>` (obligatorio): staging donde vive la app HOY, en `config/allowed-targets.yaml`.
  La migración genera contra el DOM actual — si un caso legacy prueba algo que ya no existe, eso
  es drift y se reporta, no se replica a ciegas.
- `--tech=selenium|uft|auto` (opcional, default `auto`).
- `--style=<path>` (opcional): Style Contract del cliente. Si no existe aún, créalo antes con
  `/qa-automator:config` — la migración es el momento perfecto para fijar las convenciones nuevas.

## Procedure (los 5 actos)

### Acto 1 — Comprender

1. Invoca `ia4d-compliance-checker` con la URL y `config/allowed-targets.yaml`.
   - `block` → aborta (exit 2). `warn` → muestra y pregunta (ask-first).
2. Valida que `--legacy` existe y contiene una suite reconocible (`.java`/`.py`/`.js` con imports
   Selenium, o `.mts`/`.vbs`/object repositories UFT). Si no, aborta con diagnóstico.

**1.a — Namespace por sitio + limpieza:** idéntico a S2/S3 (`req-driven.md` paso 1.a): `<site-id>`
del basename del `--style`, `<workDir>=.work/<site-id>`, limpieza de `<workDir>` al arrancar,
`QA_WORK_DIR` exportado. La suite legacy (`--legacy`) es INPUT de solo lectura: **jamás se edita ni
se borra** — sigue siendo la red de seguridad del cliente hasta que apague el runner viejo.

### Acto 2 — Extraer la intención del legacy

3. Invoca `ia4d-legacy-analyzer` via Task tool:
   ```
   --legacy=<--legacy> --tech=<--tech> --target-url=<--url>
   --output=<workDir>/criteria.json
   --map-output=<workDir>/migration-map.json
   --notes-output=<workDir>/migration-notes.md
   ```
4. **Checkpoint de migración (ask-first, SIEMPRE).** Antes de generar nada, muestra al QA:
   - El inventario (`inventory` del map): archivos, casos, muertos.
   - Los criterios extraídos (RF-NNN ↔ caso legacy) y los `unmappable` con sus preguntas.
   - El resumen de mejoras por anti-pattern (sleeps, XPath frágiles, no-POM, asserts débiles,
     datos hardcoded, dependencias de orden) — qué va a cambiar y por qué.
   - Las redacciones PII (`pii_redaction.literals_found`) si las hubo.
   El QA confirma el alcance o resuelve las preguntas. Los criterios con open_questions **no se
   generan** (gate estándar, sin override). Registra al audit-log:
   `{ source: 'command', action: 'migration_scope_confirmed', metadata: { cases, mapped, unmappable, improvements } }`.

### Acto 3 — Mapear (contra el DOM actual)

5. Aplica el **mapeo planner POR FLUJO + guarda anti-fabricación 8.5** de
   [`req-driven.md`](req-driven.md) (Acto 2, pasos 8-8.5) sobre `brief.flows` del `criteria.json`.
6. Invoca `ia4d-discovery-analyzer` con los fragmentos + `--criteria=<workDir>/criteria.json` →
   `<workDir>/discovery-report.json` con `criteria_mapping`.
7. **Diff de drift** (determinístico, paso 9.b de `req-driven.md`) → `<workDir>/drift-report.json`.
   En migración el drift tiene un significado extra: un caso legacy cuyo flujo ya no mapea en el DOM
   actual probablemente prueba **funcionalidad retirada** — el runner viejo llevaba tiempo en verde
   falso o en rojo ignorado. Es un hallazgo de valor para el cliente, repórtalo como tal.

### Acto 4 — Materializar la suite nueva

8. POM scaffolder + auth setup + Writer↔Reviewer + a11y-injector + consolidación: **idéntico a S2**
   (`req-driven.md` Actos 3-4, pasos 11-14.b), incluyendo la parameterización de los criterios con
   `examples` (casos legacy duplicados por datos → un test data-driven). El `@criterion` de cada
   spec cita `RF-NNN (<legacy_ref>)` — la trazabilidad apunta al caso legacy de origen.

### Acto 5 — Juzgar + paridad

9. Judge opcional off por defecto (`QA_ENABLE_JUDGE`); verification `npx playwright test
   tests/e2e/<site-id>/` con las env-vars estándar (ver `req-driven.md` "Verification step").
10. **Parity check (determinístico, en el command — no LLM).** Cruza `migration-map.json` con los
    specs generados y el drift-report; escribe `<workDir>/migration-report.json`:
    - `covered`: caso legacy → RF → spec generado (+ resultado del run).
    - `drift`: caso legacy cuyo flujo no existe en el DOM actual (funcionalidad retirada — decisión QA).
    - `blocked`: caso legacy con open_question sin resolver (no se fabricó).
    - `pending_decision`: los `unmappable` del analyzer.
    **Regla de paridad**: `covered + drift + blocked + pending_decision == inventory.cases_found`.
    Si la suma no cuadra, el run NO se da por bueno — hay un caso perdido en silencio; encuéntralo.
11. Escribe el baseline para el futuro: copia `<workDir>/criteria.json` →
    `config/criteria-baseline/<site-id>.json`. A partir de aquí el cliente evoluciona la suite
    migrada con `/qa-automator:incremental`, no con re-migraciones.
12. Genera `<workDir>/qa-automator-run-summary.json` con: paridad (los 4 cubos y la suma), mejoras
    aplicadas por spec (del catálogo del analyzer), drift, y la recomendación de mantener la suite
    legacy congelada (no borrada) hasta que el cliente valide la nueva en su CI.

## Outputs (consolidados)

- `<workDir>/criteria.json` — la intención del legacy en el contrato estándar
- `<workDir>/migration-map.json` — el contrato de paridad (caso legacy ↔ RF ↔ estado)
- `<workDir>/migration-notes.md` — inventario + anti-patterns + preguntas (sign-off del QA)
- `<workDir>/migration-report.json` — paridad final: covered / drift / blocked / pending_decision
- Suite nueva: `tests/{e2e,pages,components}/<site-id>/` con `@criterion RF-NNN (<legacy_ref>)`
- `config/criteria-baseline/<site-id>.json` — habilita `/qa-automator:incremental` desde el día 1
- `<workDir>/drift-report.json`, `<workDir>/review-feedback.json`, `<workDir>/audit-log.json`

## Hard rules

- **Paridad o reporte**: cada caso del inventario termina `covered`, `drift`, `blocked` o
  `pending_decision`. La suma debe cuadrar (paso 10). Nada se pierde en silencio.
- **La suite legacy es solo-lectura.** No se edita, no se borra, no se "arregla". Se recomienda
  congelarla, no retirarla — esa decisión es del cliente, con la nueva suite verde en su CI.
- **No transpilar**: locators, sleeps y datos del legacy no viajan al spec nuevo. La intención sí.
  Las mejoras cambian el CÓMO se verifica, nunca el QUÉ (scope idéntico al legacy; las coberturas
  nuevas que el analyzer eche en falta van a `migration-notes.md` como recomendación).
- **No fabricar**: caso legacy sin aserción → `[AMBIGUO]` + pregunta, no un `then` inventado.
  Flujo legacy ausente del DOM → drift reportado, no un test que "pasa" contra nada.
- PII del legacy: redactada y reportada; fixtures solo del `synthetic_fixtures` del contract.
- Gates estándar sin cambios: compliance pre-flight sin override, Writer+Reviewer obligatorios,
  Judge off por defecto, checkpoint del Acto 2 siempre ask-first.
- Cada paso registra al audit-log (`migration_scope_confirmed`, `drift_detected`, `parity_check`...).

## Reference

- [`.claude/agents/ia4d-legacy-analyzer.md`](../../agents/ia4d-legacy-analyzer.md) — el extractor de intención + schema del migration-map
- [`docs/references/fd-criteria-schema.md`](../../../docs/references/fd-criteria-schema.md) — contrato de `criteria.json`
- [`.claude/commands/qa-automator/req-driven.md`](req-driven.md) — Actos 2-4 que la migración reusa (mapeo por-flujo, guarda 8.5, Writer, drift)
- [`.claude/commands/qa-automator/incremental.md`](incremental.md) — cómo evoluciona la suite migrada a partir de aquí
