# Diferenciación `ia4d-qa-automator` vs el catálogo Inetum (evidencia)

> Basado en inspección del catálogo real instalado (`ia4d-expert-agents-marketplace`,
> `.claude-plugin/marketplace.json`, 22 plugins) el 2026-07-13. Responde a la consulta de I+D:
> "¿ya hay agentes que hacen esto?".

## Hallazgo

De los 22 plugins del catálogo, **solo uno está en categoría TESTING: `ia4d-testing-core`**. El
resto son expertos de framework (Angular, React, Vue, Svelte, Astro…), backend (.NET, Java, Go,
Python), UX/UI, documentación y productividad. No hay ningún agente orientado a la disciplina QA
como juez independiente. La única comparación relevante es contra `testing-core`.

## Solape real (no negarlo)

Ambos **generan tests E2E con Playwright**. `testing-core` tiene `generate-e2e`, `setup-playwright`
y un `e2e-testing-expert`. Ese es el punto de contacto que I+D detectó. Conviene reconocerlo y
reencuadrarlo, no negarlo.

## Comparación

| | `ia4d-testing-core` | `ia4d-qa-automator` |
|---|---|---|
| Qué es | "Plugin transversal de testing **agnóstico de framework**… base común para los plugins de testing de cada framework (Angular, React, Vue, Svelte)" | Agente de la **disciplina QA independiente**, multi-modo por input |
| Perspectiva | **Dev** sobre su propio código (whitebox) | **QA juez** sobre la app (greybox / black-box) |
| Entrada | El código/proyecto del dev | URL, Gherkin o FD (S2/S3/S4) |
| Único de cada uno | TDD (`tdd`, `tdd-implement`), **cobertura** de código, **CI/CD** config, **regresión visual vs Figma** | **Writer+Reviewer+Judge**, compliance pre-flight sin override, PII banca-ES, audit-log, **trazabilidad RF-NNN**, **detección de drift** spec↔app, a11y obligatorio |
| Rol en el catálogo | Infra base para los testing por framework | Herramienta autónoma del ingeniero QA |

Composición real de `testing-core` (del marketplace.json): agents `coverage-analyzer`,
`e2e-testing-expert`, `visual-regression-expert`, orquestador; commands `tdd`, `tdd-implement`,
`run-coverage`, `generate-ci-config`, `run-ci`, `setup-playwright`, `generate-e2e`,
`test-orchestrator`, `visual-snapshot`, `visual-report`.

Lo que `testing-core` hace y qa-automator **no**: TDD, coverage, CI/CD, visual-vs-Figma → flujo de
**desarrollador**. Lo que qa-automator hace y testing-core **no**: Writer/Reviewer/Judge, compliance
regulado, trazabilidad de requisitos, drift → disciplina **QA independiente**.

## Frase para I+D

testing-core es la herramienta del **dev** para testear su propio código (whitebox, TDD, coverage,
CI). qa-automator es la del **QA como juez independiente** de la app (greybox/black-box, multi-input,
con criterio Writer/Reviewer/Judge, compliance regulado y trazabilidad). Comparten que ambos tocan
Playwright E2E, pero es la misma tecnología al servicio de dos misiones incompatibles: **el dev no
puede ser juez y parte.**

## Reencuadre táctico si insisten en el solape

Si I+D insiste en "pero testing-core ya genera E2E con Playwright": la generación de E2E es
*commodity* (la hace hasta el planner nativo de Microsoft). Lo que diferencia a un producto QA no es
*generar* el test, es el **juicio alrededor**: que un Reviewer independiente lo audite, que cite un
RF, que detecte drift, que pase compliance, que deje audit trail. Eso testing-core no lo tiene
porque no es su misión.
