# Ejemplo S4 — SauceDemo (autónomo, solo URL)

[SauceDemo](https://www.saucedemo.com/) es un e-commerce de práctica. El modo S4 no
necesita ningún input más que la URL: el agente descubre la web, mapea pantallas y flujos,
y genera tests Playwright con POM y A11y baked-in.

## Ejecutar

```
/qa-automator:autonomous --url=https://www.saucedemo.com/
```

Opcional, para acotar el reconocimiento a un flujo concreto (más rápido, menos tokens):

```
/qa-automator:autonomous --url=https://www.saucedemo.com/ --flows=login,checkout
```

## Qué pasa

Los 5 actos del marco QA: Comprender (compliance pre-flight valida la URL contra
`config/allowed-targets.yaml`) → Mapear (planner nativo explora) → Estructurar (POM
determinístico) → Materializar (Writer genera el `.spec.ts`) → Juzgar (Reviewer audita
al Writer; Judge solo si `QA_ENABLE_JUDGE=1`).

Los tests salen en `tests/e2e/`. Las credenciales de test de SauceDemo ya están
declaradas en `config/allowed-targets.yaml` (no son PII).

## Verás

- Un POM por pantalla en `tests/pages/`.
- `.spec.ts` con `AxeBuilder` (scan a11y) inyectado al inicio de cada `test()`.
- `audit-log.json` con la traza de la sesión.
