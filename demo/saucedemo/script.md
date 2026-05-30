# Guion del demo `ia4d-qa-automator` v0.1 — SauceDemo

Demo grabable de ~5 minutos (no 30, decisión de scope MVP: velocidad + estructura como impacto). El target SDET ve un flujo lineal: input mínimo → output estructurado y verde.

## T+0:00 — Setup (slide o pantalla con código abierto)

> "Tenéis un sitio que no conocéis. Una URL. Un SDET. `ia4d-qa-automator` genera la suite E2E con compliance regulado, A11y baked-in, POM real, y un Quality layer Writer+Reviewer+Judge. Yo soy ese SDET. Vamos."

Mostrar:
- Terminal con `pwd` en el repo.
- `cat package.json | head -10` — nombre `ia4d-qa-automator`.
- VSCode abierto en la rama.

## T+0:30 — Healthcheck

```
/qa-automator:healthcheck
```

> "Smoke test: 13 subagents detectados (3 nativos + 10 propios), MCP server up, Playwright 1.60+. Listo."

## T+0:45 — Unit tests

```sh
npm test
```

> "42 tests verdes en 1.4 segundos. PII detector (DNI, IBAN, Luhn, email, teléfono ES), compliance pre-flight, judge scoring, POM scaffolder."

## T+1:00 — Compliance pre-flight (mostrar el gate)

> "Antes de ejecutar nada contra una URL, el agente valida que esté en allowed-targets. Si no — bloqueo. Sin override. Esto es regulado."

Mostrar `cat config/allowed-targets.yaml | head -20`. Saucedemo declarado.

## T+1:30 — Ejecutar el flujo S4 Autonomous

```sh
# Forma A (manual reproducible — la grabación usa esta para ser corta):
cp demo/saucedemo/expected-output/discovery-report.json discovery-report.json
npx tsx scripts/scaffold-poms.ts discovery-report.json tests/pages
ls tests/pages/
```

> "POM determinístico: 6 archivos `*.page.ts` generados por código TS, no por LLM. Velocidad."

## T+2:00 — Mostrar un POM y un spec

```sh
cat tests/pages/login.page.ts
cat tests/e2e/login.standard-user-happy-path.spec.ts
```

> "POM con métodos semánticos (`loginAs(user, pass)`). Spec con: A11y check baked-in con axe-core, locators `data-test` (Style Contract), criterion citation en JSDoc, asserts funcionales, cero waits hardcoded."

## T+2:45 — Ejecutar la suite

```sh
npx playwright test --reporter=list
```

> "Tres tests verdes en 7.2 segundos paralelos. Login + cart + checkout golden path. Cubren con axe-core que SauceDemo no tiene violaciones serious/critical en cada flujo."

## T+3:15 — Mostrar la traza

```sh
cat audit-log.json | head -20
```

> "Audit log JSON append-only por cada decisión: pre-flight allow, write_file, review_decision iteration_N, judge_decision con score, PII scan pass. Evidencia para regulador."

## T+3:45 — Mostrar el SPEC

```sh
ls SPEC.md CLAUDE.md docs/Inetum/Catalogo/ia4d-qa-automator.md
```

> "SPEC.md con marco QA propio de 5 actos, cuatro módulos (S1/S2/S3/S4 — solo S4 funcional MVP), roadmap por versiones. Ficha de catálogo Inetum en formato canónico ①-⑦."

## T+4:30 — Punto de cierre (slide)

> "Dev no puede ser juez y parte. `ia4d-testing-core` es el agente del dev sobre su código. `ia4d-qa-automator` es el agente del juez QA. Misión incompatible, no perspectiva distinta. Las herramientas QA tienen otra forma de operar."

> "MVP entregable: 1 flujo de SauceDemo verde, 3 specs estructurados, 6 POMs, capa transversal completa, Quality layer Writer+Reviewer+Judge, audit log. Wall-clock de la suite generada: 7 segundos. Coste tokens proyectado del flujo completo (con LLM): ~100k tokens según mediciones del spike. Velocidad y estructura como impacto demostrable."

> "Roadmap: v0.2 trae S3 (spec refiner para FD floppies) + TMS connectors (Jira/Xray). v0.3 trae S1/S2 (code-driven y req-driven). v0.4 trae el Context Injector como capa opcional para clientes que firmen policy específica."

## T+5:00 — Fin de grabación

## Notas para grabar

- Resolución: 1920×1080.
- Terminal: PowerShell con tema oscuro alto contraste.
- VSCode: tema Default Dark, font 14pt mínimo.
- Audio: voz directa, sin sycophancy, sin filler ("aaa", "eeem").
- Edición: cortes secos. Sin transiciones.
- Subtítulos en español.

## Variantes

- **Versión 3 min (lightning)**: T+0 → T+0:30 → T+2:00 → T+2:45 → T+4:30.
- **Versión 10 min (detail)**: añadir mostrar audit-log expandido, judge-report.json comentado, review-feedback.json con iteración 0→1, recorrido por uno de los stubs S3 explicando v0.2.
