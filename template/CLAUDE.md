# Workspace QA con `ia4d-qa-automator`

Este workspace trae el agente **`ia4d-qa-automator`** listo para usar. Generas tests E2E
Playwright estructurados (POM, accesibilidad baked-in, trazabilidad auditable) a partir de lo
que tengas: solo una URL, un Gherkin, o un documento funcional. Un Reviewer independiente audita
los tests antes de exponerlos.

> Esto es una **guía de uso para el Ingeniero QA** (y para Claude Code cuando trabaja en este workspace).
> No describe cómo se construyó el agente. Si quieres extenderlo, ese es otro repo.

## Empieza por los labs

**Prepara el workspace primero (una vez).** Desde la raíz (la carpeta `template/` que descargaste
**es** la raíz):

```
npm install
npx playwright install chromium
npm run qa:healthcheck        # debe terminar en "Healthcheck OK"
```

Sin esto el agente no funciona: sus hooks (compliance pre-flight, guarda anti-`fixme`) necesitan
las dependencias instaladas. Si lanzas un command sin haber instalado, el pre-flight te bloquea con
un mensaje pidiéndote `npm install` en vez de fallar de forma críptica.

En [`examples/`](examples/) hay cuatro labs reproducibles, ordenados por dificultad. Hazlos en
orden la primera vez:

1. [`01-saucedemo`](examples/01-saucedemo/) — las tres puertas (S2/S3/S4) sobre e-commerce limpio.
2. [`02-parabank`](examples/02-parabank/) — auth persistente, drift y ambigüedad.
3. [`03-orangehrm`](examples/03-orangehrm/) — autónomo acotado por módulos sobre una SPA con sesión.
4. [`04-todomvc`](examples/04-todomvc/) — reto: lo resuelves tú, sin solución.
5. [`05-config`](examples/05-config/) — transversal: env-vars, Style Contract y el command `config`. Todas las capas.

Cada lab trae solo **inputs**; los tests los genera el agente al ejecutar el command.

## Qué es (y qué no)

El agente opera como **juez QA independiente**, no como el dev que escribe tests sobre su propio
código. Trabaja en greybox o black-box. No sustituye a las herramientas de testing del dev: tiene
otra misión.

Núcleo **siempre activo**: **compliance pre-flight** (valida la URL objetivo contra
`config/allowed-targets.yaml`, sin flag de override), **Writer + Reviewer** (el Reviewer audita al
Writer, hasta 2 iteraciones), **scan de accesibilidad** (axe-core inyectado en cada test) y
**audit-log** JSON.

## Regla del autónomo: acota SIEMPRE por módulos

El modo S4 (autónomo) **no explora una web entera a ciegas**. En webs medianas o grandes, explorar
sin acotar satura la ventana de contexto del agente con casuística irrelevante y degrada la calidad
del plan: el agente se vuelve un caballo sin riendas.

- Lanza siempre con un **brief de módulos**: `--flows=login,checkout` (módulos o flujos a cubrir).
- Si lanzas el autónomo **sin** `--flows`, el command te muestra un **warning** y te pide los
  módulos. Solo continúa a ciegas si confirmas **explícitamente** (tecleando `EXPLORAR SIN ACOTAR`).
- Pensar en módulos (login, checkout, transfer, dashboard…) es la unidad de trabajo correcta: un lab
  acotado es más rápido, más barato y más fiable que un barrido ciego.

## Los cuatro modos de entrada

Eliges el modo por lo que tengas a mano. El agente enruta solo si no se lo indicas.

| Modo | Tienes | Command | Estado |
|---|---|---|---|
| **S4 Autónomo** | Solo una URL | `/ia4d-qa-automator:autonomous` | Funcional |
| **S3 Spec-refiner** | Un FD/PDF/spec floja + URL | `/ia4d-qa-automator:spec-refiner` | Funcional |
| **S2 Req-driven** | Un `.feature` Gherkin maduro + URL | `/ia4d-qa-automator:req-driven` | Funcional (Gherkin; OpenAPI no) |
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | `/ia4d-qa-automator:code-driven` | No implementado (stub) |

S3 refina lo ambiguo: extrae criterios RF-NNN, **marca los huecos** en `refinement-questions.md` y
no inventa lo que falta. S2 parsea el Gherkin de forma determinística (sin LLM) y materializa
`Scenario Outline` + `Examples` como tests data-driven. Ambos detectan **drift** entre la spec y lo
que la app realmente expone, y lo reportan sin fabricar tests para lo que no existe.

## Comandos

