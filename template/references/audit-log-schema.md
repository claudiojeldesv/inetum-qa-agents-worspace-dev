# Audit log schema

`audit-log.json` es un archivo JSON-lines append-only. Cada línea es un objeto independiente. Se regenera por sesión (gitignored).

## Esquema de entrada

```typescript
interface AuditLogEntry {
  timestamp: string;            // ISO-8601 con milisegundos
  source:
    | 'pre-flight'
    | 'pii-post'
    | 'audit-write'
    | 'command'
    | 'subagent';
  action:
    | 'invoke' | 'block' | 'warn' | 'allow'
    | 'exploration_brief'
    | 'write_file' | 'edit_file' | 'read_file'
    | 'judge_decision' | 'review_decision'
    | 'llm_call';
  target?: string;              // archivo, URL, o subagent name
  rule?: string;                // ID de regla (C1, P1, etc.) si aplica
  reason?: string;              // por qué se tomó la acción
  result?: 'pass' | 'fail' | 'exit_0' | 'exit_2' | 'iteration_1' | 'iteration_2';
  metadata?: {
    tokens?: number;
    duration_ms?: number;
    score?: number;             // 0-1, para Judge
    feedback_summary?: string;  // para Reviewer
    [key: string]: unknown;
  };
}
```

## Ejemplo de sesión completa (recortada)

```jsonl
{"timestamp":"2026-05-30T01:36:15.032Z","source":"command","action":"invoke","target":"/qa-automator:autonomous","metadata":{"url":"https://www.saucedemo.com/"}}
{"timestamp":"2026-05-30T01:36:15.245Z","source":"pre-flight","action":"allow","rule":"C1","target":"https://www.saucedemo.com/","result":"pass"}
{"timestamp":"2026-05-30T01:36:15.500Z","source":"command","action":"exploration_brief","target":"https://www.saucedemo.com/","metadata":{"flows":["checkout"],"entry":"/","ignore":[],"mode":"directed"}}
{"timestamp":"2026-05-30T01:36:16.000Z","source":"subagent","action":"invoke","target":"playwright-test-planner","metadata":{"model":"sonnet"}}
{"timestamp":"2026-05-30T01:39:42.567Z","source":"subagent","action":"llm_call","target":"playwright-test-planner","result":"pass","metadata":{"tokens":32051,"duration_ms":203567}}
{"timestamp":"2026-05-30T01:39:42.890Z","source":"subagent","action":"write_file","target":"discovery-report.json"}
{"timestamp":"2026-05-30T01:40:00.000Z","source":"subagent","action":"invoke","target":"ia4d-writer","metadata":{"test":"login.happy-path"}}
{"timestamp":"2026-05-30T01:42:30.450Z","source":"subagent","action":"review_decision","target":"login.happy-path.spec.ts","result":"iteration_1","metadata":{"feedback_summary":"locator should be getByTestId not getByRole"}}
{"timestamp":"2026-05-30T01:43:15.110Z","source":"subagent","action":"review_decision","target":"login.happy-path.spec.ts","result":"pass"}
{"timestamp":"2026-05-30T01:43:50.230Z","source":"subagent","action":"judge_decision","target":"login.happy-path.spec.ts","metadata":{"score":0.92,"feedback_summary":"strong assertions, semantic locators, axe-core present"}}
{"timestamp":"2026-05-30T01:44:00.000Z","source":"pii-post","action":"allow","rule":"P1-P5","target":"login.happy-path.spec.ts","result":"pass"}
```

## Garantías

- Append-only. Nunca se sobrescribe una línea.
- JSON-lines: cada entry termina en `\n`.
- Ordenado temporalmente.
- Una entrada por evento atómico (un Edit del Healer es **un** evento, no varios).
