---
description: Ejecuta una regresión con el walker determinista y CONDUCE el rescate: cuando el walker no sabe resolver un paso, se para en el sitio y tú le contestas el locator mirando su snapshot. Sin morirse, sin replay. Termina con parche anunciado y acta.
argument-hint: "--script=<guion.walk.json> --base-url=<URL> [--contract=<c.yaml>] [--work-dir=<dir>] [--rescue-budget=3] [--criterios=<criteria.json>] [--headed]"
---

# /ia4d-qa-automator:regression

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que abra su workspace desplegado y detente.

Ejecuta un **walk-script** (regresión determinista, 0 tokens de LLM en el motor) y **conduce el rescate**:
cuando el walker no consigue resolver el elemento de un paso, escribe una petición con el snapshot de la
pantalla, **se queda esperando en la misma pantalla**, y tú le contestas. Sin `exit 42`, sin replay del
flujo. Medido en campo antes de existir este command (EspoCRM): **84/89 pasos, cinco peticiones, cero
relanzamientos**; y la cadena de tres puertas de `cp009` se abrió con **un** rescate.

**Lo mecánico lo encadena `src/scripts/run-regresion-mecanico.ts`** en 5 stages (misma convención que
`run-heal-mecanico`: exit 0 = continúa · 2 = aborta · 3 = hay algo que decidir). **Tú conservas una sola
cosa: el locator.** Nada más de este command es tu criterio.

> ## LA REGLA QUE GOBIERNA ESTE COMMAND: NO SONDEES
>
> El coste del orquestador es `turnos × contexto acumulado` — medido: el 74% del coste de un run. Un
> turno que dice «sigo esperando» no decide nada y paga el contexto entero.
>
> **`esperar` BLOQUEA por ti.** Vuelve solo cuando hay una petición que contestar (exit 3) o cuando el
> run terminó (exit 0). **Nunca** hagas un bucle de `ls`, `cat rescue-request.json` o «voy a comprobar si
> ya hay algo»: llama a `esperar`, y cuando vuelva, actúa. Un rescate = un turno.
>
> Si `esperar` devuelve `pending: "cap-agotado"`, **no ha pasado nada malo**: el run es largo y sigue
> vivo. Vuelve a llamar a `esperar`. No mires el log «por si acaso».

## Arguments

