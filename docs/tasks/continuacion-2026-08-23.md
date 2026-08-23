# Continuación — estado al cierre de la sesión del 2026-08-23

Documento de handoff para la sesión que retome el trabajo. Branch: `design/kernel-v2`, pusheado
completo a esta fecha. Versión del producto: `0.4.0-beta.15` + D48–D52.

## Por dónde empezar (en este orden)

1. [`CLAUDE.md`](../../CLAUDE.md) — ahora es un **mapa** (~3,5k tokens), no un compendio. Léelo entero.
2. [`docs/references/indice-defectos.md`](../references/indice-defectos.md) — el catálogo D1–D52.
   Primer sitio donde buscar cualquier D-número. Tiene guarda mecánica
   (`tests/unit/indice-defectos.test.ts`): si introduces un D53, la suite falla hasta que lo indexes.
3. [`docs/tasks/plan-gate-locators-medidos.md`](plan-gate-locators-medidos.md) — **el trabajo principal
   pendiente**, aprobado en diseño, no implementado.

## El trabajo principal: implementar el gate de locators medidos

El plan completo, con diseño (G1/G2/G3), tabla de veredictos, coste medido y **seis iteraciones de
comprobación falsables con su predicción escrita y su criterio de muerte**, está en
[plan-gate-locators-medidos.md](plan-gate-locators-medidos.md). Resumen de una línea: portar la regla
dura del walker (≥2 coincidencias → plántate) al camino del planner, donde hoy no existe y costó
6/6 specs rojos en Dolibarr con todas las puertas del producto en verde.

**Respeta el orden del §8 del plan**: G3+I4 primero (barato), G1+I1+I2 después (I2 puede MATAR G1 —
si los falsos positivos superan el umbral, G1 se degrada a should-fix y G2 no se construye), I3, G2+I5
solo si lo anterior pasó, I6 al final. El corpus de regresión está intacto en
`Demos/Presentacion/11-08/qa-automator/loop-dolibarr/` (iter1 en `.work/dolibarr/iter1/`, iter2 en
`tests/`), fuera de este repo.

## Lo demás pendiente, por prioridad

1. **Los dos defectos latentes de D45** (forma "default silencioso que apunta a otro sitio"):
   `src/scripts/run-s4-mecanico.ts:63` y `copilot/src/lean-run.ts:43`. Baratos; el segundo propaga
   contract, url y workDir desde un solo default. Contexto:
   [`docs/findings/genericidad-del-motor.md`](../findings/genericidad-del-motor.md).
2. **Los dos sitios que quedan de la gira de dominio**: `the-internet.herokuapp.com` y
   `automationexercise.com` (planner → plan de regresión 5-6 casos → iteración 1 → iteración 2, igual
   que Dolibarr). Falta darlos de alta en `config/allowed-targets.yaml` y crear su style-contract.
   **Elegir uno deliberadamente parecido a una clase ya cubierta** para medir la predicción de
   genericidad (§7 de genericidad-del-motor.md: cero o una declaración nueva, o el diseño falla).
   Medir también el **tiempo de alta** del sitio — es la métrica comercial que no se está midiendo.
3. **Los tres rojos de la iteración 2 de Dolibarr** (TC-002/TC-005: `toHaveURL` exacta contra
   paginación en query string; TC-004: nombre accesible ≠ caption visible). Causas identificadas en
   [`docs/findings/gira-dominio-mifos-dolibarr.md`](../findings/gira-dominio-mifos-dolibarr.md) §5.
   G3 e I4 del plan del gate atacan el de TC-004.
4. **Mifos X** (`demo.mifos.io`): descartado por backend 502. Antes de reintentar, comprobar el
   backend (`/fineract-provider/actuator/info`), NO la raíz — un 200 en `/` solo mide el shell Angular.
5. **D40, cabo suelto**: quitar la prosa obsoleta de `.claude/agents/ia4d-discovery-analyzer.md:169`
   y `.claude/agents/ia4d-spec-refiner.md:192` (instruyen a invocar un script a agentes sin Bash;
   el hook ya lo cubre).
6. **Defectos abiertos de fondo**: la lista completa con estado está en el índice (20 abiertos).
   Los que más se citan: D4, D13, D23, D26, D27, D33, D47 (abierto por diseño).

## Reglas operativas que esta sesión pagó por aprender (no re-descubrir)

- **Nunca truncar la salida de un comando largo** (`Select-Object -First/-Last` sobre un pipe vivo
  mata el proceso con exit -1 y deja artefactos rancios). Volcar a fichero y leer el fichero.
- **`npx` no funciona en git-bash** en esta máquina (bad interpreter) — usar PowerShell.
- **No pasar ficheros UTF-8 por `Get-Content | Set-Content`** — destroza el encoding. Editar con
  las herramientas de fichero o python con `encoding='utf-8'`.
- Los heredocs de bash con contenido complejo (comillas, `\`) fallan — usar Write o python heredoc.
- **Exportar `QA_BASE_URL` siempre** al correr specs a mano (D45 costó dos runs).
- Comprobaciones de disponibilidad **con presupuesto de espera** y contra el backend, no la raíz.
- El workspace de campo es OTRA carpeta (`Demos/Presentacion/11-08/qa-automator/*`); este repo es el
  producto. Los cambios se propagan con `npm run build:template` y `npm run build:plugin`
  (`build:template` PRESERVA `config/`: los contracts no viajan solos).
- Si hay otra sesión de Claude Code trabajando, no tocar sus ficheros.

## Estado verificado al cierre

- Suite **824/824** (65 ficheros) a la primera; healthcheck **32/32**; tsc limpio.
- Árbol limpio; todo pusheado a `inetum-qa-agents-worspace-dev/design/kernel-v2`.
- Sin publicar el plugin a ningún marketplace remoto (regla vigente).
