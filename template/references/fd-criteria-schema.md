# FD Criteria — schema JSON (`criteria.json`)

Contrato del handoff del módulo **S3 (Spec-refiner)**. El subagent `ia4d-spec-refiner` ingiere un FD en markdown libre y emite este `criteria.json` estructurado. Lo consumen aguas abajo: el `ia4d-discovery-analyzer` (taggea cada scenario con su `criterion_ref`) y el `ia4d-writer` (cita el RF-NNN en el `@criterion` del JSDoc). El `brief` embebido sustituye al `--flows/--entry/--ignore` que en S4 teclea el SDET a mano.

Es el **estándar propio** de `ia4d-qa-automator`. El FD del cliente entra como prosa libre; el refiner lo normaliza a este formato. Adaptadores para otros contratos de cliente (Jira, plantillas corporativas, OpenAPI) son mejora futura: traducirán el formato del cliente → este estándar, no al revés. Por ahora, uno solo.

## Principio rector: no fabricar

El refiner **extrae lo que el FD enuncia y marca lo que falta**. No inventa criterios, no expande scope, no rellena pasos de UI a ojo (esos los aporta el DOM real vía el planner en el Acto Mapear). Es la hard rule no-fabricar del `ia4d-discovery-analyzer` extendida al refiner: igual que discovery pone `test_id: null` cuando no hay dato, el refiner pone `confidence: low` + `gaps` + una pregunta en `refinement-questions.md` cuando el FD es ambiguo. En banca un criterio fabricado es peor que ninguno: da falsa confianza y puede enmascarar el requisito real.

## Schema

```json
{
  "version": 1,
  "source_fd": "demo/parabank/fd-parabank.md",
  "refined_timestamp": "<ISO 8601>",
  "target_url": "https://parabank.parasoft.com/parabank/index.htm",

  "criteria": [
    {
      "id": "RF-001",                  // asignado por el refiner, secuencial, estable
      "title": "string",              // título corto del requisito
      "flow": "login",                // flujo candidato kebab-case (mapeo dominio→UI). Alimenta brief.flows
      "given": "string",              // precondición, derivada del FD
      "when": "string",               // acción del usuario, derivada del FD
      "then": "string",               // resultado esperado. Si el FD NO lo especifica:
                                      //   "[AMBIGUO — el FD no especifica] <lo que sí dice>" + open_question
      "source_ref": "fd-parabank.md:12-18",  // trazabilidad obligatoria: archivo:línea(s) o sección. Preserva IDs propios del FD aquí
      "confidence": "high|medium|low",       // confianza de la EXTRACCIÓN (no de que la app lo cumpla)
      "drift_risk": "low|medium|high",       // sospecha temprana de que el flujo no exista en staging. NO es el veredicto
                                      //   (ese lo da el diff command vs discovery). Es una señal previa para priorizar
      "assumptions": [                // interpretaciones que el refiner tuvo que hacer; [] si ninguna
        "[ASSUMPTION] string"         //   marcadas con prefijo [ASSUMPTION] para que el SDET las vea
      ],
      "open_questions": [             // IDs Q-NNN que bloquean/matizan este criterio; [] si ninguno
        "Q-002"                       //   cada uno tiene su entrada en refinement-questions.md
      ]
    }
  ],

  "brief": {                          // sustituye a --flows/--entry/--ignore del SDET. Lo consume el command (Acto Mapear)
    "flows": ["login", "transfer-funds", "bill-pay"],  // TODOS los flujos que el FD menciona (sin filtrar por disponibilidad en staging)
    "entry": "/parabank/index.htm",   // punto de entrada derivado del FD o de target_url
    "ignore": [],                     // zonas que el FD declara fuera de alcance explícito, si las hay
    "drift_flags": [                  // heads-up temprano: flujos con drift_risk alto. El diff command los confirma
      { "flow": "bill-pay", "rf": "RF-006", "reason": "string" }
    ]
  },

  "open_questions_ref": "refinement-questions.md",  // path al doc de ambigüedades (ask-first); null si no hay
  "pii_redaction": {
    "verdict": "pass|fail",           // 'pass' solo tras verificar que NO se copió PII del FD a la salida
    "literals_found": [],             // valores con pinta de PII detectados en el FD (redactados, no reproducidos)
    "downstream_note": "string|null"  // p.ej. qué fixture sintético necesitará el Writer y de dónde (style-contract)
  },
  "refiner_notes": "string|null"      // notas globales del refiner (no por-criterio)
}
```

### Notas de campo

