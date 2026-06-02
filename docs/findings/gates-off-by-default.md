# Cambio de diseño: gates off por defecto (`design/gates-off-by-default`)

Branch: `design/gates-off-by-default` (desde `ia4d-qa-automator`). Commit del cambio: `0587821`.

## Qué se hizo y por qué

Las tres validaciones `ia4d-pii-scanner`, `ia4d-judge` y el **gate** de `ia4d-a11y-injector` pasan a
estar **apagadas por defecto pero reactivables** — NO eliminadas. Las piezas siguen completas en el
repo. Motivo (SDET): simplificar el diseño y ganar velocidad de iteración. Es un cambio de diseño
permanente, decidido por el dueño del producto, que invierte las hard rules previas #3 y #8 y matiza
el posicionamiento regulado. Se documentó el cambio tanto en código como en la doc normativa para que
no queden contradiciéndose.

Lo que **NO** se tocó: compliance pre-flight (sigue sin override), Writer+Reviewer (núcleo del Quality
layer, obligatorios), el **scan** de a11y (AxeBuilder siempre se inyecta — solo se apagó el gate que
aborta), y la guarda anti-`test.fixme()` del Healer (vive en el mismo hook que PII pero no es PII →
corre siempre, independiente del toggle).

## Mecanismo (reactivación)

| Validación | Off por defecto | Reactivar | Dónde vive el control |
|---|---|---|---|
| PII scanner | sí | `QA_ENABLE_PII=1` | env-var leída por `hooks/pii-post.ts` (determinístico) |
| Judge (Acto 5) | sí | `QA_ENABLE_JUDGE=1` | instrucción condicional en los 3 commands (orquestador) |
| Gate a11y | sí (warning) | `fail_on_violations: true` | campo por-sitio del Style Contract |

Dos mecanismos distintos a propósito: PII/Judge por env-var (toggle global reversible); a11y reusa el
flag por-sitio que ya existía desde Fase C (decisión: no construir maquinaria nueva para a11y). El
scan de a11y se sigue inyectando siempre; lo apagado es solo el `expect(...).toEqual([])` que aborta.

## Archivos cambiados (commit `0587821`, 11 archivos)

Código:
- `hooks/pii-post.ts` — scan PII gateado por `QA_ENABLE_PII`; allowlist solo se carga si está on; la
  guarda anti-`test.fixme()` corre siempre. Audit-log registra `action: 'skip'` cuando PII off.
- `src/audit-log.ts` — añadido `'skip'` al union `AuditAction`.

Orquestación (los 3 commands S2/S3/S4):
- `.claude/commands/qa-automator/{autonomous,req-driven,spec-refiner}.md` — Acto 5 (Judge) condicional
  a `QA_ENABLE_JUDGE`; si off → omitir + audit `skip`; hard rules y verification step actualizados
  (Writer+Reviewer siguen obligatorios).

Agentes y contrato:
- `.claude/agents/ia4d-a11y-injector.md` — default de `fail_on_violations` a `false` (warning).
- `.claude/agents/ia4d-judge.md` — documentado como off por defecto, reactivable.
- `style-contracts/saucedemo.yaml` — `fail_on_violations: false` (parabank ya estaba en false).
- `references/style-contract-schema.md` — default documentado a `false`.

Doc normativa:
- `SPEC.md` §3/§6 — PII y Judge opcionales off por defecto; compliance pre-flight sin override intacto.
- `CLAUDE.md` — reglas duras #3/#8 acotadas + nueva regla #10 (gates opcionales reactivables) + línea
  en "Estado actual".

## Verificación

**Determinística (hook PII, 3/3):**
- PII off (default) + DNI/IBAN no sintéticos → exit 0 (no bloquea).
- `QA_ENABLE_PII=1` → exit 2, bloquea DNI (P1) e IBAN (P2/P5). Reversible.
- `test.fixme()` no autorizado con PII off → exit 2 (la guarda del Healer no depende del toggle).

**En vivo (S4 autonomous contra ParaBank, scope `login`, gates off):**
- mode-router → S4 functional; compliance → warn W1 (parabank permitido, sin prefijo non-prod).
- Planner (nativo) + discovery-analyzer + POM scaffolder + Writer↔Reviewer (aprobado iteración 1).
- **Judge skipped** (`QA_ENABLE_JUDGE` unset): no se generó `judge-report.json`; audit-log registra
  `{ action: 'skip', rule: 'judge' }`.
- **a11y warning** (`fail_on_violations: false`): AxeBuilder inyectado, violaciones a
  `test.info().annotations`, sin abort (gate_mode reportado: `warning`).
- **PII off**: la escritura de specs no se bloqueó.
- `npx playwright test` → **1 passed (18.2s)**, verde.
- Nota: para el test de login se usó contexto fresco (se omitió `auth.setup`) — heredar un
  `storageState` ya autenticado contradice probar el login. Se comentó `QA_STORAGE_STATE` del `.env`
  para el run y se restauró después.

## Estado del branch al cierre

- Commit `0587821`: los 11 archivos del toggle.
- Outputs del run de verificación: borrados; suite parabank de HEAD restaurada intacta.
- Pendiente preexistente (NO de esta sesión, no commiteado): `playwright.config.ts` (cargador `.env`),
  `tests/e2e/login.spec.ts` (M), deletes de `auth.setup/logout/transfer-funds.spec.ts`, `.env`
  (untracked). Queda a decisión del SDET qué hacer con esto.
