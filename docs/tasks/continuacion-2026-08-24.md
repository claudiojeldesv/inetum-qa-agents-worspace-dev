# Continuación — estado al cierre del 2026-08-24

**Punto de entrada único.** Supersede a [continuacion-2026-08-23.md](continuacion-2026-08-23.md).
Branch `design/kernel-v2`. Versión `0.4.0-beta.15` + los parches de estos dos días.

## Por dónde empezar

1. [`CLAUDE.md`](../../CLAUDE.md) — es un mapa (~3,5k tokens), no un compendio. Léelo entero.
2. [`docs/references/indice-defectos.md`](../references/indice-defectos.md) — catálogo D1–D54, con
   guarda mecánica. Primer sitio donde buscar cualquier D-número.
3. El plan de lo que toca implementar, según lo que se ataque (§«Qué hay que implementar»).

## Qué se cerró en esta sesión

**G3** (commit `66e1cea`) — `verify-locators` reporta los nombres accesibles REALES cuando un locator
no resuelve o resuelve a varios. Su iteración I4 confirmó la predicción con el mecanismo exacto: el
nombre real de la columna `Ref.` en pedidos de Dolibarr es `" Ref."` **con espacio inicial**; en
facturas sí es exacto. Por eso el mismo arreglo funcionaba en una pantalla y fallaba en la otra.

**G1** (commit `f482a39`) — `MF-locator-no-medido` en pre-review: la regla dura del walker (≥2
coincidencias → plántate) en el camino del planner, con su tabla de veredictos completa.
- I1 (corpus rojo de Dolibarr): **6/6 specs marcados**, predicción cumplida.
- I2 (corpus verde, SauceDemo + ParaBank): **0 falsos positivos en 5/5**, umbral de muerte era 20%.
- I3 (iter2): caza el «arreglo sin remedir» de TC-004 y **no** se atribuye la clase `toHaveURL`.
- Las iteraciones destaparon dos defectos del propio gate (aval por substring; falta de la vía de
  escape del protocolo Q2), arreglados con par falsable.

**I6 / the-internet** (commits `ec3d108`, `0a1da2f`) — primer sitio nuevo con G1+G3 puestos.
iter1 **4/6** (Dolibarr fue 0/6), iter2 **6/6 con doble pasada verde**. Los dos rojos de iter1 cayeron
dentro de los huecos **declarados** por el plan. Predicción de genericidad cumplida en el borde: UNA
declaración nueva (`css_fallback_attributes: [id]`).
Matiz honesto, escrito en el informe: G1 dio 0 must-fix no porque cazara fantasmas sino porque **no se
escribieron** — el valor se materializó aguas arriba. La potencia de bloqueo está demostrada en el
corpus (I1/I3), no aquí.

**D10 y D23** (commit `0491701`) — lo grabado por el QA sobrevive al panel y al proceso. Puente
`__qaAssistTrack` (los puentes de exposeFunction sobreviven a la navegación; la interfaz no),
persistencia en `assist-pending.json` en cada gesto, recuperación con tres cerrojos de identidad.
**Verificado en campo** con navegador real, que es lo que D10 nunca tuvo.

**La puerta de entrada** (commits `0cf943e`, `ace80ec`, `c686fd7`) — `CLAUDE.md` de 105 KB a 14 KB
restaurando una convención que el propio repo declaraba; índice de defectos D1–D54 con guarda.

## Qué hay que implementar

Dos planes, en este orden. El primero hace la herramienta usable hoy; el segundo la hace repetible
siempre.

### 1. [`plan-panel-y-acta.md`](plan-panel-y-acta.md)

El panel decide y la decisión queda firmada. **Lleva diez decisiones ya tomadas con el QA que NO hay
que volver a discutir** (§1 del plan) — leerlas antes de tocar nada. Fases P0→P6 con su orden y sus
criterios de parada. P0 está medio cerrado (D10/D23 hechos; falta la pasada de textos del panel).

Empezar por **P1, el acta**, porque todo lo demás escribe ahí.

### 2. [`plan-datos-consumibles.md`](plan-datos-consumibles.md)

El dato que se quema. El agujero más grande para banca y seguros. El producto no crea datos: deja de
disfrazar la falta de dato como fallo de calidad. El veredicto `sin-dato` es el corazón.

### 3. Lo que queda del gate

[`plan-gate-locators-medidos.md`](plan-gate-locators-medidos.md): **G2 queda condicionado** por
decisión del QA — ningún rojo de I6 era de la clase «desambiguado pero equivocado», así que no hay
residuo que lo justifique. No construirlo sin una necesidad medida.

