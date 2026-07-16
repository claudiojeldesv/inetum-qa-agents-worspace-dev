# Empaquetado del plugin `ia4d-qa-automator`

Fuentes hand-authored del plugin de marketplace. El paquete instalable se **genera**; no se edita a
mano (misma disciplina que `template/`: núcleo en el repo, artefacto generado por builder).

## Estructura

Esto es solo lo hand-authored. Los 12 agentes `ia4d-*` y los 7 comandos del agente **no** viven aquí:
el builder los inyecta desde el repo `.claude/` al generar el plugin.

- `commands/` — commands propios del plugin: `init` (despliega el workspace) y `help`.
- `scaffold/scaffold.mjs` — copia determinística del workspace de arranque al destino (sin
  `node_modules`/`.work`/`.git`).
- `plugin.json` — manifiesto base (name, description, author). El builder añade `version` (del repo)
  y el inventario `agents[]`/`commands[]` descubierto.

## Regenerar el paquete

```bash
npm run build:plugin
```

Corre `build:template` antes (payload fresco) y produce `plugin/` en la raíz con layout de
marketplace:

```
plugin/.claude-plugin/marketplace.json
plugin/.claude-plugin/plugins/ia4d-qa-automator/
  .claude-plugin/plugin.json   (declara 12 agentes + 9 comandos)
  agents/                      (12 ia4d-*, del repo)
  commands/                    (7 del agente + init + help)
  scaffold/scaffold.mjs
  scaffold/payload/            (= template/ sin node_modules/.work/.git; incluye los 3 agentes nativos)
```

## Simular la descarga desde el marketplace (local)

```
/plugin marketplace add <ruta-abs>/plugin
/plugin install ia4d-qa-automator
/ia4d-qa-automator:init  mi-workspace-qa
```

> Nota de namespacing: todos los commands del plugin llevan el prefijo del plugin
> (`/ia4d-qa-automator:*`) y están disponibles globalmente. El workspace desplegado no aporta
> commands propios; solo el sustrato de ejecución (runtime, config, agentes nativos).

Vía CLI (sin UI interactiva): `claude plugin marketplace add <ruta-abs>/plugin --scope local`
y `claude plugin install ia4d-qa-automator@ia4d-qa-automator-marketplace --scope local`. Validar el
manifiesto: `claude plugin validate plugin`.

Luego `cd mi-workspace-qa && npm run qa:healthcheck` (debe dar `Healthcheck OK`).
