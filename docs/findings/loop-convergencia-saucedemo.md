# El loop de convergencia: dos iteraciones, dos verdes, tres defectos

- **Fecha**: 2026-08-21 / 22
- **Rama**: `design/kernel-v2` — arrancó en `0.4.0-beta.10`, cerró en `0.4.0-beta.11`
- **Workspace**: `loop-saucedemo/`, desplegado desde cero, healthcheck **31/31**
- **Target**: `https://www.saucedemo.com/` (S3), FD `examples/01-saucedemo/saucedemo-fd.md`
- **Por qué SauceDemo y no ParaBank**: ParaBank llevaba caída con HTTP 500 desde las 23:30 y siguió
  así (17 sondeos en 25 min, y seguía en 500 una hora más tarde)

## Las reglas, acordadas antes de empezar

Un run limpio no demuestra un producto limpio: demuestra que **ese muestreo** no tocó nada. La capa
LLM varía entre corridas, así que el criterio tenía que ser estadístico y con techo:

- **Parada**: 2 runs verdes consecutivos, con doble pasada de suite cada uno y sin must-fix nuevos.
- **Techo**: 4 iteraciones.
- **Clasificación obligatoria** de cada rojo antes de tocar nada: producto / entorno / variabilidad
  del agente. Solo el primero justifica parche; el segundo pausa; el tercero se convierte en check
  determinista o se acepta explícitamente.
- **Ningún arreglo cuenta sin test falsable.** Si no sé escribir el test que falla antes y pasa
  después, no es un arreglo: es una conjetura. Esta regla existe porque el día anterior introduje dos
  defectos con mis propios parches.

**Resultado: convergió en 2 iteraciones.** Y las dos iteraciones destaparon tres defectos, todos con
arreglo mecánico y test.

---

## Iteración 1 — verde a la primera

3/3 verdes en las dos pasadas. `tsc` exit 0, pre-review **3/3 limpios con 0 must-fix y 0 should-fix**,
a11y 3/3, `verify-locators` 16/18 verificados.

Confirmaciones de paso:

- **K0.43** — guion válido a la primera. **Sexta** confirmación de campo.
- **D34, la otra rama** — los 18 identificadores venían de verdad de `data-test`, así que el
  scaffolder emitió **18 `getByTestId` y 0 css-fallback**. El arreglo no rompe el caso correcto.
- **D25 no se reproduce aquí** — `session_bootstrap: "applied"`: SauceDemo autentica por redirección
  y la guarda de locators sí entra. Confirma que D25 es específico de apps que no redirigen.
- **D38 aguantó** — ninguno de los tres Writers editó el `discovery-report.json`.

## El hallazgo transversal: el idioma bloquea el walker en los DOS sitios

El walker cerró con **6/23 pasos, 17 bloqueados**, y `walk-to-spec` devolvió `emitted: []` con el
motivo paso por paso. Es el mismo patrón que ParaBank (2/7, 5 bloqueados), con el mismo motivo: el FD
está en español, la app en inglés, y el refiner **rehúsa traducir o inventar captions** (lo declara
por adelantado en `Q-001`).

Con esto el problema deja de ser una peculiaridad de ParaBank y pasa a ser un **hallazgo genérico
medido en dos sitios independientes**: en arranque frío, con memoria de alias vacía y un FD que no
cita captions literales, el camino determinista de coste cero **no cubre nada** y todo cae al LLM.
Es la mejor justificación que tenemos del pack de palabras por idioma.

---

## Iteración 2 — verde también, y aquí salieron los defectos

Regeneré desde el discovery-analyzer (donde vive la variabilidad) con **el prompt literalmente
idéntico**, para que fuera un muestreo justo.

### Lo que salió estable

| | it1 | it2 | ¿igual? |
|---|---|---|---|
| Nombres de pantalla | login, inventory, cart, checkout-step-one/two, checkout-complete | idénticos | **sí** |
| Escenarios | 3 | 3, idénticos | **sí** |

Eso es tranquilizador: el defecto de nombres inestables que vimos en ParaBank no se reprodujo.

### D40 — le pedí a dos agentes algo que no pueden ejecutar

El `ia4d-spec-refiner` lo dijo él mismo: *«Sin tool Bash: no pude invocar audit-mark.ts»*. Sus tools
son `Read, Write, Glob`; el `ia4d-discovery-analyzer`, igual. **Mi arreglo de D36 fue instrucción a
agentes sin manos.** Los dos lo declararon honestamente en vez de fingir.

