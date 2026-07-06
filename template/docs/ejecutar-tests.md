# Ejecutar los tests generados (Playwright / npx)

El agente **genera** los tests; tú los **ejecutas**. Esta guía recoge los comandos de Playwright
para correr la suite post-generación: todo, un archivo, un caso, una feature, en modo debug, etc.

Todos los comandos asumen que estás en la raíz del workspace (la carpeta `template/`) y que ya
hiciste `npm install` + `npx playwright install chromium`.

Los tests viven en [`tests/e2e/`](../tests/e2e/) (`testDir` de la config). El Page Object Model
en [`tests/pages/`](../tests/pages/). Atajo del proyecto: `npm run e2e` ≡ `npx playwright test`.

## Lo básico

```
npx playwright test                     # toda la suite (todos los *.spec.ts de tests/e2e)
npx playwright test --list              # lista los casos SIN ejecutarlos (sanity de qué hay)
npm run e2e                             # idéntico a `npx playwright test`
```

## Por archivo

Pasa la ruta (o un fragmento de ella) del `.spec.ts`:

```
npx playwright test tests/e2e/login.happy-path.spec.ts
npx playwright test login                # match por substring: corre TODO lo que contenga "login"
```

El match por substring es la forma rápida de lanzar un archivo sin teclear la ruta completa.
Cuidado: `login` también engancha `login.invalid-credentials.spec.ts`, `login.locked-out-user.spec.ts`, etc.

## Por caso (título del test)

`-g` (alias de `--grep`) filtra por el título del `test(...)` / `describe(...)`, no por el archivo:

```
npx playwright test -g "usuario bloqueado"
npx playwright test -g "happy path"           # todos los casos cuyo título contenga eso
npx playwright test --grep-invert "a11y"      # ejecuta todo MENOS lo que matchee
```

`-g` acepta regex: `-g "login|checkout"` corre los títulos que mencionen login o checkout.

## Por línea (un solo caso, sin adivinar el título)

Sufija la ruta con `:<línea>`. La línea es donde empieza el `test(...)`:

```
npx playwright test tests/e2e/checkout.happy-path.spec.ts:23
```

Es la forma más quirúrgica: corre exactamente ese caso y nada más.

## Por feature

El agente nombra los specs por feature con prefijo: `login.*`, `checkout.*`, `dashboard.*`. Una
"feature" es, en la práctica, ese prefijo de nombre o una subcarpeta. Dos formas:

```
npx playwright test checkout              # substring: checkout.happy-path + checkout.step1-validation + ...
npx playwright test tests/e2e/checkout    # si agrupaste la feature en una subcarpeta
```

Si quieres agrupar por etiqueta en vez de por nombre de archivo, usa **tags** en el título del test
(`test('compra completa @checkout @smoke', ...)`) y fíltralos con `-g`:

```
npx playwright test -g "@smoke"           # solo los marcados @smoke, crucen las features que crucen
npx playwright test -g "@checkout"
```

Los tags son la vía recomendada para suites transversales (smoke, regresión) que cortan varias features.

## Ver el test correr (headed, UI, debug)

```
npx playwright test --headed              # abre el navegador y lo ves ejecutarse
npx playwright test --ui                  # modo UI interactivo: time-travel, watch, re-run selectivo
npx playwright test --debug               # Inspector paso a paso (pausa en cada acción)
npx playwright test login --debug         # combina: depura solo el archivo login
```

`--ui` es lo más útil para inspeccionar visualmente sin tocar código; `--debug` para pausar y
avanzar acción por acción cuando un locator no engancha.

## Re-ejecutar lo que falló y estabilidad

```
npx playwright test --last-failed         # solo los casos que fallaron en la corrida anterior
npx playwright test login --repeat-each=5 # corre 5 veces: caza flakiness
npx playwright test --workers=4           # paralelismo (por defecto: nº de cores; CI usa 1)
```

No necesitas `--workers=1` para los tests con auth: la config usa un `setup` project con
`dependencies` que ordena el login antes que el resto (ver sección Auth). Bajar a 1 worker solo
tiene sentido para depurar una race que sospeches propia del test.

## Proyectos

La config define el project `chromium` (y un `setup` condicional, solo cuando hay auth):

```
npx playwright test --project=chromium
```

Con una sola plataforma normalmente no necesitas el flag. Lo dejas listado por si añades navegadores
(`firefox`, `webkit`) al `playwright.config.ts`.

## Apuntar a otra URL sin tocar código

La `baseURL` se sobreescribe con `QA_BASE_URL` (por defecto SauceDemo). Útil para correr la misma
suite contra otro entorno de staging. La URL debe estar permitida en `config/allowed-targets.yaml`.

PowerShell (Windows):

```
$env:QA_BASE_URL = "https://staging.tu-app.com/"; npx playwright test
```

bash / macOS / Linux:

```
QA_BASE_URL="https://staging.tu-app.com/" npx playwright test
```

## Tests con autenticación (storageState)

Cuando el Style Contract tiene `auth.enabled: true`, el command del agente exporta
`QA_STORAGE_STATE` y la config activa el `setup` project (loguea una vez, guarda la sesión) más el
`dependency` que garantiza el orden. Para correr a mano una suite autenticada, exporta tú la variable
con la ruta del storageState:

PowerShell:

```
$env:QA_STORAGE_STATE = ".auth/user.json"; npx playwright test
```

Sin la variable, no hay setup project ni storageState: los sitios sin auth corren igual, sin romperse.

## Ver resultados y evidencia

```
npx playwright show-report .work/playwright-report   # reporte HTML nativo de Playwright
npx playwright show-trace .work/test-results/<carpeta-del-caso>/trace.zip   # trace navegable
npm run report                                        # reporte Allure enriquecido del agente
```

El reporte nativo de Playwright (`show-report`) sale en cada run. `npm run report` genera el Allure
enriquecido con trazabilidad RF-NNN, severity y evidencia del agente (ver `CLAUDE.md`, sección
"Reporte Allure PRO"). El trace navegable necesita `QA_TRACE=on` o un fallo con retry.

## Combinar filtros

Los filtros se acumulan. Casos típicos:

```
# El caso "happy path" del login, viéndolo en el navegador:
npx playwright test login.happy-path -g "happy" --headed

# Solo el smoke de checkout, repetido 3 veces para descartar flakiness:
npx playwright test -g "@smoke" checkout --repeat-each=3

# Re-correr lo que falló, en modo UI para inspeccionarlo:
npx playwright test --last-failed --ui
```

## Referencia rápida

| Quiero… | Comando |
|---|---|
| Todo | `npx playwright test` |
| Listar sin ejecutar | `npx playwright test --list` |
| Un archivo | `npx playwright test tests/e2e/login.happy-path.spec.ts` |
| Por substring de archivo | `npx playwright test login` |
| Un caso por título | `npx playwright test -g "texto del título"` |
| Un caso por línea | `npx playwright test ruta.spec.ts:23` |
| Una feature (tag) | `npx playwright test -g "@checkout"` |
| Verlo correr | `npx playwright test --headed` |
| Modo UI interactivo | `npx playwright test --ui` |
| Debug paso a paso | `npx playwright test --debug` |
| Solo lo que falló | `npx playwright test --last-failed` |
| Cazar flakiness | `npx playwright test <x> --repeat-each=5` |
| Otra URL | `$env:QA_BASE_URL="<url>"; npx playwright test` (PowerShell) |
| Reporte nativo | `npx playwright show-report .work/playwright-report` |
| Reporte Allure del agente | `npm run report` |

Referencia oficial completa: `npx playwright test --help`.
