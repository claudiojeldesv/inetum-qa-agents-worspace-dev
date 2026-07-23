# H1 — dom-walker: Acto 2 determinístico (edición Copilot)

**Estado**: NÚCLEO CONSTRUIDO Y VALIDADO (2026-07-18, commit `772c268`). Quedan los flecos listados al final antes de declarar el gate cerrado.

## Qué se construyó

`copilot/src/{walk-types,walk-core,dom-walker}.ts` (~900 líneas + 26 unit tests). Sustituye a planner+discovery del spike (los dos actos más caros en créditos) por Playwright puro guiado por un `walk-script.json` — el guion de pasos que en H2 emitirá el `ia4d-spec-refiner` desde el FD; en H1 se autora a mano como fixture (`copilot/fixtures/{saucedemo,orangehrm}.walk.json`).

- `walk-core.ts`: funciones puras (resolución de fixtures `$fixtures.*`, plan de intentos por prioridad del contract, poda/dedupe/cap, naming, validación del guion, hash de reanudación, poda del snapshot ARIA para rescates). Todo unit-testeable sin navegador.
- `dom-walker.ts`: driver + CLI. Resolución de hints en orden `locators.priority` del style contract (test-id → role+name → label → text), captura por-frame, checkpoint reanudable, protocolo de rescate.

## Evidencia de los requisitos duros

| Requisito | Evidencia |
|---|---|
| (a) iframes | Fixture local con form de pago embebido: elementos y forms con `frame_path: ["iframe[name=\"pago\"]"]`, fill+click resueltos dentro del frame |
| (b) poda determinística | Dedupe con `count`, orden estable, cap por pantalla con `truncated` explícito (OrangeHRM PIM: 60 el + `truncated: 124`). Dos runs SauceDemo = dom-map idéntico módulo `generated_at` |
| (c) rescate LLM acotado | Hint irresoluble → `rescue-request.json` (snapshot ARIA podado) + exit 42 + checkpoint. Respuesta → replay + aplicación; `locator` inválido o `null` → `open_questions` (nunca `.first()` a ciegas sobre ambiguos). Presupuesto (`--rescue-budget`/`QA_RESCUE_BUDGET`, default 3) contado; budget 0 → bloqueo directo sin pedir rescate. Todo en `audit-log.json` (`llm_call:rescue-request`, `allow/block:rescue-response`) |
| (d) waits/dialogs | Transición SPA por cambio de URL (en OrangeHRM `domcontentloaded` ya disparó — hallazgo del run); `networkidle` acotado con catch; diálogos registrados en `screen.dialogs` y cerrados de forma determinista |

## Runs de validación

| Run | Resultado |
|---|---|
| SauceDemo (2 flujos, 16 pasos, compra completa hasta "Thank you for your order!") | 7 pantallas, 16/16, 0 rescates, 0 bloqueados. **Determinismo: `true`** (diff de dos runs) |
| OrangeHRM SPA (login + navegación Admin/PIM/Time) | 5 pantallas, 7/7, 0 rescates. Sesión persiste entre flujos (flujo 2 entra por entry y la app redirige a dashboard ya autenticada) |
| OrangeHRM con `QA_STORAGE_STATE` (patrón auth-handler Fase C, guion SIN pasos de login) | dashboard+admin, 2/2, 0 bloqueados |
| Rescate (hint fabricado "Entrar al sistema" contra SauceDemo) | exit 42 → respuesta `getByTestId('login-button')` → reanuda, replay, 3/3, `rescues_used: 1` |
| Budget agotado (`--rescue-budget=0`) | paso a `open_questions` con razón explícita, sin request |

## Decisiones de diseño que H2 debe respetar

1. **El rescate es handoff por archivos, no llamada API**: el walker no habla con ningún LLM. Escribe `rescue-request.json` y sale con **exit 42**; el orquestador (prompt file) delega la micro-llamada a Haiku, el subagent escribe `rescue-response.json`, y re-ejecutar el walker reanuda. Coherente con "todo el estado en archivos".
2. **Reanudación = replay del flujo en curso**: proceso de navegador nuevo no conserva estado in-page. Los flujos 100% completados se saltan (sesión restaurada de `walk-session.json`, que se persiste en cada checkpoint); el flujo a medias se re-ejecuta desde entry, saltando pasos bloqueados y reutilizando rescates ya resueltos sin gastar presupuesto.
3. **Ambiguo ≠ adivinable**: >1 match visible tras todos los intentos del plan → rescate o bloqueo. `.first()` solo sobre locators que devolvió el LLM de rescate (decisión ya auditada).
4. **`testid_attribute` autodetectado** en la primera captura (SauceDemo → `data-test`, OrangeHRM → sin test-ids → default) y persistido en el estado; override por `--testid-attr`.
5. El dom-map alimenta directamente el schema del `pom-scaffolder` (elements con `role/name/test_id/label`, forms, components por dedupe).

## Flecos antes de cerrar el gate H1

- OrangeHRM "completo": el guion actual navega 3 módulos; falta un guion con forms reales (add employee o similar) para dom-map "completo" en sitio SPA.
- Dialogs nativos: implementados y deterministas, sin caso live que los dispare (SauceDemo/OrangeHRM no usan `confirm/alert`).
- El compliance pre-flight NO está dentro del walker: corre en Acto 1 (hook + runner de H2). El walker asume URL ya validada — el runner debe garantizarlo.
- `screen:` con nombre repetido en flujos distintos sobreescribe la captura (así se dedupea dashboard); si dos pantallas distintas colisionan de nombre, el guion debe desambiguar. Documentar en el prompt del refiner (H2).