- `--script=<path>` (obligatorio): el walk-script a ejecutar.
- `--base-url=<URL>` (obligatorio): entorno **no productivo**. Pasa por el pre-flight de compliance, que
  **no tiene override** (regla dura #3).
- `--contract=<path>` (opcional): Style Contract del sitio. Sin él, defaults del kernel.
- `--work-dir=<dir>` (opcional, default `.work/<site_id>`): dónde viven los artefactos del run.
- `--rescue-budget=<n>` (opcional, default 3): cuántos rescates como máximo. **Con 0 no hay nada que
  conducir** y el stage lo rechaza: para un run sin IA, lanza el walker a pelo o usa el panel asistido.
- `--criterios=<path>` (opcional): `criteria.json` del FD, para que el informe cite `fichero.md:línea`.
- `--headed` (opcional): navegador visible. Útil cuando el QA quiere mirar.

**Por qué `node node_modules/tsx/dist/cli.mjs` y no `npx tsx`** (no lo "limpies"): en Windows `npx` es un
`.cmd` y obliga a pasar por el shell. Con shell, un `--locator="getByRole('combobox').filter({ hasText:
'Suite' })"` acabó en `"C:\Program" no se reconoce` y el log del walker salió a **cero bytes** (D96). Sin
shell los argumentos llegan literales.

## Procedure

### 1. Setup (compliance sin override + canal declarado)

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts setup --script=<script> --base-url=<url> [--contract=<c>] [--work-dir=<dir>]
```

- **Exit 2** → target bloqueado por compliance. **Aborta** y di la razón y la regla. No hay flag que lo salte.
- **Exit 3** con `pending: "compliance-warn"` → muestra el motivo al QA y **pregunta**. Si acepta,
  re-invoca con `--warn-acknowledged`.
- **Exit 0** → el JSON trae `site_id`, `work_dir`, `flujos`, `pasos` y el `canal`. **Usa ESAS rutas** en
  los stages siguientes.

Agrupa esta llamada con la del paso 2 en un solo turno: entre las dos no hay ninguna decisión tuya.

### 2. Arrancar el walker en segundo plano

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts arrancar --work-dir=<dir> --base-url=<url> [--contract=<c>] [--rescue-budget=3] [--criterios=<c>] [--headed]
```

Devuelve `pid`, `log` y los argumentos exactos. El walker queda **detached**: sobrevive al final de tu
turno, que es todo el punto — su navegador tiene que seguir en la misma pantalla cuando vuelvas.

### 3. Esperar (aquí se te devuelve el control solo si hay algo que hacer)

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts esperar --work-dir=<dir>
```

Tres desenlaces:

| | Qué significa | Qué haces |
|---|---|---|
| **Exit 3** `pending: "rescate"` | el walker está parado en un paso y te pide el locator | paso 4 |
| **Exit 0** `terminado: true` | el run acabó (bien o con pasos bloqueados) | paso 5 |
| **Exit 3** `pending: "cap-agotado"` | run largo, sigue vivo, sin peticiones | **vuelve a llamar a `esperar`** |

### 4. Contestar el rescate — TU ÚNICO JUICIO

El JSON del paso 3 te da todo lo que necesitas y **no hace falta abrir ningún fichero más**: `paso`,
`action`, `hint`, `scope`, `budget_remaining`, `instructions` (la gramática permitida, escrita por el
propio motor) y el `aria_snapshot` **ya podado** a la vecindad del elemento.

Decide leyendo el snapshot, y responde con **una** de las dos formas:

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts responder --work-dir=<dir> --locator="getByRole('link', { name: 'Book now' }).nth(0)"
```

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts responder --work-dir=<dir> --declinar --motivo="en el snapshot no hay ningún control con ese nombre ni equivalente"
```

**Las reglas del juicio, y son duras:**

1. **Si no está en el snapshot, DECLINA.** No inventes un locator «que probablemente exista». El paso
   queda bloqueado con tu motivo, que es un desenlace correcto y útil; un locator inventado que resuelve
   otro elemento es un verde falso que llega a producción. El motor mismo te lo dice en `instructions`.
2. **Nunca respondas lo que el hint ya expresaba.** Si eso hubiera resuelto, no habría rescate.
3. **Si hay varios candidatos indistinguibles y `scope` no los separa, declina.** Elegir a ciegas entre
   cuatro «Book now» es adivinar; esa decisión es del QA con el panel, no tuya.
4. **`--declinar` exige `--motivo`.** Un `locator=null` sin motivo no sirve aguas abajo: queda en el
   informe y nadie sabe qué mirar.

**Comilla siempre `--locator=` y `--motivo=`** (`--motivo="no está en el snapshot"`).

**Contestar es irreversible**: gasta un rescate del presupuesto y el walker actúa. Si solo quieres
comprobar que la forma del locator es válida, añade **`--dry-run`** (no escribe nada). Contestar dos veces
el mismo paso se rechaza; para rectificar de verdad, `--rehacer`. Medido en el estreno: se gastó un
rescate del presupuesto en una sonda (D97).

**Si el locator matchea VARIOS elementos, el walker bloquea el paso** y no lo aplica al primero (D95). No
es un fallo del motor: es que la respuesta era una adivinanza. Vuelve con un locator que distinga, o
declina.

El stage **valida la gramática antes de escribir** (lista blanca de D20). Si te rechaza el locator
(exit 1), corrige la forma — no reintentes lo mismo. Las posiciones se expresan con el sufijo
`.nth(N)` pegado al segmento, nunca como un segmento propio.

Tras responder, **vuelve al paso 3**. El walker reintenta el paso y sigue desde ahí.

### 5. Cierre

```
node node_modules/tsx/dist/cli.mjs src/scripts/run-regresion-mecanico.ts cierre --work-dir=<dir>
```

Retira el canal y devuelve `stats`, `bloqueados`, `rescates`, `assist_patch` y `siguientes` — los comandos
de revisión **ya rellenos**. Preséntalos al QA tal cual.

### 6. Reporta al QA

Un mensaje corto, en este orden:

1. **Resultado**: pasos ok / total, y bloqueados si hay.
2. **Qué rescataste**: un renglón por rescate — paso, locator dado, o el motivo de la declinación.
3. **Lo que NO se guarda solo**: si `assist_patch > 0`, dilo con el comando de fusión — lo enseñado
   muere en un fichero si nadie lo funde (esa es la lección del fleco de la Fase 2).
4. **El acta**: `check-decisions` si hubo veredictos firmados.

**No adornes.** Si declinaste tres de cuatro rescates, el titular es que el guion o el sitio no dan la
información, no que «el run se completó con asistencia».

## Boundaries

- **No toca el guion.** Lo que aprendas se propone en `assist-patch`; fundirlo se aprueba aparte.
- **No decide veredictos de postcondición.** Si un `expect_text` no se cumple, eso es del QA con el panel
  de veredicto (`--assist`), no de este camino.
- **No se combina con `--assist`.** Panel humano e IA son caminos distintos por diseño; este command es
  el de la IA.
- **Regla dura #5 intacta**: el walker escribe un fichero y espera un fichero. No habla con ningún LLM;
  el LLM eres tú, desde fuera.
