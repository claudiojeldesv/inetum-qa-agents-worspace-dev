# Labs — `ia4d-qa-automator`

Cuatro labs reproducibles, ordenados por dificultad. Cada carpeta es **un proyecto distinto** y
trae solo **inputs**: los tests los genera el agente cuando ejecutas el command, así practicas el
flujo real en vez de copiar un resultado. Hazlos en orden si es tu primera vez.

> **Antes de nada — prepara el workspace una vez.** Desde la raíz (la carpeta `template/` que
> descargaste): `npm install` → `npx playwright install chromium` → `npm run qa:healthcheck` (debe
> dar `Healthcheck OK`). Sin esto, el agente no funciona. El detalle paso a paso está en el
> **Paso 0** del [Lab 01](01-saucedemo/).

| # | Lab | Modos | Qué aprendes | Auth | Drift |
|---|---|---|---|---|---|
| 01 | [SauceDemo](01-saucedemo/) | S2, S3, S4 | Las tres puertas sobre e-commerce limpio. Todo verde, sin complejidad. | — | — |
| 02 | [ParaBank](02-parabank/) | S2, S3, S4 | Auth persistente, drift bidireccional y refinamiento de ambigüedad. | Sí (JSP) | Sí |
| 03 | [OrangeHRM](03-orangehrm/) | S4 (S2/S3 opc.) | Autónomo acotado por módulos sobre una SPA con sesión persistente. | Sí (SPA) | — |
| 04 | [TodoMVC](04-todomvc/) | Tú eliges | **Reto**: sin pasos ni solución. Acotas, eliges puerta, entregas verde. | — | — |

## Orden recomendado

1. **01-SauceDemo** — entiende las tres puertas (S4 autónomo, S2 Gherkin, S3 FD) y la evidencia que
   deja el agente, sin auth ni drift que distraigan.
2. **02-ParaBank** — añade sesión persistente, detección de drift y ambigüedad. La tesis del producto:
   el agente no fabrica lo que no existe.
3. **03-OrangeHRM** — segundo patrón auth (SPA), con foco en **acotar por módulos** en el autónomo.
4. **04-TodoMVC** — el reto. Aplicas todo lo anterior tú solo.

## Apuntar el agente a TU web

Añade el patrón URL de tu entorno **no productivo** a `config/allowed-targets.yaml`, declara las
credenciales de test si las usa, y lanza `/qa-automator:autonomous --url=<tu-url> --flows=<módulos>`.
Acota siempre por módulos: ver [CLAUDE.md](../CLAUDE.md), regla del autónomo.
