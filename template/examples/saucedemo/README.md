# Ejemplo S2/S3/S4 — SauceDemo (e-commerce limpio: 3 casos, 3 puertas, todo verde)

[SauceDemo](https://www.saucedemo.com/) es un e-commerce de práctica de Sauce Labs. Es el
target ideal para ver las **tres puertas de entrada al mismo motor** sin la complejidad de
ParaBank (sin auth-setup, sin estado de sesión server-side, sin drift): tres casos claros que
salen verdes desde cualquiera de las puertas. Las credenciales de test
(`standard_user` / `secret_sauce`, `locked_out_user` / `secret_sauce`) ya están declaradas en
`config/allowed-targets.yaml` (no son PII).

Los 3 casos:
- **Login válido** — `standard_user` entra y ve el listado de productos.
- **Login bloqueado** (negativo) — `locked_out_user` es rechazado con mensaje de error.
- **Checkout** — añadir un producto y completar la compra hasta la confirmación.

Inputs incluidos:
- [`saucedemo.feature`](saucedemo.feature) — Gherkin maduro (cada Scenario declara su `Then`, incluido el negativo). Input de **S2**.
- [`saucedemo-fd.md`](saucedemo-fd.md) — Documento Funcional en prosa libre, sin RF-NNN. Input de **S3**.

## S4 — Autónomo (solo URL)

El modo S4 no necesita ningún input más que la URL: el agente descubre la web, mapea pantallas
y flujos, y genera tests Playwright con POM y A11y baked-in.

```
/qa-automator:autonomous --url=https://www.saucedemo.com/
```

Opcional, para acotar el reconocimiento a flujos concretos (más rápido, menos tokens):

```
/qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
```

## S2 — Req-driven (desde Gherkin)

El `.feature` ya tiene los `Then`. El parser determinístico lo convierte a criterios RF-NNN,
el agente los mapea contra el DOM y genera tests con trazabilidad `@criterion`.

```
/qa-automator:req-driven --gherkin=examples/saucedemo/saucedemo.feature --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

Qué observar: el scenario `login-locked` es un **caso negativo** — el test pasa afirmando el
mensaje de error de usuario bloqueado, no por ausencia del listado de productos. El autor
declara el `Then` de error en el `.feature`; el motor no lo inventa.

## S3 — Spec-refiner (desde FD en prosa)

El FD no tiene identificadores ni `Then` explícitos. El refiner lo estructura en RF-NNN, mapea
contra el DOM y genera tests con `@criterion`.

```
/qa-automator:spec-refiner --fd=examples/saucedemo/saucedemo-fd.md --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

Qué observar: a diferencia del FD de ParaBank, este no trae ambigüedad ni flujos no expuestos —
los tres criterios son claros y mapeables, así que ninguno queda bloqueado en
`refinement-questions.md` y no hay `drift-report`. Mismo resultado que S2, distinta puerta.

## Verás

- Un POM por pantalla en `tests/pages/`.
- `.spec.ts` con `AxeBuilder` (scan a11y) inyectado al inicio de cada `test()`.
- En S2/S3, cada test cita su `@criterion RF-NNN`.
- `audit-log.json` con la traza de la sesión.

## Nota sobre auth concurrente

SauceDemo **no** necesita auth-setup project: no mata sesiones server-side y los casos de login
prueban el login mismo. Cada test se loguea en su propio flujo. No necesitas `--workers=1` ni
`QA_STORAGE_STATE`. El style-contract `config/style-contracts/saucedemo.yaml` deja `auth` desactivado a
propósito. (Para el contraste con auth persistente, mira el ejemplo de ParaBank.)
