# Workspace QA con `ia4d-qa-automator`

Este workspace trae el agente **`ia4d-qa-automator`** listo para usar. Generas tests E2E
Playwright estructurados (POM, accesibilidad baked-in, trazabilidad auditable) a partir de
lo que tengas: solo una URL, un Gherkin, o un documento funcional. Un Reviewer independiente
audita los tests antes de exponerlos.

> Esto es una **guía de uso**. No describe cómo se construyó el agente. Si quieres extender
> el agente, ese es otro repo.

## Qué es (y qué no)

El agente opera como **juez QA independiente**, no como el dev que escribe tests sobre su
propio código. Trabaja en greybox o black-box. No sustituye a las herramientas de testing del
dev: tiene otra misión.

Núcleo siempre activo: **compliance pre-flight** (valida la URL objetivo, sin flag de
override), **Writer + Reviewer** (el Reviewer audita al Writer, hasta 2 iteraciones), **scan
de accesibilidad** (axe-core inyectado en cada test) y **audit-log** JSON.

## Los cuatro modos de entrada

Eliges el modo por lo que tengas a mano. El agente enruta solo si no se lo indicas.

| Modo | Tienes | Command | Estado |
|---|---|---|---|
| **S4 Autónomo** | Solo una URL | `/qa-automator:autonomous` | Funcional |
| **S3 Spec-refiner** | Un FD/PDF/spec floja + URL | `/qa-automator:spec-refiner` | Funcional |
| **S2 Req-driven** | Un `.feature` Gherkin maduro + URL | `/qa-automator:req-driven` | Funcional (Gherkin; OpenAPI no) |
| **S1 Code-driven** | Repo frontend (React/Vue/HTML) | `/qa-automator:code-driven` | No implementado (stub) |

S3 refina lo ambiguo: extrae criterios RF-NNN, **marca los huecos** en
`refinement-questions.md` y no inventa lo que falta. S2 parsea el Gherkin de forma
determinística (sin LLM) y materializa `Scenario Outline` + `Examples` como tests
data-driven. Ambos detectan **drift** entre la spec y lo que la app realmente expone, y lo
reportan sin fabricar tests para lo que no existe.

## Comandos

```
/qa-automator:healthcheck                       # verifica que el runtime está completo
/qa-automator:autonomous   --url=<URL>          # S4
/qa-automator:spec-refiner --fd=<path> --url=<URL>     # S3
/qa-automator:req-driven   --feature=<path> --url=<URL> # S2
```

Flags útiles del autónomo: `--flows=login,checkout` acota el reconocimiento (más rápido,
menos tokens); `--entry=<path>` fija el punto de entrada; `--ignore=<glob>` excluye zonas.

Empieza por [`examples/`](examples/): SauceDemo (S4) y ParaBank (S2/S3/S4), ya permitidos en
`config/allowed-targets.yaml`.

## Apuntar el agente a TU web

1. Añade el patrón URL de tu entorno **no productivo** a `config/allowed-targets.yaml`.
   Compliance pre-flight bloquea cualquier URL que no matche. No hay override.
2. Si usa credenciales de test documentadas, decláralas en `allowed_test_credentials` del
   mismo archivo (no son PII; nunca pongas credenciales reales).
3. (Opcional) Declara un **Style Contract** para tu sitio en `style-contracts/<tu-sitio>.yaml`
   con tus convenciones. Si no hay contract, el agente usa defaults y lo registra.
4. Lanza `/qa-automator:autonomous --url=<tu-url>`.

## Style Contract — tus convenciones

El Style Contract declara cómo quieres los tests: estrategia de locators, naming, estructura
POM, fixtures, datos sintéticos, auth y excepciones. El agente lo lee y lo **enforce** sobre
el output. Schema completo en [`references/style-contract-schema.md`](references/style-contract-schema.md);
ejemplos en [`style-contracts/`](style-contracts/).

Campos que probablemente quieras tocar para tu proyecto:

```yaml
# style-contracts/<tu-sitio>.yaml
locators:
  strategy: role-first            # role-first | testid-first | ...
  css_fallback_attributes: []     # whitelist legacy, p.ej. [name, id]
auth:
  enabled: false                  # true → setup project + storageState (mata la race sin --workers=1)
a11y:
  fail_on_violations: false       # false → modo warning (anota, no aborta); true → gate que aborta
evidence:
  screenshots: only-on-failure    # on → captura el estado final de cada test; imágenes en el reporte Allure
```

## Gates opcionales (off por defecto)

Tres funcionalidades vienen apagadas y se encienden cuando las necesitas. Las piezas están
completas en el runtime; el toggle solo las activa.

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
- **Convenciones de test**: [POM, naming, framework de asserts, fixtures — o "ver style-contract"]
- **Restricciones de compliance**: [si aplica — banca, salud, etc.]
