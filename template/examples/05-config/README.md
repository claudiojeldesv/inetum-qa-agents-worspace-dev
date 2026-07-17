# Lab 05 — Configuración (env-vars, Style Contract y el command `config`)

Lab transversal. No genera tests nuevos: te enseña **las capas de configuración** del agente y
cómo comprobarlas. Al terminar sabrás qué puedes ajustar, dónde, y cómo verificar que tu ajuste
hace lo que crees — antes de que un typo silencioso te deje un gate apagado en producción.

Se apoya en `/ia4d-qa-automator:config`, que hace dos cosas deterministas (sin LLM): **valida** el
Style Contract y **muestra el estado efectivo** de la sesión (qué gates están on/off ahora).

## Objetivo

Al terminar sabrás:
- Leer y editar un **Style Contract** con la [plantilla anotada](_TEMPLATE.annotated.yaml) (todas las capas).
- Distinguir las tres formas de configurar: **env-var** (gates PII/Judge), **contract** (a11y, auth,
  evidencia, locators…) y **default** (lo que se aplica si no declaras nada).
- Usar `/ia4d-qa-automator:config` para **cazar errores** (typos, enums inválidos, incoherencias) y para
  ver tu **estado efectivo** de un vistazo.

## Duración y prerrequisitos

~20 min. Los pasos 1–4 **no abren navegador** (son validación + estado, instantáneos). El paso 5
(opcional) corre tests y necesita el workspace preparado — si no lo has hecho, mira el **Paso 0**
del [Lab 01](../01-saucedemo/). Node ≥ 20 basta para el resto.

## Las tres formas de configurar

| Forma | Dónde | Ejemplos | Se comprueba con |
|---|---|---|---|
| **Env-var** | `.env` (copia de `.env.example`) | `QA_ENABLE_PII`, `QA_ENABLE_JUDGE`, `QA_STORAGE_STATE` | `config` → fila `[env]` |
| **Contract** | `config/style-contracts/<sitio>.yaml` | `a11y`, `auth`, `evidence`, `locators`, `pom`… | `config` → filas `[contract]` |
| **Default** | ninguno (el agente los aplica) | lo que no declaras | `config` → filas `[default]` |

Regla mental: **env-var = gates de sesión; contract = convenciones por-sitio; default = red de
seguridad.** El command te dice de dónde sale cada valor efectivo.

## Paso 1 — Recorre la plantilla anotada y valídala

Abre [`_TEMPLATE.annotated.yaml`](_TEMPLATE.annotated.yaml). Está en **dos niveles**: arriba "lo que
tocas siempre" (locators, auth, a11y, evidencia, y la nota de gates por env-var); abajo "avanzado"
(pom, naming, tc_registry, asserts, waits, fixtures, test_design, banned_apis). Cada campo dice qué
hace, cuándo tocarlo y su default.

Valídala tal cual:

```
/ia4d-qa-automator:config --style=examples/05-config/_TEMPLATE.annotated.yaml
```

**Resultado esperado:** `OK` sin problemas, y una tabla de estado efectivo. Fíjate en las
etiquetas `[env]` / `[contract]` / `[default]` de cada fila: esa es la respuesta a "¿de dónde sale
este valor?".

## Paso 2 — Caza de typos (el agujero silencioso)

El peligro real: escribes un campo mal y el agente lo **ignora en silencio**. El gate que creías
haber encendido nunca se activa. `config` lo detecta.

1. Copia la plantilla a un contract de trabajo:
   ```
   Copy-Item examples/05-config/_TEMPLATE.annotated.yaml config/style-contracts/lab-config.yaml   # PowerShell
   cp examples/05-config/_TEMPLATE.annotated.yaml config/style-contracts/lab-config.yaml            # bash
   ```
2. Rómpelo a propósito. En `config/style-contracts/lab-config.yaml`:
   - en `a11y`, cambia `fail_on_violations` por `fail_on_violation` (singular);
   - en `evidence`, cambia `level: minimal` por `level: completo`.
3. Valida:
   ```
   /ia4d-qa-automator:config --style=lab-config.yaml
   ```

**Resultado esperado:**
```
  ✗ ERROR  evidence.level: valor 'completo' no válido. Permitidos: minimal | steps | full
  ! aviso  a11y.fail_on_violation: campo desconocido — ¿quisiste decir 'fail_on_violations'?
```
Y en la tabla de estado, el gate a11y aparece como `[default] off (warning)` — porque tu typo dejó
el campo real sin declarar. **Ese es el punto**: creías haberlo encendido; el estado efectivo te
dice la verdad. El enum inválido devuelve exit code `1` (útil en CI); los avisos no fallan.