El hook `PostToolUse` los cubre sin que ellos hagan nada — que es precisamente el argumento del
arreglo mecánico. La prosa sobra ahí y hay que quitarla.

### D34, SEGUNDA VUELTA — el arreglo del lado productor era prosa, y la prosa es una tirada

El dato es el más importante del loop. **Con el prompt idéntico**, el discovery-analyzer declaró
`test_id_attr`:

```
iteración 1:  18 de 18 elementos
iteración 2:   0 de 31 elementos
```

En SauceDemo no rompió nada porque los 31 identificadores vienen de verdad de `data-test`. **En
ParaBank habría vuelto a romper exactamente igual que antes.** Una instrucción que se cumple según la
tirada no es un arreglo.

**Arreglo mecánico**: `verify-locators` ya resuelve cada locator contra el DOM real. Ahora, cuando un
`test_id` no resuelve como testId, **le pregunta al DOM de qué atributo salió**: prueba `id`, `name`,
y las variantes de data-*, y si exactamente uno resuelve, escribe `test_id_attr` él mismo. El
scaffolder ya lo respeta, así que la cadena se autocorrige sin depender de que nadie se acuerde. Solo
acepta un candidato que resuelva a **un** elemento: dos coincidencias no identifican nada. 7 tests.

### D41 — colisión entre un locator y un componente en el POM generado

El analizador extrajo `cancel` como componente compartido **y** lo mantuvo como elemento de las dos
pantallas de checkout. El POM salió con las dos declaraciones:

```
error TS2300: Duplicate identifier 'cancel'.
error TS2717: Property 'cancel' must be of type 'Locator', but here has type 'CancelComponent'.
```

Familia de D29 (colisión de nombres en el POM generado), eje nuevo: **elemento contra componente**.
Lo cazó `MF-tsc` en el acto, que es justo para lo que está — pero el scaffolder no debería producirlo.

**Arreglo**: los componentes comparten el espacio de nombres de la clase con los locators, así que se
desempata. **Gana el locator**, porque es el nombre que el Writer escribe en el spec; el componente
pasa a `<nombre>Component`. Renombrar el locator movería el nombre que usa el test. 3 tests.

### Y una demostración de por qué los checks deterministas ganan a los avisos

El planner **advirtió en su plan** que `data-test="inventory-item"` no es único. El analizador lo
emitió igualmente como identificador de tres elementos. Y `verify-locators` los marcó
**`ambiguous(6)`** contra el DOM real, con lo que el Writer no pudo usarlos a ciegas.

El aviso en prosa no lo evitó; el check determinista sí. Ese es el patrón de todo este ciclo.

---

## Coste

| | iteración 1 | iteración 2 |
|---|---|---|
| Tiempo activo | 1h 09m | 1h 10m |
| Subagentes (8 tramos) | 39m 44s | 51m 13s |
| Esperas del orquestador | 26m 08s (37,8%) | 13m 22s (19,1%) |

**Salvedad del instrumento**: las marcas encierran los `Task` de subagentes, no el trabajo
determinista que el orquestador hace en primer plano ni la latencia de sus propios turnos. Los
minutos de «espera» son mayormente eso — tiempo real de orquestador, ~2 min por turno. Es honesto,
pero la etiqueta sigue siendo generosa conmigo.

---

## Estado

`0.4.0-beta.11` construida, payload verificado e instalada. `tsc` exit 0, **363 tests unitarios
verdes**, healthcheck 31/31.

Cerrado en este loop: **D40** (pendiente de quitar la prosa a los dos agentes sin Bash), **D34 lado
productor** (ahora mecánico), **D41**.

**Sigue pendiente y es lo primero que hay que hacer cuando ParaBank vuelva**: re-correr el S3 de
ParaBank con beta.11. Es el único sitio donde el rescate de atributo se ejercita de verdad —en
SauceDemo no hay nada que rescatar— y es donde quedó sin confirmar la pasada doble verde.

Abiertos de antes que este loop no tocó: **D23** y **D27** (el camino del panel, con `assist: true`),
**D26**, **D33** (la suite del repo no es verde de forma fiable bajo paralelismo) y la estabilidad de
nombres del discovery-analyzer, que aquí no se reprodujo pero en ParaBank sí ocurrió.
