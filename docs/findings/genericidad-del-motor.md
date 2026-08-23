# ¿El motor se adapta al producto, o el producto al motor?

**2026-08-23.** La pregunta salió al cerrar la gira de dominio, y es la pregunta de viabilidad
comercial, no una curiosidad técnica: si cada sitio nuevo exige personalizar el motor, el producto no
se vende. Un walker vendible se adapta a las aplicaciones; no al revés.

Esto no es una opinión razonada: es una medición sobre el código.

---

## 1. Método

Buscar los nombres de los sitios de campo (`dolibarr`, `parabank`, `saucedemo`, `orangehrm`, `mifos`)
en el **código del motor** (`src/`, `copilot/src/`, excluidos los tests) y clasificar cada aparición
en comentario o código ejecutable. La hipótesis a falsar: *el motor tiene ramas de comportamiento por
sitio*.

## 2. El resultado

**49 apariciones en el motor. 44 son comentarios; 5 son código.** Cero son ramas de comportamiento
por sitio: no existe en ninguna parte un `if (sitio === X)`.

Los 44 comentarios son la cultura del repo funcionando: cada uno cita **dónde se midió** el
comportamiento que justifica la línea de código. Ejemplo real, en `verify-locators.ts`:

> Medido en el demo de Dolibarr el 2026-08-23: no. La portada es un selector de perfiles.

Eso no es acoplamiento al sitio: es la evidencia de por qué el código genérico es como es. Borrar esos
comentarios no cambiaría una sola decisión en ejecución.

**Las 5 apariciones en código, clasificadas una a una:**

| dónde | qué es | veredicto |
|---|---|---|
| `src/compliance-preflight.ts:83` | lista de dominios permitidos de los labs que vienen en la caja | legítimo — sin ella los ejemplos no corren |
| `src/pii-detector.ts:35` | `saucedemo.com` en `ALLOWED_EMAIL_DOMAINS`, junto a `example.com` y `mailinator.com` | legítimo — dominios de correo que no son PII |
| `copilot/src/check-walk-script.ts:59` | ejemplo dentro de `CANONICAL_SKELETON`, el mensaje de error que enseña la forma del walk-script | legítimo — documentación embebida |
| `src/scripts/run-s4-mecanico.ts:63` | `flags['style'] \|\| 'config/style-contracts/saucedemo.yaml'` | **defecto latente**, misma forma que D45 |
| `copilot/src/lean-run.ts:43` | `values.site ?? 'saucedemo'`, del que se derivan contract, url y workDir | **defecto latente**, misma forma que D45, y se propaga a tres rutas desde un solo default |

## 3. Dónde viven los nombres de sitio en el repo entero

La distribución es en sí misma la respuesta. Por directorio:

| directorio | ficheros | naturaleza |
|---|---|---|
| `tests/unit`, `copilot/tests` | 27 | cada test nombra el sitio contra el que se midió |
| `copilot/fixtures` | 10 | HTML capturado de sitios reales para regresión |
| `.work/**` | varios | artefactos de runs, no versionados |
| `tests/e2e/**`, `tests/pages/**` | 13 | salida generada, no motor |
| `config/style-contracts` | 6 | **configuración por sitio — el lugar diseñado para esto** |
| `src` | 7 | los desglosados arriba |

Si el producto se estuviera personalizando por cliente, los nombres estarían repartidos por el motor.
Están confinados a tests, fixtures, salida generada y configuración.

## 4. Los nueve defectos de la gira, clasificados

| tipo | cuáles | ¿requiere algo por sitio? |
|---|---|---|
| **arreglo del motor** (7) | flujo autocontenido, precedencia de URL base, el productor que faltaba, el analizador que fabricaba rutas, la detección del muro de login, la pantalla que solo existe al pasar, el nombre accesible real | no — aplican a cualquier sitio sin tocar nada |
| **mecanismo nuevo + declaración por sitio** (2) | el idioma de la aplicación; la ruta de entrada al login | sí — una línea de YAML |

El caso del muro de login ilustra por qué "se midió en Dolibarr" no significa "es cosa de Dolibarr".
El patrón real es *la aplicación sirve el login en la propia URL pedida, con 200 y sin redirigir*.
Eso lo hace buena parte de la web PHP y Java empresarial. Se midió en un sitio; se arregla para todos.

Lo mismo con la ruta de entrada: la portada de Dolibarr es un selector de perfiles y hay que pulsar
uno. Es la misma forma que tienen los aterrizajes SSO y los selectores de tenant de banca y seguros.

## 5. Declarar no es personalizar

La distinción que sostiene todo lo anterior:

- **Personalizar** es que el motor cambie de comportamiento según el sitio. Requiere código, no escala,
  y mata el producto. **Medido: no ocurre.**
- **Declarar** es decirle a la herramienta un hecho sobre la aplicación — su URL, sus credenciales, su
  idioma, cómo se llega a su login. Vive en YAML, lo escribe el QA una vez, y ningún framework de test
  del mundo se libra de ello.

## 6. La concesión: el miedo está bien fundado, pero mal apuntado

Lo que **no** crece es el código por sitio. Lo que **sí** crece es la lista de cosas a declarar:
targets permitidos, style contract, idioma, ruta de entrada, credenciales, política de sesión. Cada una
está justificada por separado; juntas suben el coste de dar de alta un sitio nuevo.

**Esa es la métrica que importa y no la estamos midiendo**: cuánto se tarda en poner en marcha un sitio
nuevo. Contar defectos no responde a la pregunta comercial; el tiempo de alta sí.

## 7. La predicción, para poder equivocarme en público

Dolibarr fue el **cuarto sitio** pero el **primer ERP heredado**. Clase nueva de aplicación, no sitio
nuevo. De ahí la predicción falsable:

> El quinto sitio, si es de una clase ya cubierta, necesitará **cero o una** declaración nueva.
> Si necesita cinco, el diseño tiene un problema de fondo y esta nota está equivocada.

Conviene que uno de los dos sitios que quedan de la gira (`the-internet.herokuapp.com`,
`automationexercise.com`) se elija deliberadamente parecido a algo ya cubierto, precisamente para medir
esto y no para lucirlo.

## 8. Abierto

- **Dos defectos latentes de la forma D45** (§2): un default silencioso que apunta a otro sitio. Ya
  costó tres specs en el loop de OrangeHRM cuando el default era la URL base. Sin arreglar.
- **El tiempo de alta de un sitio nuevo no se mide.** Debería salir del próximo sitio de la gira.

---

**Corrección de mi propia medición**: en la conversación que originó esta nota di "23 apariciones, 3 en
código" de memoria, sobre una búsqueda truncada. Los números reales son **49 y 5**, y el recuento erró
en la dirección optimista. La conclusión no cambia — cero ramas por sitio — pero el segundo defecto
latente (`lean-run.ts`) solo apareció al contar bien.
