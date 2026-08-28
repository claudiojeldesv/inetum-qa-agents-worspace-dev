# Acta de decisiones — schema (`config/decisions/<site>.jsonl`)

Donde queda firmada cada decisión del QA sobre el drift entre el FD y la aplicación. Es
la **P1** de [`docs/tasks/plan-panel-y-acta.md`](../tasks/plan-panel-y-acta.md) y la base
sobre la que escriben todas las fases siguientes: la pantalla de discrepancia (P2), la de
aprobación (P5) y la etiqueta de oráculo con dientes (P6).

El producto detecta el drift, lo escribe en un informe y hasta ahora ahí moría: no había
camino de vuelta desde «el QA mira el drift y decide que la app tiene razón» hacia el
plan. El acta es ese camino, y lo que impide que sea un agujero de auditoría.

## Dónde vive y por qué

`config/decisions/<site>.jsonl`, al lado de `config/hint-aliases/` y por la misma razón:
**`config/` sobrevive a la limpieza de `.work/`**. Una decisión del QA no es un artefacto
de run. Un acta en `.work/` desaparecería en el siguiente despliegue y con ella el motivo
por el que el plan dice lo que dice.

En un workspace de campo desplegado con `npm run field:deploy`, el acta viaja con el
`config/` de ese workspace — igual que el allowlist y los contracts.

## Una entrada

Formato JSONL: **una decisión por línea**, append-only, en el orden en que se tomaron.

```json
{
  "rf": "RF-004",
  "paso": "transfer/s7",
  "decision": "app",
  "valor_nuevo": "Transfer Complete!",
  "fd_hash": "fd0011223344aabb",
  "script_hash": "sc0011223344aabb",
  "evidencia": "en-vivo",
  "actor": "claudio.jeldes",
  "timestamp": "2026-08-24T15:11:43.804Z",
  "supersedes": "bf08000c7bf3531f10fd93b4ef9ae4d1",
  "hash": "c626fc2c5dcac68cd07e37b6d7e257e3"
}
```

| Campo | Obligatorio | Qué es |
|---|---|---|
| `rf` | sí | Criterio del FD (`RF-NNN` de `criteria.json`). |
| `paso` | sí | `<flujo>/<id-de-paso>` — la misma clave que `WalkState.completed` y el perfil de tiempos. |
| `decision` | sí | `app` \| `fd` \| `defer`. Quién tiene razón, o que todavía no se decide. |
| `valor_nuevo` | no | El valor que el QA adopta cuando la aplicación tiene razón. |
| `fd_hash` | sí | Huella del FD contra el que se decidió. Sin ella la decisión no dice contra **qué** se decidió. |
| `script_hash` | sí | Huella del walk-script. Mismo algoritmo que `hashScript` de `copilot/src/walk-core.ts`. |
| `evidencia` | sí | `desde-cero` \| `en-vivo` \| `sin-verificar`. |
| `actor` | sí | Quién decidió. **Fail-closed**: sin actor no hay decisión. |
| `timestamp` | sí | ISO 8601. |
| `supersedes` | no | `hash` de la decisión que ésta revoca. Manda la última; la revocada **no** se borra. |
| `hash` | sí | El eslabón. Ver abajo. |

### Los tres grados de evidencia

No son una escala de permiso: **los tres aprueban** (decisión 3 del plan — la aprobación
no exige verificación en limpio, exige evidencia, y la evidencia tiene grado). Con una
póliza que se quema no se puede reproducir desde cero, y eso no puede ser un muro. Lo que
sí se exige es que el grado quede escrito.

- **`desde-cero`** — replay en contexto limpio. La garantía fuerte.
- **`en-vivo`** — comprobado contra la página actual porque el camino previo muta negocio
  y re-ejecutarlo duplicaría operaciones (K0.25/D2). Es lo que ya degrada
  `verifyAssistPatch` y lo dice en su `verify_reason`; aquí sube al nivel de la decisión.
  Es también, **siempre y sin excepción**, el grado de un veredicto del panel (fase B): el
  QA mira la pantalla de ESE run, con el estado que dejaron los pasos anteriores. No hay
  replay en limpio, así que `desde-cero` sería mentira, y hay observación directa, así que
  `sin-verificar` se quedaría corto. Es constante en el código, no un parámetro: nadie
  puede subirlo desde fuera.
- **`sin-verificar`** — el QA decidió y la verificación queda **aplazada** al próximo run
  con datos frescos. Aplazada, no desaparecida (P5).

## La cadena

`hash` = `sha256(hash_anterior + "\n" + payload_canónico)`, 32 hex. El payload canónico es
un **array de pares en orden fijo** (no un objeto: el orden queda declarado en el código,
no depende del orden de inserción de claves, que es lo que se pierde en un `JSON.parse`).
Los opcionales ausentes no aparecen en el payload.

La primera entrada se encadena a la semilla `ia4d-decisions-v1`. Explícita y no la cadena
vacía, para que **borrar la primera entrada tampoco cuadre**.

### Qué garantiza y qué no

