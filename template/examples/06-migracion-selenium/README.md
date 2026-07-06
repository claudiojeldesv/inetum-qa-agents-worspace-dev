# Lab 06 — Migración: de Selenium legacy a Playwright con paridad auditable

Un cliente llega con lo que casi todos tienen: una suite Selenium en Java escrita hace años, llena
de `Thread.sleep`, XPath absolutos y un "smoke" que no asierta nada — pero que **es su red de
seguridad** y define qué funcionalidades hay que seguir cubriendo. Este lab migra esa suite a una
suite Playwright nueva, sin perder ni un caso por el camino y documentando qué se mejoró y por qué.

**Duración estimada**: 30-45 min. **Requiere**: el Paso 0 del Lab 01 (workspace preparado). No
necesita Java — la suite legacy se **lee**, no se ejecuta.

## Qué trae este lab

- [`legacy-suite/`](legacy-suite/) — una suite Selenium+JUnit realista contra SauceDemo, con los
  vicios típicos de una suite de 2019 mantenida a parches:
  - `LoginTests.java` — 3 casos: login válido, usuario bloqueado, y un **duplicado por datos**
    (mismo flujo, otro usuario) que el analyzer debería agrupar como test data-driven.
  - `CheckoutTests.java` — compra completa con asserts reales, y un **"smoke" sin aserciones**
    (recorre el flujo y si no peta, "vamos bien") que el analyzer NO debe fabricar: es una pregunta
    para ti, no un test.
  - Anti-patterns sembrados: `Thread.sleep` por doquier, XPath absolutos (`/html/body/div/...`),
    login duplicado sin POM, datos hardcoded.

## Paso único

```
/qa-automator:migrate --legacy=examples/06-migracion-selenium/legacy-suite --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

## Qué debes observar

1. **El checkpoint de migración (siempre ask-first).** Antes de generar nada, el agente te enseña:
   el inventario (2 archivos, 5 casos), los criterios RF-NNN extraídos con su trazabilidad al código
   legacy (`LoginTests.java#testValidLogin`), el catálogo de anti-patterns encontrados, y el caso
   sin aserciones como **pregunta abierta** — decides tú qué verifica ese smoke, no el agente.
2. **Intención, no transpilación.** El spec nuevo de login no contiene ni un XPath del legacy: los
   locators salen del DOM real vía el planner + el Style Contract (`getByTestId`/`getByRole`), los
   sleeps desaparecen (auto-waiting), el login duplicado se convierte en test data-driven.
3. **La paridad cuadra.** En `migration-report.json`: `covered + drift + blocked + pending_decision`
   debe sumar los 5 casos del inventario. Ningún caso legacy se pierde en silencio.
4. **El legacy no se toca.** `legacy-suite/` queda intacto. La recomendación del agente: congelar la
   suite vieja, no borrarla, hasta validar la nueva en tu CI.
5. **El baseline queda escrito** (`config/criteria-baseline/saucedemo.json`): a partir de aquí la
   suite migrada evoluciona con `/qa-automator:incremental` (Lab 07), no re-migrando.

## ¿Y si mi legacy es UFT/QTP?

El mismo command con `--tech=uft` (o deja `auto`): el analyzer lee acciones VBScript (`.mts`),
object repositories y checkpoints. El principio no cambia: se extrae la intención y los checkpoints
se convierten en asserts de negocio; lo que no se entiende se pregunta, no se inventa.

## La idea que te llevas

Migrar no es traducir código de test: es **recuperar el inventario de intenciones** que la suite
vieja acumuló durante años y regenerarlo con el estándar de hoy, con una prueba auditable de que
nada se quedó atrás. Los años de mantenimiento del legacy no se tiran — se destilan.
