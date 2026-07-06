# Lab 07 — Incremental: la spec evoluciona, el agente aplica solo el delta

El ciclo de vida real de una suite: generaste tests desde un FD, el producto avanza, llega el
FD v2. No quieres regenerar la suite entera (perderías las correcciones del healer y las revisiones
ya pagadas); quieres que el agente **detecte qué cambió** y toque solo eso.

**Duración estimada**: 20-30 min. **Requiere**: haber completado el **Paso 3 del Lab 01** (puerta
S3 con `saucedemo-fd.md`) en este mismo workspace — ese run deja dos cosas que este lab necesita:
la suite generada en `tests/e2e/saucedemo/` y el baseline de criterios en
`config/criteria-baseline/saucedemo.json`.

## Qué trae este lab

- [`saucedemo-fd-v2.md`](saucedemo-fd-v2.md) — la evolución del FD del Lab 01: **un requisito
  modificado** (la confirmación de compra ahora especifica el mensaje exacto y el vaciado del
  carrito) y **un requisito nuevo** (cierre de sesión). El resto no cambia.

## Paso único

```
/qa-automator:incremental --fd=examples/07-incremental/saucedemo-fd-v2.md --url=https://www.saucedemo.com/ --style=config/style-contracts/saucedemo.yaml
```

## Qué debes observar

1. **El diff es determinístico y visible.** Antes de tocar nada, el agente te muestra
   `impact-report.json`: el requisito de compra como `modified` (con `changed_fields: [then]` y el
   spec impactado), el logout como `added`, y el resto `unchanged`. Si algo sale en `removed`,
   pregúntate si de verdad desapareció del FD — el agente no lo borra, te lo reporta.
2. **Cirugía, no regeneración.** El spec de compra existente se **edita** (mismo archivo, mismo
   `@tc-id`): cambian los asserts finales, no los locators ni los pasos que siguen válidos. El
   Reviewer lo re-audita como si fuera nuevo.
3. **Solo lo nuevo se genera.** El logout produce un spec nuevo; los tests de login no se re-mapean
   ni se tocan.
4. **Verification acotada**: el agente corre solo los specs tocados. Correr la suite completa al
   final es tu decisión (recomendada).
5. **El baseline avanza** (`config/criteria-baseline/saucedemo.json` ahora refleja la v2) — el
   próximo incremental comparará contra esto.

## Si no hiciste el Lab 01 antes

El command lo detecta: sin baseline no adivina qué cambió. Te ofrecerá tratar los criterios ya
citados por specs existentes como `existing_unverified` (decisión tuya) — o abortar, hacer el
Lab 01 y volver. Esa honestidad es deliberada: regenerar en silencio "por si acaso" destruiría
exactamente lo que este modo protege.

## La idea que te llevas

La suite generada no es un artefacto de usar-y-tirar: tiene un **contrato de evolución**. El spec
es la fuente de verdad, el baseline es la memoria, las anotaciones `@criterion` son el hilo, y el
diff (código, no LLM) decide qué se toca. El LLM entra después, con el alcance ya acotado.
