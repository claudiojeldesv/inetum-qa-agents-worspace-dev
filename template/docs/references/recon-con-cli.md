# Reconocimiento con `qa:browse` — el protocolo

**Para el primer contacto con un sitio: mirar la aplicación y sacar la materia prima del FD sin escribir
un programa.** Sustituye al `recon.ts` grande que se escribía a mano en cada ciclo E2E. Medido: **~2,6×
más barato** que autorizar el script, porque el token caro es el de salida y aquí no se redacta código
([cli-vs-mcp.md](../findings/cli-vs-mcp.md) §A/B-2).

**No sustituye a las `probe-*.ts`.** Ver §5.

---

## 1. La puerta, y por qué se entra por ella

`playwright-cli` viene dentro de Playwright 1.60 (`playwright-core/lib/tools/cli-client/`). **No se
invoca directamente en trabajo de producto**: el hook de compliance matchea `mcp__playwright-test__.*` y
no ve un `Bash(playwright-cli goto <url>)`, así que el allowlist tendría un túnel y la regla dura #3
—compliance sin override— quedaría rota por el camino nuevo.

`src/scripts/qa-browse.ts` es el único punto de entrada sancionado: verifica la URL con el MISMO
`runPreflight` del hook **antes** de que el CLI la vea, exige que la sesión la haya abierto él, prohíbe
`attach`/`run-code`/`--cdp`/`--extension`/`--profile`/`--persistent`, fuerza engine empaquetado, contiene
los artefactos bajo `.work/browse/<sesión>/` y registra todo en el audit-log con `phase: browse`.

## 2. Cómo se invoca (y el peaje de Windows)

```bash
npx tsx src/scripts/qa-browse.ts -s=<sitio> <comando> [args]
```

**Usa siempre la forma directa, no `npm run qa:browse -- …`**: en Windows, `npm run` reintroduce una capa
de `cmd.exe` que re-parsea los argumentos — un `eval` con espacios llega partido y un `|` se interpreta
como pipe. Medido en A/B-2. (El alias `npm run qa:browse` existe en el repo para comandos simples, pero
no viaja a los workspaces de campo: `package.json` no está entre los ficheros que el template copia. La
forma directa funciona en ambos sitios.)

`-s=<sitio>` aísla la sesión. Ábrela una vez y sobrevive entre invocaciones de shell — hay un daemon
detrás. **Ciérrala siempre al terminar** (`close`), o el marcador queda vivo.

## 3. El protocolo, en el orden que funcionó

```bash
B="npx tsx src/scripts/qa-browse.ts -s=misitio"

# 1. Entrar. El snapshot va a FICHERO; la respuesta son 4-6 líneas.
$B open https://elsitio.example/

# 2. Inventario de accionables: GREPEAR el .yml, jamás leerlo entero.
#    (En A/B-2: 35 líneas útiles de un árbol de ~1.200 tokens.)
S=.work/browse/misitio/.playwright-cli; f=$(ls -t $S/page-*.yml | head -1)
grep -nE "textbox|button|link|combobox|checkbox|radio|searchbox|heading" "$f"

# 3. Literales de oráculo por DOM, con --raw (devuelve solo el valor).
$B --raw eval "[...document.querySelectorAll('h5')].map(h=>h.textContent.trim()).join(' | ')"
$B --raw eval "[...document.querySelectorAll('[data-test]')].map(e=>e.getAttribute('data-test')).join(' | ')"

# 4. Las tres notas que siempre hay que sacar
$B --raw eval "document.documentElement.lang + ' / navLang=' + navigator.language"   # i18n por locale
$B --raw eval "document.querySelectorAll('[data-test]').length"                       # ¿hay testids?
$B --raw eval "document.body.innerText.split('\n').filter(t=>t.trim()&&t.length<70).slice(0,18).join(' ~ ')"

# 5. Navegar y repetir 2-4 por pantalla. Cerrar.
$B goto https://elsitio.example/otra
$B close
```

## 4. Tres trampas medidas en campo

- **El snapshot automático sufre D72.** Al entrar en una SPA, el `.yml` puede salir **sin el contenido**
  porque la pantalla no había pintado. Si el árbol parece vacío, `snapshot` de nuevo — y desconfía del
  primero.
- **Lo que no está en el árbol de accesibilidad no se alcanza por `ref`.** En `practicesoftwaretesting`
  el formulario de login EXISTE en el DOM y NO aparece en el snapshot: los comandos por `ref` no llegan
  y hay que caer a `eval`. **El MCP tiene el mismo agujero: es el mismo árbol.** Contrasta siempre
  snapshot contra `eval` antes de concluir «no está».
- **Comillado.** Evita `^=` en selectores (se mangla) y prefiere `eval` con comillas simples dentro.
  Si algo vuelve vacío, prueba la expresión mínima primero.

## 5. Lo que este protocolo NO cubre

**Las sondas de comportamiento siguen siendo un programa** (`probe-*.ts`): validaciones, cascadas y todo
lo que exija flujo con estado —`fill` + blur + `click` + espera + lectura en una secuencia— no sale por
comandos sueltos. Medido: en A/B-2 el brazo CLI sacó pantallas, controles, precios y literales, pero
**no los literales de validación**, que el script a mano sí capturaba.

Reparto adoptado:

| fase del recon | herramienta |
|---|---|
| exploración, inventario, literales estáticos, notas de i18n/versión | **`qa:browse`** |
| sondas de comportamiento (validaciones, cascadas, estado) | **`probe-*.ts` a mano** |
| ejecución de la regresión | **el walker** — 0 tokens, no se toca |