**Garantiza**: alterar o borrar una decisión vieja rompe la cadena, y el validador señala
la **entrada exacta** (no pinta el acta entera en rojo — el QA necesita saber cuál).

**No garantiza** (decisión 10 del plan): el hash es evidencia de **manipulación**, no
no-repudio. Quien tenga permiso de escritura puede recalcular la cadena entera. Y truncar
la **cola** —borrar las últimas N entradas— deja una cadena impecable: es inherente a un
hash chain sin ancla externa.

Por eso `record-decision` deja el hash de cada decisión en el **audit-log** (`rule:
"decision-recorded"`), que es otro fichero y otro camino de escritura. `check-decisions
--audit=<path>` cruza los dos: un hash que el audit-log recuerda y el acta ya no contiene
es una cola truncada. **Sin `--audit` el validador no afirma nada sobre la cola**, y lo
dice por pantalla en vez de callárselo.

## Herramientas

```bash
npm run qa:decide -- --site=parabank --rf=RF-004 --paso=transfer/s7 --decision=app --valor-nuevo="Transfer Complete!" --evidencia=en-vivo --fd=.work/parabank/criteria.json --script=.work/parabank/walk-script.json
```

```bash
npm run qa:decisions -- --site=parabank --audit=.work/parabank/audit-log.json --vigentes
```

- **`record-decision`** (`npm run qa:decide`) — registra. **Por flags o por fichero de
  pendientes, NUNCA por JSON en línea**: PowerShell 5.1 se come las comillas al pasar
  argumentos a un ejecutable nativo y el JSON llega destrozado (D32). El panel, que corre
  en el navegador, escribe pendientes; una persona en consola usa flags.
  - `--fd=<path>` / `--script=<path>` calculan la huella; `--fd-hash=` / `--script-hash=`
    la aceptan ya hecha.
  - `--valor-nuevo-file=<path>` para un literal con comillas o saltos. **No se le hace
    trim por dentro**: el test busca el texto tal cual.
  - `--supersede-vigente` revoca automáticamente la decisión vigente de ese `rf`+`paso`.
  - `--actor=` o la variable `QA_ACTOR`. Sin ninguna de las dos, exit 2.
  - Cada decisión firmada queda anclada en el audit-log del run.
- **`merge-assist-patch`** — firma al fundir un parche del panel en el guion. Una decisión
  por gesto de aprobación (el bloque de coreografía de cada entrada, y cada oráculo).
- **`dom-walker --assist`** — firma un **veredicto** sobre una postcondición incumplida
  (fase B). El panel se abre en la página, el QA elige, y la decisión queda encadenada sin
  pasar por consola. Exige `--actor=` y `--fd=`/`--fd-hash=`/`--sin-fd`, y un `rf` sin
  ambigüedad (`--rf=` si el flujo cubre varios criterios). **Fail-closed en la puerta**:
  si falta cualquiera de los tres, el panel NO se abre y se dice por qué — pedirle un
  veredicto a alguien para descubrir después que no se puede firmar tira su trabajo.

> **Los tres firmantes calculan la huella del FD con la misma función**
> (`huellaDeArtefacto` en `src/decisions.ts`). No es simetría estética: si cada uno
> normalizara el BOM o el salto final a su manera, las decisiones de unos y otros dejarían
> de ser comparables entre sí y **nada se pondría rojo**, porque cada acta seguiría siendo
> internamente coherente. Es la familia D2 servida.

- **`check-decisions`** (`npm run qa:decisions`) — recomputa la cadena. Exit 0 coherente,
  2 manipulada, 1 uso incorrecto. **Entra en el healthcheck**: en un workspace de campo el
  acta lleva decisiones reales, y un acta manipulada que nadie mira vale lo mismo que no
  tenerla.

### El fichero de pendientes

`.work/<site>/decisions-pending.jsonl`, una decisión por línea con los mismos campos
**menos `hash`** (y `timestamp` opcional). Lo escribe quien captura la decisión; lo drena
`record-decision --pendings=<path>`, que reescribe el fichero después de **cada** firma —
si el proceso muere a mitad, lo ya firmado no se vuelve a firmar.

El `actor` del pendiente manda sobre el de la consola. Nunca al revés: **no se reasigna
autoría**.

## Reglas duras que aplican aquí

- **Sin actor no hay decisión.** No hay default amable. Un `actor: "qa"` inventado por la
  herramienta convierte la firma en decoración.
- **No se encadena encima de una cadena rota.** `appendDecision` se niega: sellar una
  manipulación la volvería indistinguible de una decisión legítima. Hay que resolverla
  antes, y el validador dice exactamente cuál es.
- **La revocada no se borra.** `supersedes` deja la traza; la vista «vigente» es una
  proyección, no la verdad.
- **Lectura tolerante al BOM y a CRLF.** Estos ficheros pasan por PowerShell y por
  editores; un lector estricto convertiría un BOM en «acta vacía», que aquí significaría
  «ninguna decisión que verificar» y daría verde por ausencia.
