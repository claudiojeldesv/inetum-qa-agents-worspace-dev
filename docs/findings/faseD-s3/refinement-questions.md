# Refinement questions — fd-parabank.md

Preguntas que el refiner NO resolvió por su cuenta (ask-first). El refiner no fabrica la respuesta.
Responde inline o re-ejecuta con un FD actualizado. El SDET decide si bloquea o continúa.

---

## Q-001 — Auth-guard: comportamiento exacto ante acceso no autenticado (RF-002)

- **Origen**: fd-parabank.md:24-27
- **Hueco**: El FD dice "no debe estar permitido" e "impedir la visualización de datos de cuentas" pero no especifica el mecanismo: ¿el sistema redirige al login? ¿muestra una página de error? ¿devuelve 403? ¿simplemente no renderiza el contenido protegido?
- **Por qué importa**: la aserción del `then` depende de cuál sea el comportamiento esperado. El happy-path de login no se ve afectado, pero el caso negativo de auth-guard no puede tener una aserción concreta sin esta información.
- **Impacto**: no bloquea el happy-path de login (RF-001), pero sí bloquea el caso negativo de RF-002 (el test de acceso denegado).

---

## Q-002 — Transferencia: comportamiento ante saldo insuficiente (RF-004)

- **Origen**: fd-parabank.md:32-34
- **Hueco**: El FD dice "el sistema debe validar que la cuenta de origen dispone de saldo suficiente antes de ejecutar la operación" pero no especifica qué ocurre cuando el saldo es insuficiente. Preguntas concretas sin respuesta:
  - ¿Qué mensaje muestra el sistema (texto exacto o aproximado)?
  - ¿El formulario permanece editable tras el error o se resetea?
  - ¿Es un bloqueo duro (la operación no se ejecuta en ningún caso) o un aviso que el cliente puede ignorar?
- **Por qué importa**: sin esto no existe aserción para el caso negativo de transferencia. El happy-path (RF-003) sí es testeable; el caso de saldo insuficiente queda completamente diferido.
- **Impacto**: bloquea únicamente RF-004. RF-003 avanza.

---

## Q-003 — Bill-pay: outcome tras confirmar el pago (RF-005)

- **Origen**: fd-parabank.md:38-42
- **Hueco**: El FD describe los campos del formulario y la acción de confirmar, pero no especifica qué muestra el sistema tras la confirmación exitosa. ¿Mensaje de éxito? ¿Actualización visible del saldo? ¿Redirección? ¿Número de referencia de operación?
- **Por qué importa**: sin el outcome esperado no hay `then` testeable para el happy-path de bill-pay. El criterio completo de RF-005 queda bloqueado.
- **Impacto**: bloquea RF-005 por completo (happy-path y negativos).

---

## Q-004 — Bill-pay: disponibilidad en staging y semántica de "dar de alta" (RF-005)

- **Origen**: fd-parabank.md:38-42 (y preamble del FD, líneas 6-11)
- **Hueco**: dos subpreguntas relacionadas:
  1. El preamble del propio FD advierte que "pago de recibos" puede no estar expuesto en el happy-path del entorno de staging (https://parabank.parasoft.com). ¿Está disponible el flujo? Si no lo está, ¿es deliberado o un gap del entorno?
  2. La expresión "dar de alta el pago de un recibo a un beneficiario" en el dominio bancario español puede referirse a un pago puntual o a una domiciliación recurrente. ¿Cuál es el caso de uso correcto?
- **Por qué importa**: si el flujo no existe en staging, el planner no podrá mapearlo y se reportará como drift. Confirmar antes evita trabajo en un criterio que el entorno no soporta. La semántica de "alta" afecta al `given` y al `then` del criterio.
- **Impacto**: bloquea RF-005. Si el flujo no está en staging, el criterio pasa a drift-report y no genera test hasta que el entorno lo soporte.

---

## Resumen

| ID    | RF afectado | Descripción breve                                    | ¿Bloquea generación? | Prioridad |
|-------|-------------|------------------------------------------------------|----------------------|-----------|
| Q-001 | RF-002      | Mecanismo exacto de bloqueo de acceso no autenticado | Parcial — bloquea caso negativo de RF-002; RF-001 avanza | Media |
| Q-002 | RF-004      | Comportamiento ante saldo insuficiente en transferencia | Sí — RF-004 no tiene then sin esta respuesta | Alta |
| Q-003 | RF-005      | Outcome tras confirmar pago de recibo                | Sí — RF-005 no tiene then sin esta respuesta | Alta |
| Q-004 | RF-005      | Disponibilidad en staging y semántica de "alta"      | Sí — si no está en staging, el flujo va a drift-report | Alta |

**Criterios que pueden avanzar a generación sin esperar respuestas**: RF-001 (login), RF-003 (transfer happy-path), RF-006 (logout).

**Criterios bloqueados**: RF-002 (caso negativo), RF-004, RF-005.
