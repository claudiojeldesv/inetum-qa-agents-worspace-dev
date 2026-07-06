# Lab 04 — TodoMVC (RETO: lo resuelves tú)

Lab-desafío. No hay pasos ni solución: aplicas todo lo de los Labs 01–03 sin red. Eliges la puerta,
acotas el alcance y produces tests verdes. Si te bloqueas, vuelve a los labs anteriores — no a una
sección de solución, porque aquí no la hay.

## Objetivo

Generar, con `ia4d-qa-automator`, una suite de tests E2E para [TodoMVC](https://todomvc.com/)
acotada por módulos, verde y con la evidencia del agente. **Tú** decides la puerta (S2, S3 o S4) y
**tú** decides qué módulos cubrir.

## Target

Una implementación de TodoMVC permitida en `config/allowed-targets.yaml`. Recomendada por estable:
`https://demo.playwright.dev/todomvc`. No tiene login: ningún reto de auth, todo el foco está en
**acotar el alcance** y en elegir la puerta adecuada.

Punto de partida opcional: [`todomvc-fd.partial.md`](todomvc-fd.partial.md) — un FD **incompleto** a
propósito. Complétalo si vas por S3, escríbete un `.feature` si vas por S2, o ignóralo si vas por S4.

## Criterios de éxito

Tu entrega cumple el reto si:

1. **Acotaste por módulos.** Lanzaste el agente con un alcance explícito (`--flows` en S4, o un
   `.feature`/FD que cubre módulos concretos en S2/S3). No exploraste a ciegas. Cubre **al menos dos
   módulos** de TodoMVC (p.ej. añadir tarea + filtros, o completar + borrar).
2. **Los tests salen verdes** con `npx playwright test`.
3. **POM por pantalla** en `tests/pages/`, locators sin CSS arbitrario.
4. **Scan de accesibilidad** (`AxeBuilder`) inyectado en cada `test()`.
5. Si elegiste S2 o S3: cada test **cita su `@criterion RF-NNN`** y el drift (si lo hay) queda
   reportado, no fabricado.
6. La sesión deja **`audit-log.json`** con la traza.

## Pistas (mínimas, no solución)

- Módulos típicos de TodoMVC: añadir, completar/toggle, filtros (All/Active/Completed),
  clear-completed, editar, borrar.
- Si el agente te pide los módulos al lanzar S4 sin acotar, es el warning esperado — dale el brief.
- No assertes el contador con igualdad de texto frágil; usa aserciones semánticas sobre la lista.

## Reto extra

Hazlo dos veces por **dos puertas distintas** (p.ej. S4 y S2) sobre los mismos módulos y compara:
mismo motor, misma salida, distinta entrada. Es la tesis de los Labs 01–03, ahora verificada por ti.

## Qué demuestras

Que sabes elegir la puerta según lo que tienes, acotar el alcance para no saturar al agente, y leer
la evidencia para confiar en lo generado. Eso es usar el agente como QA, no como botón mágico.