```
/ia4d-qa-automator:healthcheck                                    # verifica que el runtime está completo
/ia4d-qa-automator:autonomous   --url=<URL> --flows=<módulos>     # S4 (acota por módulos)
/ia4d-qa-automator:spec-refiner --fd=<path> --url=<URL>           # S3
/ia4d-qa-automator:req-driven   --gherkin=<path> --url=<URL>      # S2
/ia4d-qa-automator:report                                         # reporte Allure enriquecido (post-run)
/ia4d-qa-automator:config       [--style=<contract.yaml>]         # valida el contract + muestra estado efectivo
```

Flags del autónomo: `--flows=login,checkout` acota por módulos (recomendado); `--entry=<path>` fija
el punto de entrada profundo; `--ignore=<glob>` excluye zonas. Flag común opcional:
`--style=<contract.yaml>`.

## Apuntar el agente a TU web

1. Añade el patrón URL de tu entorno **no productivo** a `config/allowed-targets.yaml`. Compliance
   pre-flight bloquea cualquier URL que no matche. No hay override.
2. Si usa credenciales de test documentadas, decláralas en `allowed_test_credentials` del mismo
   archivo (no son PII; nunca pongas credenciales reales).
3. (Opcional) Declara un **Style Contract** en `config/style-contracts/<tu-sitio>.yaml`. Si no hay
   contract, el agente usa defaults y lo registra.
4. Lanza `/ia4d-qa-automator:autonomous --url=<tu-url> --flows=<tus-módulos>`.

## Style Contract — tus convenciones

El Style Contract declara cómo quieres los tests: estrategia de locators, naming, estructura POM,
fixtures, datos sintéticos, auth y excepciones. El agente lo lee y lo **enforce** sobre el output.
Para arrancar uno nuevo, copia la **plantilla anotada**
[`examples/05-config/_TEMPLATE.annotated.yaml`](examples/05-config/_TEMPLATE.annotated.yaml) (cada
campo con qué hace / cuándo tocarlo / default, en dos niveles). Schema completo para el detalle fino
en [`docs/references/style-contract-schema.md`](docs/references/style-contract-schema.md); ejemplos
reales en [`config/style-contracts/`](config/style-contracts/) (saucedemo, parabank, orangehrm).

**Valida antes de correr**: `/ia4d-qa-automator:config --style=<tu-sitio>.yaml` comprueba el contract
(typos, enums, incoherencias) y te muestra el **estado efectivo** — qué gates están on/off ahora,
de dónde sale cada valor (env-var / contract / default). El [Lab 05](examples/05-config/) lo practica.

Campos que probablemente quieras tocar:

```yaml
# config/style-contracts/<tu-sitio>.yaml
locators:
  strategy: role-first            # role-first | testid-first | ...
  css_fallback_attributes: []     # whitelist legacy, p.ej. [name, id]
auth:
  enabled: false                  # true → setup project + storageState (mata la race sin --workers=1)
a11y:
  fail_on_violations: false       # false → modo warning (anota, no aborta); true → gate que aborta
evidence:
  level: minimal                  # minimal | steps | full. full → test.step() + screenshot por paso + trace
  screenshots: only-on-failure    # solo en level minimal (captura final). full lo fuerza a on
```

**Reporte Allure PRO**: con `evidence.level: full` el agente instrumenta cada acción con `test.step()`
+ screenshot por paso + trace navegable. `/ia4d-qa-automator:report` (→ `npm run report`) los enriquece
con trazabilidad RF-NNN (epic→feature→story), severity, descripción y **Trends** entre runs
(history en `.allure-history/`). `config/style-contracts/saucedemo.yaml` es el ejemplo de referencia.

## Gates opcionales (off por defecto)

Tres funcionalidades vienen apagadas y se encienden cuando las necesitas. Las piezas están completas
en el runtime; el toggle solo las activa.

| Gate | Cómo encenderlo | Qué hace |
|---|---|---|
| **PII scanner ES** | `QA_ENABLE_PII=1` | Detecta DNI/IBAN/Luhn/teléfono/email en los tests generados. |
| **Judge** | `QA_ENABLE_JUDGE=1` | Score numérico de calidad tras Writer+Reviewer. |
| **Gate a11y** | `fail_on_violations: true` (por sitio) | El scan a11y pasa de warning a abortar el test. |

El **scan** de accesibilidad se inyecta **siempre**, encendido o no el gate. La guarda
anti-`test.fixme()` también está siempre activa. Copia `.env.example` a `.env` para fijar los toggles.

## Tu proyecto

Rellena esto con lo tuyo (el agente lo lee como contexto):

- **Aplicación bajo prueba**: [TU APP — qué es, dominio]
- **Stack**: [TU STACK FRONTEND]
- **Entorno(s) de staging**: [TUS URLs NO PRODUCTIVAS]
- **Módulos / flujos críticos**: [LOGIN, CHECKOUT, … — los que acotarás con --flows]
- **Convenciones de test**: [POM, naming, framework de asserts, fixtures — o "ver style-contract"]
- **Restricciones de compliance**: [si aplica — banca, salud, etc.]