- **`id`** — el refiner asigna `RF-001`, `RF-002`… secuencial por orden de aparición. Si el FD ya trae IDs propios (`REQ-12`, `HU-3`), el refiner los **preserva** en `source_ref`; no los pisa. (El mapeo cliente→estándar es el germen del adaptador futuro.)
- **`flow`** — nombre de flujo en kebab-case. Es el único campo de "refinamiento creativo" permitido: traducir el término de dominio del FD ("transferencia entre cuentas propias") a un identificador de flujo testeable ("transfer-funds"). NO inventa el flujo; lo nombra.
- **`given/when/then`** — el criterio en forma accionable, derivado literal del FD. Es lo que el Writer convierte en pasos contra el DOM. Si el FD no especifica el `then` (caso típico del hueco), se marca `[AMBIGUO — el FD no especifica]` con lo que sí se sabe, y se abre una `open_question`. NUNCA se rellena el `then` a ojo.
- **`drift_risk`** — sospecha temprana, no veredicto. El refiner no conoce el DOM; marca `high` cuando el propio FD o el sentido común sugieren que el flujo puede no estar en staging. El **veredicto de drift** lo da el command después, con el diff determinístico `criteria.json` vs `discovery-report.json` (no LLM). Sirve para priorizar y para poblar `brief.drift_flags`.
- **`brief.flows`** incluye **todos** los flujos del FD, incluidos los de `drift_risk: high`. El planner intentará mapearlos; el que no se mapee se reporta como gap, no se fabrica.
- **`confidence: low`**, **`then` ambiguo**, o **`assumptions` no vacío** → obligan a una entrada `Q-NNN` en `refinement-questions.md`. El refiner no "resuelve" la ambigüedad rellenando; la escala al SDET.

## `refinement-questions.md` (output acompañante)

Markdown legible para el SDET. Una entrada por ambigüedad/hueco. Formato:

Cada pregunta lleva un ID `Q-NNN` referenciado desde `criteria[].open_questions`. Cierra con
una tabla resumen que diga cuáles **bloquean** la generación de tests y cuáles no.

```markdown
# Refinement questions — <source_fd>

Preguntas que el refiner NO resolvió por su cuenta (ask-first). Responde y re-ejecuta, o
responde inline y el SDET decide. El refiner no fabrica la respuesta.

## Q-002 — Transferencia: comportamiento ante saldo insuficiente (RF-004)
- **Origen**: fd-parabank.md:32-34
- **Hueco**: el FD dice "validar saldo suficiente antes de ejecutar" pero no especifica el
  comportamiento cuando el saldo es insuficiente (¿texto del mensaje? ¿bloqueo duro o aviso?
  ¿el form sigue editable?).
- **Por qué importa**: sin esto no hay aserción para el caso negativo. El happy-path sí es
  testeable; el negativo queda deferido hasta tu respuesta.

## Resumen
| ID | RF afectado | ¿Bloquea generación? | Prioridad |
|----|-------------|----------------------|-----------|
| Q-002 | RF-004 | Sí — sin esto no hay caso negativo | Alta |
```

## Hard rules del refiner (resumen normativo)

1. **No inventar criterios.** Solo extraer lo que el FD enuncia. Lo dudoso va a `gaps` + pregunta.
2. **No expandir scope.** No añadir criterios de seguridad/edge/performance "obvios" que el FD no pide.
3. **No inventar pasos de UI.** El criterio enuncia el *qué* (RF); los pasos contra el DOM los aporta el planner en el Acto Mapear. El refiner no describe clics que no ha visto.
4. **No copiar PII del FD a fixtures.** Un FD de banca puede traer DNI/IBAN/tarjetas de ejemplo con pinta real. El refiner **nunca** los levanta a `synthetic_fixtures`; los fixtures siguen siendo los sintéticos declarados en el style-contract. Pone `pii_redaction.verdict: 'pass'` solo tras verificarlo; cualquier literal con pinta de PII se reporta redactado en `literals_found`, no se reproduce.
5. **Trazabilidad obligatoria.** Cada criterio cita su `source_ref` (archivo:línea o sección). Sin origen no hay criterio.
6. **Determinismo razonable.** Mismo FD → mismos RF-NNN, mismo orden. La numeración sigue el orden de aparición en el FD.

## Cómo encaja en el pipeline S3 (Forma B)

```
FD (markdown libre) ──► ia4d-spec-refiner ──► criteria.json + brief + refinement-questions.md
                                                   │
                          (brief) ────────────────►│ command: prompt del planner en modo MAPEAR-contra-DOM
                          (criteria) ──────────────►│ discovery-analyzer: taggea scenario.criterion_ref
                                                    │ command: diff criteria vs discovery → drift-report.json
                          (criteria) ──────────────►│ ia4d-writer: @criterion RF-NNN en el JSDoc
```

## Reference

- [`SPEC.md`](../SPEC.md) §7 — "S3 — diseño decidido: Forma B"
- [`.claude/agents/ia4d-spec-refiner.md`](../.claude/agents/ia4d-spec-refiner.md) — productor de este artefacto
- [`.claude/agents/ia4d-discovery-analyzer.md`](../.claude/agents/ia4d-discovery-analyzer.md) — consumidor (taggea `criterion_ref`)
- [`references/style-contract-schema.md`](style-contract-schema.md) — `synthetic_fixtures` (única fuente de datos de prueba; el FD no los aporta)
