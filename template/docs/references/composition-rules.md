# Reglas de composición entre subagents

## Regla por defecto

**Los subagents `ia4d-*` no se invocan entre sí.** La orquestación vive en los commands `/ia4d-qa-automator:*` con handoff por archivos (cada subagent escribe un output en una ruta predecible que el siguiente lee).

Beneficios:
- Auditabilidad: el flujo es lineal y visible en el command markdown.
- Predictibilidad: ningún subagent decide invocar a otro de forma oportunista.
- Compatibilidad con el patrón canónico Inetum (Orquestador → Sub-agentes → Comandos).

## Excepción nombrada: Writer ↔ Reviewer

El par Writer+Reviewer **rompe la regla por necesidad estructural**, no por conveniencia. El Quality layer es la materialización de "QA es juez independiente"; obligarlo a comunicarse vía el command introduce overhead de I/O en cada vuelta del ping-pong que destruye la velocidad MVP.

### Cómo se aplica

El `ia4d-writer` tiene la tool `Task` habilitada en su frontmatter y puede invocar al `ia4d-reviewer` directamente. El Writer:

1. Genera un `.spec.ts` inicial.
2. Invoca al Reviewer vía Task tool con el contenido del test + criterios del plan.
3. Si el Reviewer aprueba → fin.
4. Si el Reviewer rechaza con feedback → el Writer ajusta y vuelve al paso 2.
5. Máximo N=2 iteraciones. Si tras N el Reviewer no aprueba, el Writer sale con el último estado + flag `reviewer_unresolved: true` y el command lo escala al QA (ask-first).

### Por qué es seguro

- **Determinístico**: orden Writer → Reviewer → Writer → Reviewer fijo. No hay invocación oportunista.
- **Bounded**: N=2 rondas máximo, hard cap.
- **Auditable**: cada vuelta del ping-pong escribe entrada al `audit-log.json` con `action: 'review_decision'` y `result: 'iteration_N' | 'pass'`.
- **Reversible**: si el patrón da problemas en piloto, se puede revertir a la regla pura (Reviewer invocado desde el command tras cada Writer) sin cambiar la arquitectura, solo el prompt del Writer.

### Qué NO permite la excepción

- El Writer no puede invocar al Judge. El Judge se invoca exclusivamente desde el command, al final.
- El Reviewer no puede invocar al Writer (la dirección es Writer→Reviewer→Writer, controlada por el Writer).
- Ningún otro subagent puede invocar a otros. Solo este par.

## Posicionamiento ante I+D Inetum

Si alguien pregunta "¿por qué un subagent invoca a otro si la regla canónica dice que no?", la respuesta es:

> Es composición de un patrón nombrado (Writer+Reviewer), no acoplamiento ad-hoc. La invocación es determinística, acotada (N=2), y auditable por audit-log.json. El patrón es la materialización del principio QA "el juez audita al ejecutor antes de exponer el resultado". Aplicar la regla canónica sin excepciones requeriría serializar el ping-pong vía archivos en el command, lo cual triplica el wall-clock sin ganar nada en auditabilidad.

Documentado en `SPEC.md` §6 ("Boundaries") y `CLAUDE.md` (sección "Arquitectura del proyecto").
