# Refinement questions — fd-mapfre-hogar.md

Preguntas que el refiner NO resolvió por su cuenta (ask-first). Responde y re-ejecuta,
o responde inline y el SDET decide. El refiner no fabrica la respuesta.

---

## Q-001 — Dirección resuelta: inconsistencia calle introducida vs opción a seleccionar (RF-003)

- **Origen**: fd-mapfre-hogar.md:49-60 (§4, nota para sign-off en líneas 57-60)
- **Hueco**: En la pantalla de calle (§3) se introduce `REINA VICTORIA` como sugerencia de autocompletado con número `24`. Sin embargo, la opción a seleccionar en la pantalla de direcciones resueltas (§4) contiene `ARENAL 24`, que es una calle distinta. El propio FD incluye una nota para sign-off señalando esta posible inconsistencia.
- **Por qué importa**: Si el dato correcto es `ARENAL 24` (resultado real de la resolución), el test puede construirse tal como está. Si es un error del script de origen, el selector correcto puede ser otro (p.ej. `REINA VICTORIA 24`), y el test con `ARENAL 24` fallaría o seleccionaría la opción incorrecta.
- **Lo que sí se puede generar**: el criterio RF-003 y el paso de selección. El valor literal del texto a seleccionar queda pendiente de confirmación.

---

## Q-002 — Ocupación de la vivienda: valor por defecto no especificado (RF-005)

- **Origen**: fd-mapfre-hogar.md:70-74 (§6)
- **Hueco**: El FD indica que la pantalla "presenta los datos de ocupación con un valor por defecto" pero no especifica cuál es. Para el happy-path navegacional basta con pulsar "Aceptar" sin modificarlo, lo que sí es testeable. La ambigüedad afecta únicamente a si el test necesita verificar que el valor por defecto es el esperado.
- **Por qué importa**: Si existe un requisito de que el valor por defecto sea un valor concreto (p.ej. "Habitual"), habría que añadir un assert adicional. Si basta con confirmar y avanzar, no bloquea.

---

## Q-003 — Sistemas NO electrónicos: valor por defecto no especificado (RF-008)

- **Origen**: fd-mapfre-hogar.md:93-97 (§9)
- **Hueco**: Misma situación que Q-002: el FD indica "valor por defecto" sin especificarlo. El happy-path navegacional (Aceptar sin modificar) sí es testeable.
- **Por qué importa**: Ídem a Q-002. Si hay requisito sobre el valor concreto del defecto, necesita un assert adicional.

---

## Q-004 — Documento de identidad: mecanismo de avance (RF-009)

- **Origen**: fd-mapfre-hogar.md:99-105 (§10)
- **Hueco**: El FD dice que el usuario "debe poder introducir un DNI válido y avanzar" pero no especifica el mecanismo de avance: ¿hay un botón "Aceptar" como en el resto de pantallas? ¿el campo tiene validación inmediata que avanza automáticamente al completarse? ¿hay un "Continuar" u otro control?
- **Por qué importa**: El planner mapea el DOM y puede resolver esto; sin embargo, si la interacción es inusual (avance automático por longitud del DNI), la ausencia de un clic explícito puede hacer que el test espere un elemento que no aparece. Es una señal para que el planner preste atención a esta pantalla.

---

## Q-005 — Fecha de nacimiento: indicador observable de aceptación (RF-010) — BLOQUEANTE

- **Origen**: fd-mapfre-hogar.md:107-113 (§11)
- **Hueco**: El FD declara que "el criterio de éxito del flujo es que esta pantalla acepta la fecha introducida" y que "la prueba termina aquí", pero no especifica qué observable indica que la fecha fue aceptada. Las opciones posibles son:
  - El sistema avanza a la pantalla siguiente (coberturas/precio), y el assert es que esa pantalla es visible.
  - El sistema muestra un mensaje o indicador de confirmación en la misma pantalla.
  - El criterio es ausencia de error (no aparece mensaje de error tras introducir la fecha).
  - Otro comportamiento.
- **Por qué importa**: Sin esto no hay aserción terminal para el flujo. El `then` de RF-010 está marcado como `[AMBIGUO]` y no puede generarse un test completo. El happy-path de los 9 pasos previos sí es testeable, pero el paso de cierre (el criterio global declarado en el FD) queda sin assert hasta la respuesta.

---

## Resumen

| ID    | RF afectado | ¿Bloquea generación?                                                              | Prioridad |
|-------|-------------|-----------------------------------------------------------------------------------|-----------|
| Q-001 | RF-003      | No bloquea el happy-path; el planner resolverá con el DOM. Confirmar dato.        | Media     |
| Q-002 | RF-005      | No bloquea el happy-path navegacional. Solo afecta si hay assert de valor defecto.| Baja      |
| Q-003 | RF-008      | No bloquea el happy-path navegacional. Solo afecta si hay assert de valor defecto.| Baja      |
| Q-004 | RF-009      | No bloquea; el planner mapea el mecanismo de avance desde el DOM.                 | Baja      |
| Q-005 | RF-010      | **Sí — sin esto no hay assert terminal del flujo completo.**                      | Alta      |