Deja bien `fail_on_violations` y `level: minimal` antes de seguir.

## Paso 3 — Enciende gates por env-var y míralos moverse

Los gates PII y Judge **no** son campos del contract: se activan por variable de entorno. Están off
por defecto.

Primero, míralos off:
```
/ia4d-qa-automator:config --style=lab-config.yaml
```
Filas `[env]`: `gate: PII scanner: off`, `gate: Judge: off`.

Ahora enciéndelos en la sesión y vuelve a mirar:
```
$env:QA_ENABLE_JUDGE='1'; $env:QA_ENABLE_PII='1'   # PowerShell
export QA_ENABLE_JUDGE=1 QA_ENABLE_PII=1            # bash
```
```
/ia4d-qa-automator:config --style=lab-config.yaml
```

**Resultado esperado:** las mismas filas ahora dicen `ON`. Para fijarlos de forma permanente en el
workspace, copia `.env.example` a `.env` y descomenta las líneas. Apágalos otra vez antes de seguir
(`Remove-Item Env:QA_ENABLE_JUDGE,Env:QA_ENABLE_PII` en PowerShell; `unset QA_ENABLE_JUDGE
QA_ENABLE_PII` en bash) para no dejar el Judge corriendo en runs posteriores.

## Paso 4 — El gate a11y (contract, por-sitio)

A diferencia de PII/Judge, el gate de accesibilidad se controla **en el contract**, por sitio. El
**scan** axe-core se inyecta SIEMPRE; lo que cambias es si una violación **aborta** el test o solo
queda anotada.

En `config/style-contracts/lab-config.yaml`, cambia `a11y.fail_on_violations` a `true` y valida:
```
/ia4d-qa-automator:config --style=lab-config.yaml
```

**Resultado esperado:** la fila del gate pasa de `[contract] off (warning)` a
`[contract] ON (aborta)`. En un run real, `false` deja las violaciones como evidencia auditable
(no tumba el test); `true` las convierte en fallo — es lo que quieres cuando el cliente exige
WCAG AA como criterio de aceptación (banca, seguros, sector público).

> Prueba también la coherencia: pon `fail_on_violations: true` **y** `severity_threshold: []`
> (lista vacía). `config` avisa: el gate está on pero nada cuenta, no abortará nunca.

## Paso 5 — Contraste observable: `evidence` minimal vs full (opcional, con navegador)

Este paso sí corre tests. Reutiliza los que generaste en el [Lab 01](../01-saucedemo/) (si no los
tienes, genera al menos uno con S4 antes). Verás cómo `evidence.level` cambia el reporte Allure.

1. Con `evidence.level: minimal` en `config/style-contracts/saucedemo.yaml`, corre y abre el reporte:
   ```
   $env:QA_BASE_URL='https://www.saucedemo.com/'; npx playwright test --reporter=list   # PowerShell
   QA_BASE_URL='https://www.saucedemo.com/' npx playwright test --reporter=list          # bash
   npm run report
   ```
   Observa: pocos pasos, screenshot final.
2. Cambia a `evidence.level: full`, regenera los tests con el command (el nivel guía cómo el Writer
   instrumenta `test.step()`), vuelve a correr y reporta.

**Resultado esperado:** con `full`, el Allure muestra timeline por paso, screenshot por acción y
trace navegable. Es el reporte "PRO" para un decisor. `config` te confirma antes de correr que
`evidence.level: full` fuerza `QA_SCREENSHOT=on + QA_TRACE=on`.

## Limpieza

```
Remove-Item config/style-contracts/lab-config.yaml -ErrorAction SilentlyContinue   # PowerShell
rm -f config/style-contracts/lab-config.yaml                                          # bash
```
Y si seguiste el Paso 3, asegúrate de haber apagado `QA_ENABLE_JUDGE` / `QA_ENABLE_PII`.

## Qué aprendiste

- Hay **tres formas** de configurar: env-var (gates de sesión), contract (convenciones por-sitio) y
  default (lo que se aplica solo). `config` te dice de dónde sale cada valor.
- Un **typo es silencioso** sin validación: el campo se ignora y el gate no se activa.
  `/ia4d-qa-automator:config` lo caza (campo desconocido con sugerencia, enum inválido, incoherencia).
- El **estado efectivo** no es lo que escribiste, es lo que queda tras aplicar env + contract +
  defaults. Compruébalo antes de un run importante.
- La **plantilla anotada** es tu punto de partida para cualquier sitio nuevo: cópiala, borra lo que
  no necesites, valida.

Este es el último lab guiado. El [Lab 04 — TodoMVC](../04-todomvc/) es el reto sin solución.
