# Manual — probar Kernel v2 K0 en otro workspace

**Verificado end-to-end el 2026-07-31** contra `C:\Users\claudio.jeldes\Desktop\Inetum\ws-kernel-v2`
(clon limpio de `design/kernel-v2` @ `871fdcb`). Todos los comandos de aquí se ejecutaron y su salida
real está transcrita. Todo lo de este manual cuesta **$0 en tokens** — no invoca ningún LLM.

---

## 0. Elige el escenario correcto (lee esto primero)

Hay una asimetría que decide el montaje: **el walker NO viaja al template.**

`npm run build:template` copia `src/`, `hooks/`, `docs/references/` y `tests/unit/`. La carpeta
`copilot/` —donde viven `dom-walker.ts`, `walk-core.ts`, `lean-run.ts` y los fixtures— **no está en
`COPY_DIRS`** ([build-template.mjs:37](../../src/scripts/build-template.mjs)).

| Quieres probar | Escenario | Qué necesitas |
|---|---|---|
| K0 completo (walker, expects, aliases, normalizador, gate) | **A — clon del branch** | este repo, rama `design/kernel-v2` |
| Solo lo que ya llega al template (`MF-postcondition`, `frameLocator`, business_text aguas abajo) | **B — workspace del template** | `template/` desplegado |

Para validar K0 quieres el **escenario A**. El B sirve para comprobar que la propagación al cliente
no rompió nada.

> **Fleco conocido**: `template/package.json` declara el script `build:hooks:copilot` que apunta a
> `copilot/hooks/` — una carpeta que el template no tiene. El script falla si se invoca allí. No
> afecta a nada de K0 (los hooks de Copilot solo se usan en VS Code); anotado para K1, cuando el
> kernel se extraiga a paquete y esto se resuelva de raíz.

---

## Escenario A — clon del branch (K0 completo)

### A.1 Crear el workspace

**Usa una ruta CORTA.** Un `git clone` a la carpeta de scratchpad falla con
`Filename too long` (límite MAX_PATH de Windows en los objetos del `.git`). Directorio hermano del
repo, como en Fase A-bis:

```bash
git clone --branch design/kernel-v2 --single-branch "C:/Users/claudio.jeldes/Desktop/Inetum/inetum-qa-agents-workspace-ai4dev" "C:/Users/claudio.jeldes/Desktop/Inetum/ws-kernel-v2"
```

Confirma que estás en el commit correcto:

```bash
git -C "C:/Users/claudio.jeldes/Desktop/Inetum/ws-kernel-v2" log --oneline -1
```

Debe decir `871fdcb feat(kernel-v2): fase K0 — ...`.

### A.2 Dependencias: junction (rápido) o `npm ci` (fiel)

**Junction** — reusa el `node_modules` del repo, instantáneo. Suficiente para todo K0
(verificado: healthcheck 26/26, 306 tests, walk live):

```bash
cmd //c mklink /J "C:\Users\claudio.jeldes\Desktop\Inetum\ws-kernel-v2\node_modules" "C:\Users\claudio.jeldes\Desktop\Inetum\inetum-qa-agents-workspace-ai4dev\node_modules"
```

**`npm ci`** — instalación propia (más lento, ~minutos). Úsalo si quieres medir el arranque real de
un cliente o si vas a tocar dependencias:

```bash
npm ci && npx playwright install chromium
```

### A.3 Red estructural (antes de tocar nada)

Desde el workspace nuevo:

```bash
npx tsx src/scripts/healthcheck.ts
```

Esperado: `Healthcheck OK: runtime de ia4d-qa-automator completo (26 comprobaciones).`

> **Si falla `MCP run-test-mcp-server arranca` en la PRIMERA ejecución**: es un falso negativo por
> `npx` frío (el check tiene timeout de 60 s y la primera resolución en un workspace nuevo lo agota).
> Vuelve a lanzarlo y pasa. Reproducido y confirmado como transitorio.

```bash
npx vitest run
```

Esperado: `Test Files 20 passed (20) · Tests 306 passed (306)`.

```bash
npx tsc --noEmit
```

Esperado: sin salida (limpio). En un clon fresco esto está verde porque `tests/e2e/` y `tests/pages/`
están gitignored y llegan vacíos — ver la nota de A.7.

### A.4 Etapa `gate` — compliance antes de gastar LLM (K0.8)

Target permitido:

```bash
npx tsx copilot/src/lean-run.ts gate --site=saucedemo --url=https://www.saucedemo.com/ --work-dir=.work/prueba
```

Esperado: `"verdict": "pass"` y `next` apuntando al refiner. Exit 0.

