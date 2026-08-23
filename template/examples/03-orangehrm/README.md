# Lab 03 — OrangeHRM (SPA con sesión persistente, foco en el autónomo)

Lab avanzado, centrado en el **modo S4 autónomo** contra una SPA moderna con login. Refuerza dos
cosas: **acotar el reconocimiento por módulos** (el centro pedagógico del autónomo) y la **sesión
persistente** sobre una SPA con routing en cliente. Es un segundo patrón auth distinto al de
ParaBank: aquí el DOM expone buenos roles accesibles, sin `data-test` ni JSP legacy.

## Objetivo

Al terminar sabrás:
- Lanzar el **S4 autónomo** sobre una SPA login-gated, acotando por módulos (`login`, `dashboard`).
- Ver cómo el agente genera `auth.setup.ts` y los specs heredan la sesión vía `storageState`.
- Contrastar este patrón auth (SPA, locators semánticos) con el de ParaBank (JSP, fallback CSS).
- (Opcional) Repetir desde Gherkin (S2) y FD (S3) con los inputs incluidos.

## Duración y prerrequisitos

~25 min. Antes de empezar:
- Labs 01 y 02 completados (incluida la preparación del workspace, **Paso 0** del Lab 01).
- `/ia4d-qa-automator:healthcheck` en verde (si no, repasa el Paso 0 del Lab 01).
- OrangeHRM ya está permitido en `config/allowed-targets.yaml`; la cuenta de test
  (`Admin` / `admin123`, publicada en la propia pantalla de login) declarada como test-cred. El
  style-contract `config/style-contracts/orangehrm.yaml` ya trae `auth:` configurado.

## Escenario

[OrangeHRM OS](https://opensource-demo.orangehrmlive.com/) es un portal de gestión de RRHH. La
instancia demo es una **SPA** (no JSP): login en `/web/index.php/auth/login` y, tras autenticar,
un dashboard en `/web/index.php/dashboard/index` con barra superior, navegación lateral y widgets.
El entorno es **compartido y se resetea periódicamente** → los tests afirman presencia estructural
de la UI, nunca valores dinámicos (contadores, nombres).

Inputs incluidos en esta carpeta (para las puertas S2/S3, opcionales en este lab):
- [`orangehrm.feature`](orangehrm.feature) — Gherkin maduro: login válido, login inválido, campos
  obligatorios y presencia de la navegación lateral. Input de **S2**.
- [`orangehrm-fd.md`](orangehrm-fd.md) — FD en prosa libre, sin RF-NNN. Input de **S3**.
- [`orangehrm-fd-citado.md`](orangehrm-fd-citado.md) — el **mismo** FD, pero citando entre comillas
  los literales de pantalla medidos contra el DOM (en inglés, que es el idioma de la app; la prosa
  sigue en castellano). Input alternativo de **S3**, y la mitad interesante del experimento: el
  refiner emite los `hint` del walk-script en el idioma del FD, así que con literales citados el
  walker resolvió **22/22 pasos y 0 bloqueados** en Login/PIM/Leave, contra 6/23 en un lab
  equivalente sin citar. Si trabajas con un FD de cliente, pedirle que cite los literales de
  pantalla es la palanca más barata que tiene este producto.

## Paso 1 — S4 autónomo acotado por módulos

Es el flujo principal del lab. Acotamos a `login` y `dashboard`:

```
/ia4d-qa-automator:autonomous --url=https://opensource-demo.orangehrmlive.com/web/index.php/auth/login --flows=login,dashboard
```

**Resultado esperado:**
- El agente detecta que el sitio es login-gated y genera `tests/e2e/auth.setup.ts`: login una vez
  con `Admin` / `admin123`, verifica la señal de éxito (`getByRole('heading', { name: 'Dashboard' })`)
  y guarda el estado en `playwright/.auth/admin.json`.
- Los specs de `login` y `dashboard` se generan con POM por pantalla y locators **semánticos**
  (`getByRole`/`getByPlaceholder`), sin fallback CSS — la SPA expone buenos nombres accesibles.
- El reconocimiento se limita a los dos módulos: no recorre PIM, Leave, Time ni Recruitment.

> Para ampliar a otro módulo, añádelo al brief: `--flows=login,dashboard,pim`. Lanzarlo **sin**
> `--flows` sobre este portal (que tiene una docena de módulos) dispara el warning de módulos: es
> justo el caso donde explorar a ciegas satura el contexto.

## Paso 2 — (Opcional) S2 desde Gherkin

```
/ia4d-qa-automator:req-driven --gherkin=examples/03-orangehrm/orangehrm.feature --url=https://opensource-demo.orangehrmlive.com/web/index.php/auth/login --style=config/style-contracts/orangehrm.yaml
```

**Resultado esperado:** un test por Scenario citando su `@criterion RF-NNN`, incluidos los dos
negativos (credenciales inválidas → alerta; formulario vacío → "Required" bajo cada campo). El
scenario de navegación lateral afirma presencia de los módulos `Admin`, `PIM`, `Leave`, `Time`,
sin assertar el conjunto completo (el demo puede variar).

## Paso 3 — (Opcional) S3 desde FD

```
/ia4d-qa-automator:spec-refiner --fd=examples/03-orangehrm/orangehrm-fd.md --url=https://opensource-demo.orangehrmlive.com/web/index.php/auth/login --style=config/style-contracts/orangehrm.yaml
```

**Resultado esperado:** el refiner estructura el FD en RF-NNN (acceso + panel principal) y genera
tests con `@criterion`. El FD describe el menú de perfil con cierre de sesión; si el flujo no se
cubre en el happy-path acotado, queda anotado, no se fabrica.

## Verificación

OrangeHRM tiene auth → setea `QA_STORAGE_STATE` además de `QA_BASE_URL`:

```
# PowerShell
$env:QA_BASE_URL='https://opensource-demo.orangehrmlive.com/'; $env:QA_STORAGE_STATE='playwright/.auth/admin.json'; npx playwright test --reporter=list
# bash
QA_BASE_URL='https://opensource-demo.orangehrmlive.com/' QA_STORAGE_STATE='playwright/.auth/admin.json' npx playwright test --reporter=list
```

Debes ver:
- `auth.setup.ts` corre primero; los specs de dashboard **heredan** la sesión sin re-login.
- Tests en **verde** sin `--workers=1`.
- POM con locators semánticos en `tests/pages/`; **sin** `css_fallback_attributes` (contraste con
  ParaBank).
- Scan a11y inyectado en cada `test()`; `fail_on_violations: false` → modo warning, no aborta.

> Nota de entorno: el demo es público y a veces lento o reseteado. Si un test de dashboard falla por
> un dato que cambió, revisa que el assert sea estructural (presencia de widget/menú), no de valor.

## Limpieza

```
# PowerShell
Remove-Item tests/e2e/*.spec.ts, tests/pages/*.page.ts, playwright/.auth/admin.json -ErrorAction SilentlyContinue
# bash
rm -f tests/e2e/*.spec.ts tests/pages/*.page.ts playwright/.auth/admin.json
```

## Qué aprendiste

- El mismo auth-handler resuelve sesión persistente en una **SPA** igual que en un JSP: cambia el
  DOM, no el mecanismo (`storageState` + setup project + `dependencies`).
- En SPAs con muchos módulos, **acotar por módulos** es la diferencia entre un plan útil y un caballo
  sin riendas.
- La estrategia de locators la fija el style-contract por sitio: semántico aquí, con fallback CSS
  acotado en ParaBank.

Siguiente: [Lab 04 — TodoMVC](../04-todomvc/) — el reto. Sin pasos, lo resuelves tú.
