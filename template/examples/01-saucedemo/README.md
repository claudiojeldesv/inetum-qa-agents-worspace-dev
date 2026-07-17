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

~15 min. Necesitas Node ≥ 20 y Claude Code (CLI o extensión IDE). SauceDemo ya está permitido en
`config/allowed-targets.yaml` con sus credenciales públicas (`standard_user` / `secret_sauce`,
`locked_out_user` / `secret_sauce`, declaradas como test-creds, no son PII). La preparación del
workspace es el **Paso 0** de abajo.

## Paso 0 — Prepara el workspace (una sola vez, OBLIGATORIO)

Antes de invocar el agente, instala dependencias y verifica el runtime. **Hazlo antes de lanzar
cualquier command**: el agente usa hooks que necesitan las dependencias instaladas; si lanzas el
autónomo sin esto, el pre-flight de compliance te bloqueará pidiéndote `npm install` (y antes del
arreglo, reventaba con un error críptico).

```
npm install
npx playwright install chromium
npm run qa:healthcheck
```

**Resultado esperado:** `npm run qa:healthcheck` termina con `Healthcheck OK: runtime ... completo
(18 comprobaciones)`. Si falla, te dice qué pieza del runtime falta — resuélvelo antes de seguir.

> Ejecuta esto desde la raíz del workspace (la carpeta `template/` que descargaste **es** la raíz).
> Solo hace falta una vez por workspace; los siguientes labs ya lo dan por hecho.

### Si el planner falla con "two different versions" / "did not expect test()"

No es tu test ni el sitio: es el proceso `run-test-mcp-server` (motor Playwright que Claude Code
arranca al abrir la sesión) que nació o quedó en mal estado y **no se recupera solo dentro de la
sesión** (ni con `/mcp reconnect`). Ritual de reinicio limpio, **con Claude Code cerrado**:

```
# 1. Cierra Claude Code / VSCode por completo.
# 2. Desde la raíz del template, en una terminal:
powershell -ExecutionPolicy Bypass -File examples/01-saucedemo/mcp-reset.ps1
# 3. Vuelve a abrir Claude Code en el template y relanza el command.
```

`mcp-reset.ps1` mata solo el worker MCP huérfano y los navegadores de Playwright (no toca el resto
de Node ni tu Chrome). Al reabrir Claude Code, el worker nace limpio. Correrlo **preventivamente**
antes del primer run también sirve.

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

**Extra (opcional) — cobertura ampliada a ~25 casos.** Cuando quieras practicar S2/S3 a mayor
escala (ordenación del catálogo, gestión del carrito, pago completo, cierre de sesión), usa las
versiones extendidas de los mismos inputs:
- [`saucedemo-25casos.feature`](saucedemo-25casos.feature) — 25 Scenarios Gherkin. Input de **S2**.
- [`saucedemo-fd-25casos.md`](saucedemo-fd-25casos.md) — FD ampliado (~25 criterios RF). Input de **S3**.

Mismos comandos de los Pasos 2 y 3, cambiando el `--gherkin`/`--fd` por el fichero de 25 casos. Es
la misma mecánica; solo cubre más superficie del demo.

## Paso 1 — S4 autónomo acotado por módulos

El modo autónomo solo necesita la URL. **Acota siempre por módulos** con `--flows`: es el camino
recomendado y, sin él, el command te lanzará un warning pidiéndote los módulos (ver
[CLAUDE.md](../../CLAUDE.md), regla del autónomo).

```
/ia4d-qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
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
/ia4d-qa-automator:req-driven --gherkin=examples/01-saucedemo/saucedemo.feature --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

**Resultado esperado:** un test por Scenario, cada uno citando su `@criterion RF-NNN`. El scenario
`login-locked` es un **caso negativo**: el test pasa afirmando el mensaje de error de usuario
bloqueado, no por ausencia del listado. El autor declaró ese `Then` en el `.feature`; el motor
no lo inventa.

## Paso 3 — S3 desde Documento Funcional

El FD no tiene identificadores ni `Then` explícitos. El refiner lo estructura en RF-NNN, lo mapea
contra el DOM y genera tests con `@criterion`.

```
/ia4d-qa-automator:spec-refiner --fd=examples/01-saucedemo/saucedemo-fd.md --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
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