Target NO declarado — la mitad que importa:

```bash
npx tsx copilot/src/lean-run.ts gate --site=saucedemo --url=https://evil.example.com/ --work-dir=.work/prueba
```

Esperado: `"verdict": "block"`, `"rule": "C1"`,
`"reason": "URL not declared in allowed-targets.yaml patterns"`, **exit code 2**. Sin override: no
hay flag que lo salte.

### A.5 Walk live + `business_text` (K0.2, K0.3)

```bash
npx tsx copilot/src/dom-walker.ts --script=copilot/fixtures/saucedemo.lean.walk.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/prueba
```

Esperado: `7 pantallas, 16/16 pasos, 0 rescates, 0 bloqueados`.

El gate de K0 es que la postcondición de negocio esté capturada. Compruébalo:

```bash
npx tsx -e "const m=require('./.work/prueba/dom-map.json'); for (const s of m.screens) for (const b of (s.business_text??[])) console.log(s.name, '|', b.name, '|', b.locator_candidates[0]);"
```

Esperado exactamente:
`checkout-completado | Thank you for your order! | getByTestId('complete-header')`

Ese texto es lo que el walker era **estructuralmente ciego** a ver antes de K0 (texto no
interactivo, sin rol ARIA), y es la razón por la que el checkout cerraba sobre `backToProducts`.

**Determinismo** (requisito duro): corre el mismo comando otra vez y diffea ignorando el timestamp:

```bash
cp .work/prueba/dom-map.json .work/prueba/run1.json
npx tsx copilot/src/dom-walker.ts --script=copilot/fixtures/saucedemo.lean.walk.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/prueba
diff <(grep -v generated_at .work/prueba/run1.json) <(grep -v generated_at .work/prueba/dom-map.json) && echo "DETERMINISMO OK"
```

### A.6 Drift FD↔app — la tesis de K0.2

Esto es lo más valioso que probar: el walk detectando que **el FD miente**, a $0, antes de generar
un solo test.

Copia el fixture y añádele una postcondición que la aplicación no muestra (simula un FD
desactualizado):

```bash
npx tsx -e "const fs=require('fs'); const w=JSON.parse(fs.readFileSync('copilot/fixtures/saucedemo.lean.walk.json','utf8')); const compra=w.flows.find(f=>f.flow==='compra'); compra.steps.push({id:'s99',action:'expect_text',value:'Le enviaremos un correo de confirmacion'}); fs.mkdirSync('.work/drift',{recursive:true}); fs.writeFileSync('.work/drift/walk-script.json', JSON.stringify(w,null,2));"
```

Corre el walker sobre ese guion:

```bash
npx tsx copilot/src/dom-walker.ts --script=.work/drift/walk-script.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/drift
```

Esperado: `16/17 pasos, 1 bloqueado`. Y en `open_questions`:

```bash
npx tsx -e "const m=require('./.work/drift/dom-map.json'); console.log(JSON.stringify(m.open_questions,null,2));"
```

Debe traer `"reason": "drift: postcondición del FD no observada — texto '...' no visible"` y
`"rescue_attempted": false` — **no se gastó rescate**, porque no es un problema de locator: es un
hallazgo QA sobre el documento.

### A.7 `MF-postcondition` — el check con dientes (K0.7)

Necesitas el discovery (el adapter + verify-locators). Pipeline completo con `prepare`:

```bash
npx tsx copilot/src/lean-run.ts prepare --site=saucedemo --url=https://www.saucedemo.com/ --work-dir=.work/prueba
```

En la salida verifica tres campos:
- `"walk_source": "fixture"` (aquí sí, porque no hay refiner en esta prueba; en un run real con
  refiner debe decir `"refiner"`)
- `business_text` con el `"Thank you for your order!"`
- `fd_drift: []` (vacío con el fixture bueno)

> **Aviso importante**: `prepare` **borra y regenera** `tests/e2e/<site>`, `tests/pages/<site>` y
> `tests/components/<site>` (limpieza de namespace, fix de Q1 — los POMs stale eran un hallazgo
> real). Si tenías specs de un run anterior con métodos que el Writer añadió al POM (`login()`,
> etc.), quedan huérfanos y `tsc` se pone rojo. En un clon limpio no pasa; en tu workspace de
> trabajo, sí. No es un bug: es el precio de que el esqueleto solo declare lo que el discovery
> vigente vio.

Ahora fabrica los dos specs que discriminan — uno cierra sobre chrome, otro sobre el negocio:

```bash
mkdir -p .work/prueba/specs-check
```

`.work/prueba/specs-check/chrome.spec.ts` (el defecto real de Fase A):

