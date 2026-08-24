# Recetas de campo — `config/field-sites/<sitio>.yaml`

Una receta declara **cómo se prueba un sitio**: la URL, el contract, el modo, los flujos y el
resultado de la última medición. La consume `src/scripts/field-deploy.ts`
(`npm run field:deploy`).

**Por qué existe.** Hasta el 2026-08-24 esto vivía en prosa —«hay que copiar los contracts a
mano»— y en el historial de shell de una máquina concreta. Un procedimiento declarado en prosa que
nadie ejecuta es la familia D2: se podre en silencio. El síntoma medido: siete workspaces de campo,
tres versiones distintas del producto, y dos de ellos declarando `0.4.0-beta.15` con distinto
`pre-review.ts`. El número de versión no discriminaba y ninguna medición de campo era reproducible.

## Campos

| Campo | Obligatorio | Qué es |
|---|---|---|
| `site` | sí | Identificador corto. Debe coincidir con el nombre del fichero. |
| `url` | sí | URL de entrada. La valida el pre-flight REAL contra el allowlist del destino. |
| `style_contract` | sí | Ruta relativa al repo. Si no viene en el template, el desplegador copia **ese fichero y solo ese**. |
| `allowlist_pattern` | no | Documental: el patrón que debe existir en el allowlist. El desplegador **no lo escribe**. |
| `mode` | no | `S4` autónomo · `S3` spec-refiner · `S2` req-driven. |
| `flows` | no | Módulos a cubrir. `null` si no se han medido — declararlos sin haberlos corrido es inventar la receta. |
| `auth` | no | `needed` y una `note` con el origen de las credenciales de test. Nunca credenciales reales. |
| `inputs` | no | Gherkin y FD de `examples/` para S2/S3. |
| `availability` | no | `check` con la URL del **backend** y una nota. Un 200 en `/` puede medir solo el shell de la SPA. |
| `last_run` | no | Fecha, iteración, veredicto, payload y los findings. Es la memoria de la medición. |
| `notes` | no | Lo que un QA necesita saber antes de lanzar: defectos abiertos, trampas del sitio. |

## Lo que el desplegador NO hace, por diseño

**No da de alta targets.** Verifica con `runPreflight` —el mismo código que el hook— y si el
veredicto es `block`, muere sin copiar nada. Compliance pre-flight no tiene override; un desplegador
que añadiera el patrón sería exactamente el override. El patrón se declara a mano, en el allowlist,
por una persona.

**No copia el allowlist del repo.** El del repo tiene URLs de cliente. El que viaja es el de
`template/config/`, curado. Lo verificó el par falsable de la propia herramienta.

**No inventa recetas.** Sin fichero para el sitio, muere y lista los que hay.

## Semántica de veredictos, igual que el hook

`block` deniega. `warn` **continúa declarando el motivo** — `demo.dolibarr.org` da `W1` («lacks
non-prod prefix») y es un sitio de la gira medido durante días. Tratar un aviso como bloqueo dejaría
fuera a demos legítimamente declarados; el primer borrador lo hacía y bloqueaba Dolibarr.

## El sello: `FIELD.json`

Lo escribe el desplegador en la raíz del workspace:

```json
{
  "sitio": "dolibarr",
  "receta": "config/field-sites/dolibarr.yaml",
  "producto": {
    "commit": "015358b…", "rama": "design/kernel-v2",
    "arbol_limpio": false, "ficheros_sin_commitear": 5,
    "version_template": "0.4.0-beta.15"
  },
  "payload": { "sha256": "efa23842…", "ficheros": 134 }
}
```

`payload.sha256` encadena ruta + contenido de todo lo que viaja, ordenado. **Es lo que distingue dos
despliegues que dicen la misma versión.** Y `arbol_limpio: false` se declara en vez de bloquear: a
veces se despliega para probar un parche, pero un sello que miente es peor que no tener sello.

## Comprobaciones falsables de la herramienta

- **Positivo**: `--site=dolibarr` → aviso `W1` declarado, 134 ficheros copiados, sello escrito, exit 0.
- **Negativo**: una receta con `https://prod.…` → `block` por regla `C2`, exit 1, y **el destino no
  llega a existir**. La primera versión copiaba y luego bloqueaba, dejando 134 ficheros sueltos.
- `--dry-run` imprime sello y hash sin tocar el disco.

## Alta de un sitio nuevo

1. Declara el patrón en `config/allowed-targets.yaml` del repo **y** en `template/config/` si el
   sitio va a viajar en el payload. Entorno NO productivo. A mano.
2. Escribe el style contract en `config/style-contracts/<sitio>.yaml`.
3. Escribe la receta en `config/field-sites/<sitio>.yaml`.
4. `npm run build:template` si tocaste el payload.
5. `npm run field:deploy -- --site=<sitio> --dest=<ruta>`.
6. `npm run qa:healthcheck` en el destino antes de lanzar nada.
