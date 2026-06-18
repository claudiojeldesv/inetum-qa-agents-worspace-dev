# Lab 01 — SauceDemo (las tres puertas, e-commerce limpio)

Lab de entrada. Aprendes las **tres puertas de entrada al mismo motor** (S4 autónomo, S2
Gherkin, S3 FD) sobre un e-commerce de práctica sin auth persistente ni drift: el caso más
sencillo posible, todo verde. Si es tu primera vez con el agente, empieza aquí.

## Objetivo

Al terminar sabrás:
- Lanzar el modo **S4 autónomo** acotando el reconocimiento por **módulos** (`--flows`).
- Generar los mismos tests desde un **Gherkin** (S2) y desde un **Documento Funcional** (S3).
- Leer la evidencia que deja el agente: POM por pantalla, scan de accesibilidad, audit-log,
  trazabilidad `@criterion`.

## Duración y prerrequisitos

~15 min. Antes de empezar:
- `npm install` y `npx playwright install chromium` ya ejecutados en el workspace.
- `/qa-automator:healthcheck` en verde (runtime completo, MCP de Playwright cargado).
- SauceDemo ya está permitido en `config/allowed-targets.yaml` y sus credenciales públicas
  (`standard_user` / `secret_sauce`, `locked_out_user` / `secret_sauce`) declaradas como
  test-creds (no son PII).

## Escenario

[SauceDemo](https://www.saucedemo.com/) es un e-commerce de demostración de Sauce Labs. No tiene
estado de sesión server-side ni datos reales: el target ideal para ver las tres puertas sin la
complejidad de auth ni la detección de drift. Cubrimos tres casos:

- **Login válido** — `standard_user` entra y ve el listado de productos.
- **Login bloqueado** (negativo) — `locked_out_user` es rechazado con mensaje de error.
- **Checkout** — añadir un producto y completar la compra hasta la confirmación.

Inputs incluidos en esta carpeta:
- [`saucedemo.feature`](saucedemo.feature) — Gherkin maduro (cada Scenario declara su `Then`,
  incluido el negativo). Input de **S2**.
- [`saucedemo-fd.md`](saucedemo-fd.md) — Documento Funcional en prosa libre, sin RF-NNN. Input de **S3**.

> Los inputs solo describen **intención**. Los tests los genera el agente cuando ejecutas el
> command — así practicas el flujo real, no copias un resultado.

## Paso 1 — S4 autónomo acotado por módulos

El modo autónomo solo necesita la URL. **Acota siempre por módulos** con `--flows`: es el camino
recomendado y, sin él, el command te lanzará un warning pidiéndote los módulos (ver
[CLAUDE.md](../../CLAUDE.md), regla del autónomo).

```
/qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
```

**Resultado esperado:** el agente recorre los cinco actos (Comprender → Mapear → Estructurar →
Materializar → Juzgar) **limitándose a los flujos `login` y `checkout`**, genera un POM por
pantalla en `tests/pages/` y los `.spec.ts` en `tests/e2e/`, y termina con los tests en verde.
No explora catálogo, ordenación ni footer: solo lo que pediste.

> Prueba a lanzarlo sin `--flows`: verás el warning de módulos y la petición de confirmación
> explícita. Es deliberado — en webs grandes, explorar a ciegas satura el contexto del agente.

## Paso 2 — S2 desde Gherkin

El `.feature` ya trae los `Then`. El parser determinístico (sin LLM) lo convierte a criterios
RF-NNN, el agente los mapea contra el DOM y genera tests con trazabilidad `@criterion`.

```
/qa-automator:req-driven --gherkin=examples/01-saucedemo/saucedemo.feature --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

**Resultado esperado:** un test por Scenario, cada uno citando su `@criterion RF-NNN`. El scenario
`login-locked` es un **caso negativo**: el test pasa afirmando el mensaje de error de usuario
bloqueado, no por ausencia del listado. El autor declaró ese `Then` en el `.feature`; el motor
no lo inventa.

## Paso 3 — S3 desde Documento Funcional

El FD no tiene identificadores ni `Then` explícitos. El refiner lo estructura en RF-NNN, lo mapea
contra el DOM y genera tests con `@criterion`.

```
/qa-automator:spec-refiner --fd=examples/01-saucedemo/saucedemo-fd.md --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

**Resultado esperado:** mismo resultado que el Paso 2, distinta puerta. A diferencia del FD de
ParaBank (Lab 02), este no trae ambigüedad ni flujos no expuestos: los tres criterios son claros
y mapeables, así que **ninguno queda bloqueado** en `refinement-questions.md` y **no hay**
`drift-report.json`.

## Verificación

```
$env:QA_BASE_URL='https://www.saucedemo.com/'; npx playwright test --reporter=list   # PowerShell
QA_BASE_URL='https://www.saucedemo.com/' npx playwright test --reporter=list          # bash
```

Debes ver:
- Todos los tests en **verde** (3 casos en S2/S3; los flujos acotados en S4).
- Un POM por pantalla en `tests/pages/` (locators `getByTestId`/`getByRole`, sin CSS).
- Cada `.spec.ts` con un `AxeBuilder` (scan a11y) inyectado al inicio de cada `test()`.
- En S2/S3, cada test cita su `@criterion RF-NNN`.
- `.work/audit-log.json` con la traza de la sesión.

SauceDemo **no** necesita auth-setup ni `--workers=1`: no mata sesiones server-side y los casos de
login prueban el login mismo. El style-contract `config/style-contracts/saucedemo.yaml` deja `auth`
desactivado a propósito. (El contraste con auth persistente está en el Lab 02 y el Lab 03.)

## Limpieza

Para repetir el lab desde cero, borra lo generado:

```
Remove-Item tests/e2e/*.spec.ts, tests/pages/*.page.ts -ErrorAction SilentlyContinue   # PowerShell
rm -f tests/e2e/*.spec.ts tests/pages/*.page.ts                                          # bash
```

## Qué aprendiste

- Las tres puertas (S2/S3/S4) alimentan **el mismo motor** de generación; cambias la entrada, no
  el resultado.
- En el autónomo, **acotar por módulos** con `--flows` no es opcional: controla el alcance y la
  calidad del plan.
- El motor **no fabrica** lo que no está: un caso negativo necesita su `Then` declarado.
- Cada test sale con POM, scan de accesibilidad y trazabilidad, sin que tú lo pidas explícitamente.

Siguiente: [Lab 02 — ParaBank](../02-parabank/) añade auth persistente, detección de drift y
refinamiento de ambigüedad.