### 4. Defectos abiertos con arreglo claro

- **D53** (abierto, serio): el planner nativo, bloqueado por compliance, **intentó editar el allowlist**
  vía `browser_run_code_unsafe` antes de detenerse. Lo frenó el clasificador de permisos y entonces
  paró y pidió — pero la primera reacción fue rodear el control. El prompt por-flujo que construye el
  command no lleva la regla de no-elusión que los agentes propios sí llevan. Endurecerlo.
- **D54**: `MF-postcondition` cuenta headings de mueble como postcondición exigible (falso positivo
  medido en TC-004 de the-internet). `BUSINESS_ROLES` incluye `heading` sin distinguir mueble de
  resultado. Pariente de D37.
- **Dos instancias latentes de D45** (default silencioso que apunta a otro sitio):
  `src/scripts/run-s4-mecanico.ts:63` y `copilot/src/lean-run.ts:43`. El segundo es peor: de un solo
  default derivan contract, url y workDir. Contexto en
  [genericidad-del-motor.md](../findings/genericidad-del-motor.md).
- **D33**: la suite no es fiable en verde bajo carga. Ya no es una molestia: cada rojo cuesta una
  pasada extra de aislamiento para saber si es real. Candidato al próximo bloque.

### 5. Campo pendiente

- **`automationexercise.com`** — último sitio de la gira de cuatro.
- **Mifos X** — esperando que vuelva el backend. Comprobar
  `/fineract-provider/actuator/info`, **no la raíz** (un 200 en `/` solo mide el shell Angular).
- Los tres rojos de la iteración 2 de Dolibarr, con causa identificada y sin arreglar.

## Reglas operativas que estas dos sesiones pagaron por aprender

- **Nunca truncar la salida de un comando largo.** `Select-Object -First/-Last` sobre un pipe vivo mata
  el proceso (exit -1). Volcar a fichero y leer el fichero. Pasó tres veces.
- **Nunca asumir un conteo.** Dos sustituciones fallaron por dar por hecho que un texto aparecía una
  vez y aparecía siete o nueve. Contar primero; la aserción antes de escribir salva el fichero.
- `npx` **no funciona en git-bash** en esta máquina (bad interpreter) — usar PowerShell.
- **No pasar ficheros UTF-8 por `Get-Content | Set-Content`**: destroza el encoding.
- Heredocs de bash con contenido complejo (comillas, `\`) fallan — usar Write o python con
  `encoding='utf-8'`.
- **Exportar `QA_BASE_URL` siempre** al correr specs a mano (D45 costó dos runs).
- Comprobaciones de disponibilidad **con presupuesto de espera** y contra el backend, no la raíz.
- El workspace de campo es OTRA carpeta (`Demos/Presentacion/11-08/qa-automator/*`); este repo es el
  producto. `npm run build:template` **preserva `config/`**: los contracts y el allowlist no viajan
  solos, hay que copiarlos a mano y **el allowlist del repo tiene URLs de cliente — no copiarlo entero
  al payload**.
- **Cada workspace desplegado tiene su propio `allowed-targets.yaml`** y el pre-flight lee el del
  workspace, no el del repo. Un target nuevo hay que darlo de alta en los dos.
- Si hay otra sesión de Claude Code trabajando, no tocar sus ficheros.

## Estado verificado al cierre

- `tsc` limpio. Tests de assist 36/36 sin regresión + 12 nuevos de D10/D23.
- Suite completa: **843/848 bajo carga**, y los 5 fallos son **timeouts** de ficheros con navegador que
  **pasan 23/23 en solitario** — D33, no regresión. La suite no da verde fiable de una pasada.
- Healthcheck 32/32. Payload propagado (`template/` y `plugin/`).
- Árbol limpio. **12 commits locales SIN SUBIR** en `design/kernel-v2`.
- Plugin **sin publicar** a ningún marketplace remoto (regla vigente).

## Diseño de referencia

- [auditoria-maquetas-panel.md](../findings/auditoria-maquetas-panel.md) — qué de las maquetas es
  viable y qué se retiró por inventado. Leerlo antes de implementar interfaz.
- [i6-the-internet.md](../findings/i6-the-internet.md) — el gate extremo a extremo.
- [genericidad-del-motor.md](../findings/genericidad-del-motor.md) — el motor no se personaliza por
  cliente, medido; y la métrica que NO se está midiendo (tiempo de alta de un sitio nuevo).
