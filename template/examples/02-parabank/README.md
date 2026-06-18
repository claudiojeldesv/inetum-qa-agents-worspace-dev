# Lab 02 — ParaBank (auth persistente, drift y ambigüedad)

Lab avanzado. Sobre una banca demo con login real verás lo que SauceDemo no tiene: **sesión
persistente** (auth-setup + `storageState`), **detección de drift** entre la spec y lo que la app
expone, y **refinamiento de ambigüedad** (el agente marca los huecos en vez de adivinar). Es la
tesis del producto en acción: el agente no fabrica tests para lo que no existe.

## Objetivo

Al terminar sabrás:
- Generar tests sobre un sitio con **login persistente** sin race de sesión ni `--workers=1`.
- Leer un `drift-report.json`: spec que declara algo que la app no expone.
- Leer `refinement-questions.md`: criterio ambiguo que el agente **no** convierte en test.
- Materializar `Scenario Outline` + `Examples` como tests **data-driven** (S2).

## Duración y prerrequisitos

~25 min. Antes de empezar:
- Lab 01 completado (entiendes las tres puertas).
- `/qa-automator:healthcheck` en verde.
- ParaBank ya está permitido en `config/allowed-targets.yaml`; la cuenta de test (`john` / `demo`)
  declarada como test-cred.

## Escenario

[ParaBank](https://parabank.parasoft.com/parabank/index.htm) es un portal de banca demo de
Parasoft (JSP clásico, sin `data-test`). Tiene login, estado de sesión server-side y transferencias.
Dos rasgos lo hacen el caso avanzado:

1. **Mata el `JSESSIONID` server-side al hacer logout** — si un test de logout comparte el
   `storageState` con tests autenticados concurrentes, los envenena. El auth-handler lo resuelve
   con sesión aislada; `config/style-contracts/parabank.yaml` ya trae `auth:` configurado.
2. **Los inputs incluyen drift y ambigüedad deliberados** — para demostrar que el agente los
   detecta sin fabricar nada.

Inputs incluidos en esta carpeta:
- [`parabank.feature`](parabank.feature) — Gherkin con un `Scenario Outline` (transferencia,
  amounts 1 y 2) y un scenario `close-account` marcado `@drift-risk:high`. Input de **S2**.
- [`parabank-fd.md`](parabank-fd.md) — FD en prosa con ambigüedad deliberada (comportamiento ante
  saldo insuficiente) y un flujo de pago de recibos a verificar. Input de **S3**.

## Paso 1 — S4 autónomo acotado por módulos

```
/qa-automator:autonomous --url=https://parabank.parasoft.com/parabank/index.htm --flows=login,accounts,transfer
```

**Resultado esperado:** el agente detecta que el sitio es login-gated, genera `tests/e2e/auth.setup.ts`
(login una vez → `storageState`) y los specs de los flujos acotados **heredan** la sesión. No
re-loguea en cada test. El POM usa `getByLabel`/`getByRole` (no hay `data-test` en este JSP).

## Paso 2 — S2 desde Gherkin (data-driven + drift)

```
/qa-automator:req-driven --gherkin=examples/02-parabank/parabank.feature --url=https://parabank.parasoft.com/parabank/index.htm --style=config/style-contracts/parabank.yaml
```

**Resultado esperado:**
- El `Scenario Outline` de transferencia con `Examples` (amounts 1 y 2) genera **tests
  data-driven**: un test por fila, ambos citando el mismo `@criterion`. Las filas salen solo de la
  tabla `Examples`, no se inventan.
- El scenario `close-account` está declarado en el `.feature` pero ParaBank no lo expone en el
  happy-path → el agente lo **reporta como drift en `drift-report.json`, no fabrica el test**.

## Paso 3 — S3 desde FD (ambigüedad + drift)

```
/qa-automator:spec-refiner --fd=examples/02-parabank/parabank-fd.md --url=https://parabank.parasoft.com/parabank/index.htm --style=config/style-contracts/parabank.yaml
```

**Resultado esperado:**
- El refiner estructura el FD en RF-NNN y **marca el hueco ambiguo** (qué hace el sistema ante
  saldo insuficiente) en `refinement-questions.md`. **No inventa** el `Then` que falta: ese
  criterio queda bloqueado, sin test.
- El "pago de recibos" del FD genera una entrada en `drift-report.json` (el FD lo describe; hay que
  contrastarlo contra el DOM real).

## Verificación

ParaBank tiene auth → setea `QA_STORAGE_STATE` además de `QA_BASE_URL`. Eso activa el setup project
+ `dependencies` en `playwright.config.ts`: `auth.setup.ts` corre primero, los specs heredan el
estado. **No hace falta `--workers=1`** — el dependency garantiza el orden bajo `fullyParallel`.

```
# PowerShell
$env:QA_BASE_URL='https://parabank.parasoft.com/parabank/index.htm'; $env:QA_STORAGE_STATE='playwright/.auth/john.json'; npx playwright test --reporter=list
# bash
QA_BASE_URL='https://parabank.parasoft.com/parabank/index.htm' QA_STORAGE_STATE='playwright/.auth/john.json' npx playwright test --reporter=list
```

Debes ver:
- Tests autenticados en **verde** sin re-login y sin `--workers=1`.
- `drift-report.json` con `close-account` (S2) y/o pago de recibos (S3) como drift, **sin** specs
  fabricados para ellos.
- `refinement-questions.md` (S3) con el criterio ambiguo bloqueado.
- El balance de `john` **no** se asserta de forma exacta (cuenta compartida y mutable): los tests
  afirman señales de UI ("Transfer Complete!" + importe), no el saldo.

> **Cuidado con el logout concurrente:** un único `storageState` compartido + un test que cierra
> sesión envenena los tests autenticados que corren en paralelo (el logout mata el `JSESSIONID`
> server-side). El fix es logout con sesión propia aislada. Es la lección de auth de este lab.

## Limpieza

```
# PowerShell
Remove-Item tests/e2e/*.spec.ts, tests/pages/*.page.ts, playwright/.auth/john.json -ErrorAction SilentlyContinue
# bash
rm -f tests/e2e/*.spec.ts tests/pages/*.page.ts playwright/.auth/john.json
```

## Qué aprendiste

- El auth-handler (setup project + `storageState` + `dependencies`) da sesión persistente robusta
  sin serializar la suite con `--workers=1`.
- **Drift = la spec declara algo que la app no expone.** El agente lo reporta, no lo fabrica.
- **Ambigüedad = falta el `Then`.** El agente la marca en `refinement-questions.md` y bloquea el
  criterio, no adivina.
- Estado compartido y mutable → asserta señales de UI, nunca datos persistentes exactos.

Siguiente: [Lab 03 — OrangeHRM](../03-orangehrm/) — otro patrón SPA + auth, foco en el autónomo.
