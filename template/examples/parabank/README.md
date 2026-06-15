# Ejemplo S2/S3/S4 — ParaBank (banca demo: auth, estado, drift)

[ParaBank](https://parabank.parasoft.com/parabank/index.htm) es un portal de banca demo de
Parasoft. Tiene login, estado de sesión y transferencias — el target ideal para ver las tres
puertas de entrada al mismo motor de generación. La cuenta de test (`john` / `demo`) ya está
declarada en `config/allowed-targets.yaml`.

Inputs incluidos:
- [`parabank.feature`](parabank.feature) — Gherkin maduro (cada Scenario declara su `Then`). Input de **S2**.
- [`parabank-fd.md`](parabank-fd.md) — Documento Funcional en prosa libre, sin RF-NNN. Input de **S3**.

## S4 — Autónomo (solo URL)

```
/qa-automator:autonomous --url=https://parabank.parasoft.com/parabank/index.htm
```

## S2 — Req-driven (desde Gherkin)

El `.feature` ya tiene los `Then`. El parser determinístico lo convierte a criterios RF-NNN,
el agente los mapea contra el DOM y genera tests con trazabilidad `@criterion`.

```
/qa-automator:req-driven --feature=examples/parabank/parabank.feature --url=https://parabank.parasoft.com/parabank/index.htm
```

Qué observar: el `Scenario Outline` de transferencia con `Examples` (amounts 1 y 2) genera
**tests data-driven** (un test por fila, ambos citando el mismo RF). El scenario `close-account`
está declarado en el `.feature` pero ParaBank no lo expone en el happy-path → el agente lo
**reporta como drift, no fabrica el test**.

## S3 — Spec-refiner (desde FD en prosa)

El FD no tiene identificadores ni `Then` explícitos. El refiner lo estructura en RF-NNN,
marca los huecos (ambigüedad deliberada: comportamiento ante saldo insuficiente) en
`refinement-questions.md` y **no inventa** el criterio ambiguo.

```
/qa-automator:spec-refiner --fd=examples/parabank/parabank-fd.md --url=https://parabank.parasoft.com/parabank/index.htm
```

Qué observar: el "pago de recibos" del FD genera un `drift-report.json` (el FD lo describe pero
hay que verificar contra el DOM). Las preguntas abiertas bloquean los RF ambiguos en vez de
adivinar el `Then`.

## Nota sobre auth concurrente

ParaBank mata el `JSESSIONID` server-side al hacer logout. Si un test de logout comparte el
`storageState` con tests autenticados concurrentes, los envenena. El auth-handler (Fase C) lo
resuelve con sesión aislada; el style-contract `config/style-contracts/parabank.yaml` ya trae `auth:`
configurado. No necesitas `--workers=1`.
