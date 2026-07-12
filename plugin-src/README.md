# Empaquetado del plugin `ia4d-qa-automator`

Fuentes hand-authored del plugin de marketplace. El paquete instalable se **genera**; no se edita a
mano (misma disciplina que `template/`: núcleo en el repo, artefacto generado por builder).

## Estructura

- `commands/` — commands propios del plugin (`init`, `help`). El resto de commands `/qa-automator:*`
  viajan dentro del workspace desplegado, no aquí.
- `scaffold/scaffold.mjs` — copia determinística del workspace de arranque al destino (sin
  `node_modules`/`.work`/`.git`).
- `plugin.json` — manifiesto base (name, description, commands). La `version` la inyecta el builder
  desde `package.json` del repo.

## Regenerar el paquete

```bash
npm run build:plugin
```

Corre `build:template` antes (payload fresco) y produce `plugin/` en la raíz con layout de
marketplace:

```
plugin/.claude-plugin/marketplace.json
plugin/.claude-plugin/plugins/ia4d-qa-automator/
  .claude-plugin/plugin.json
  commands/{init,help}.md
  scaffold/scaffold.mjs
  scaffold/payload/            (= template/ sin node_modules/.work/.git)
```

## Simular la descarga desde el marketplace (local)

```
/plugin marketplace add <ruta-abs>/plugin
/plugin install ia4d-qa-automator
/qa-automator:init  mi-workspace-qa
```

Luego `cd mi-workspace-qa && npm run qa:healthcheck` (debe dar `Healthcheck OK`).