```ts
import { test, expect } from '@playwright/test';
import { CheckoutCompletadoPage } from '../../../tests/pages/saucedemo/checkout-completado.page';

test('compra completa -> muestra confirmacion', async ({ page }) => {
  const p = new CheckoutCompletadoPage(page);
  await page.goto('/checkout-complete.html');
  await expect(p.backToProducts).toBeVisible();
  await expect(p.backToProducts).toBeEnabled();
});
```

`.work/prueba/specs-check/negocio.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { CheckoutCompletadoPage } from '../../../tests/pages/saucedemo/checkout-completado.page';

test('compra completa -> muestra confirmacion', async ({ page }) => {
  const p = new CheckoutCompletadoPage(page);
  await page.goto('/checkout-complete.html');
  await expect(page.getByText('Thank you for your order!')).toBeVisible();
});
```

Pásales el pre-review **con** el discovery:

```bash
npx tsx src/scripts/pre-review.ts .work/prueba/specs-check --style-contract=config/style-contracts/saucedemo.yaml --discovery-report=.work/prueba/discovery-report.json --out-dir=.work/prueba/pre-review-check
```

Esperado en `dirty_specs`: `chrome.spec.ts` con `MF-postcondition` (además de MF-4/MF-5, que son axe
y `@criterion` — normal, estos specs de prueba no los llevan), y `negocio.spec.ts` **sin**
`MF-postcondition`.

La prueba de que el check no es cosmético — quítale el discovery y el must-fix desaparece:

```bash
npx tsx src/scripts/pre-review.ts .work/prueba/specs-check --style-contract=config/style-contracts/saucedemo.yaml --out-dir=.work/prueba/pre-review-sin-disc
```

Sin `--discovery-report` no hay postcondición conocida, así que el check **no aplica** (no se
inventan exigencias). Es deliberado.

### A.8 Ciclo de memoria: rescate → alias → gratis para siempre (K0.5)

Lo más difícil de creer del diseño y lo más fácil de comprobar. Fabrica un hint irresoluble
(simula un FD que llama al botón distinto que la app):

```bash
npx tsx -e "const fs=require('fs'); const w=JSON.parse(fs.readFileSync('copilot/fixtures/saucedemo.lean.walk.json','utf8')); w.flows[0].steps[2].hint.name='Entrar al sistema'; fs.mkdirSync('.work/alias',{recursive:true}); fs.writeFileSync('.work/alias/walk.json', JSON.stringify(w,null,2));"
```

**Paso 1 — el walker se para y pide ayuda:**

```bash
npx tsx copilot/src/dom-walker.ts --script=.work/alias/walk.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/alias --aliases=.work/alias/hint-aliases.json
```

Esperado: `RESCATE PENDIENTE inicio-sesion/s3` y **exit code 42**. Mira lo que dejó para el LLM:

```bash
npx tsx -e "const r=require('./.work/alias/rescue-request.json'); console.log('presupuesto:',r.budget_remaining); console.log(r.aria_snapshot.split('\n').slice(0,8).join('\n'));"
```

Es un snapshot ARIA **podado** (~120 líneas máx) — por eso el rescate es una micro-llamada de
céntimos, no un agente en bucle.

**Paso 2 — simula la respuesta de Haiku** (en un run real la escribe el subagent).

Ojo con el quoting: el locator lleva comillas simples dentro de un string JSON, y un `npx tsx -e`
con comillas anidadas se rompe en PowerShell. La forma fiable, en PowerShell (`''` escapa la comilla
simple dentro de un string literal):

```powershell
'{"step":"s3","locator":"getByTestId(''login-button'')"}' | Set-Content -Encoding utf8 .work/alias/rescue-response.json
```

> `Set-Content -Encoding utf8` en Windows PowerShell 5.1 escribe **BOM**. Da igual: el walker es
> tolerante al BOM desde K0.9 (`parseJsonLoose`) — de hecho este comando es el que destapó ese bug.
> Antes del fix, el run moría con `fallo de ejecución: Unexpected token` y el paso quedaba bloqueado
> sin decir por qué.

**Paso 3 — reanuda** (mismo comando; los flujos completos se saltan, el flujo en curso se replayea):

```bash
npx tsx copilot/src/dom-walker.ts --script=.work/alias/walk.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/alias --aliases=.work/alias/hint-aliases.json
```

Esperado: `16/16 pasos, 1 rescates, 0 bloqueados`, exit 0. Y el alias promovido:

```bash
cat .work/alias/hint-aliases.json
```

Debe traer la clave `|button|entrar al sistema||` (hint normalizado: sin acentos, minúsculas) con el
locator, el hint original y su `origin`.

**Paso 4 — la prueba del ahorro.** Corre otra vez, en un work-dir **nuevo** (run desde cero), pero
apuntando al mismo fichero de aliases:

```bash
npx tsx copilot/src/dom-walker.ts --script=.work/alias/walk.json --contract=config/style-contracts/saucedemo.yaml --work-dir=.work/alias2 --aliases=.work/alias/hint-aliases.json
```

Esperado: `16/16 pasos, **0 rescates**`. Confírmalo en la auditoría — `audit-log.json` es **JSONL**
(un objeto JSON por línea, append-only), no un array, así que se consulta con grep:

```bash
grep -o "alias-hit[^\"]*" .work/alias2/audit-log.json
```

Debe imprimir `alias-hit s3: getByTestId('login-button')`. **Ese sinónimo no se vuelve a pagar
nunca** en este sitio — es el mecanismo por el que la app 47 del cliente sale casi gratis.

> En producción el fichero va a `config/hint-aliases/<site>.json` (default sin `--aliases`), que es
> **versionable y revisable por PR**: la semilla del client pack.

### A.9 Normalizador de acentos (K0.1) — sin navegador

El caso real de onesait, en unit test:

```bash
npx vitest run copilot/tests/walk-core.test.ts
```

Cubre `GESTIÓN` ≡ `gestion`, `Simulación/Declaración Rescates` en ambas direcciones, escape de
metacaracteres y la clave de alias. 37 tests.

### A.10 frameLocator (K0.4) — sin navegador

```bash
npx vitest run tests/unit/pom-scaffolder.test.ts
```

Los cuatro tests nuevos verifican `page.frameLocator('iframe[name="pago"]').getByRole(...)`, el
encadenado en iframes anidados, test_id dentro de frame, y que `role: 'text'` emite `getByText` y no
`getByRole('text')`.

### A.11 Tolerancia al BOM (K0.9) — sin navegador

Los tres contratos que el walker LEE de otros (`walk-script.json` del refiner,
`rescue-response.json` del rescate, `hint-aliases.json` del pack) los puede escribir un subagente en
Windows con BOM. Antes de K0.9 eso tumbaba el run con un diagnóstico que no señalaba la causa.

```bash
npx vitest run copilot/tests/walk-core.test.ts -t parseJsonLoose
```

Para verlo end-to-end: el paso 2 de A.8 escribe el `rescue-response.json` **con BOM a propósito**
(`Set-Content -Encoding utf8`), y el run reanuda igual.

---

## Escenario B — workspace del template (lo que llega al cliente)

Comprueba que la propagación no rompió nada. Desde el repo:

```bash
npm run build:template
```

Luego, en `template/`:

```bash
npx vitest run tests/unit/pre-review.test.ts tests/unit/pom-scaffolder.test.ts
npx tsx src/scripts/healthcheck.ts
```

Lo que **sí** puedes probar aquí: `MF-postcondition` (pasando un `discovery-report.json` que ya
tengas), `frameLocator`, y el manejo de `role: 'text'` en verify-locators y el scaffolder.

Lo que **no**: nada del walker (`gate`, `expect_*`, aliases, normalizador) — no está en el template.
Si quieres que el cliente lo tenga, es trabajo de K1 (extracción del kernel a paquete).

---

## Qué NO prueba este manual

- **El gate completo de K0**: falta el run del Writer (~$1,6 de Sonnet) que produce los 3 specs y
  demuestra 3/3 verdes con el checkout asertando el negocio. Ese run es interactivo y lo ejecuta el
  QA; con `MF-postcondition` activo ahora sí prueba algo.
- **El refiner emitiendo el guion de verdad**: A.6/A.7 usan guiones fabricados a mano para aislar el
  walker. Verificar que Haiku emite `walk-script.json` bien formado (y que un `then` `[AMBIGUO]`
  **no** produce `expect_text`) exige invocar al refiner — es el otro touchpoint LLM.
- **Kerberos/Nace, proxy corporativo real y el caos de PRE**: solo se validan en el cliente (§14 del
  [spec](../SPEC-kernel-v2.md)).

## Limpiar

```bash
rm -rf "C:/Users/claudio.jeldes/Desktop/Inetum/ws-kernel-v2"
```

(Si usaste junction, borrar la carpeta no toca el `node_modules` del repo — un junction es un enlace,
y `rm -rf` en Git Bash lo elimina sin seguirlo. Si prefieres asegurar:
`cmd //c rmdir "C:\...\ws-kernel-v2\node_modules"` antes.)
