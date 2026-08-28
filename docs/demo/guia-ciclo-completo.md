# El ciclo entero, de una sentada

Workspace: `C:\Users\USUARIO\qa\hrm`, desplegado con el código de esta tanda. Healthcheck **39/39**.
**Tiempo: ~25 minutos**, de los cuales unos 10 delante de la pantalla.

**Qué se prueba**: que las tres piezas que se han construido encajan entre sí, con un caso solo y
un acta sola. No son tres ejercicios: es uno.

| Pieza | Qué hace | Dónde la ves |
|---|---|---|
| **Panel de asistencia** | no encuentro el elemento → señálamelo | paso `s7` |
| **Panel de veredicto** | el resultado no cuadra → ¿quién tiene razón? | pasos `s6` y `s8` |
| **Fusión aprobada** | lo que resolviste se queda en el plan | pasos 5 y 6 |
| **Acta de decisiones** | cada cambio con tu nombre y su evidencia | paso 7 |

> ## Ojo con la terminal
>
> **PowerShell 5.1 no acepta `&&`.** Cada bloque va suelto; te sitúas una vez:
>
> ```powershell
> cd C:\Users\USUARIO\qa\hrm
> ```

## Si lo haces con Claude desde la terminal

```powershell
$claude = (Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\claude.exe"
& $claude
```

> Lee GUIA-CICLO.md y llévame por los pasos. Los paneles los resuelvo yo.

**Recuérdale que con un panel abierto el proceso está esperando, no colgado.** Que no lo mate.

---

## El caso

Está en `examples\03-orangehrm\orangehrm-fd-ciclo.md`. Ocho pasos, registro de siempre.
**Léelo antes de correr nada**: sin el caso delante no puedes juzgar nada.

Tres de los ocho no van a salir, cada uno por un motivo distinto. Esa es la materia prima.

## Paso 0 · La línea de partida (ya medida)

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/ciclo/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/ciclo/antes --rescue-budget=0 --aliases=.work/ciclo/antes/aliases.json
```

**Sin `--assist` y sin ti.** Tiene que dar **5 de 8 pasos, 3 bloqueados**. Es contra esto que se
mide todo lo demás; si te da otra cosa, para y dímelo antes de seguir.

| Paso | Qué falla | Quién lo arregla |
|---|---|---|
| `s6` | el FD pide «Datos del empleado» y no aparece | panel de **veredicto** |
| `s7` | el FD pide un botón «Buscar» que no resuelve | panel de **asistencia** |
| `s8` | el FD pide «Registros encontrados» y no aparece | panel de **veredicto** |

## Paso 1 · Guardar el punto de partida

```powershell
Copy-Item .work\ciclo\walk-script.json .work\ciclo\walk-script.antes.json
```

## Paso 2 · Correr con los paneles

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/ciclo/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/ciclo/vivo --rescue-budget=0 --aliases=.work/ciclo/vivo/aliases.json --assist --headed --actor="claudio.jeldes" --fd=examples/03-orangehrm/orangehrm-fd-ciclo.md --assist-timeout=1800
```

Se abre un navegador visible y te van a salir **tres paneles seguidos**, y no son iguales.

### Panel 1 — `s6` · **veredicto**

El FD pide «Datos del empleado». Te ofrece lo que la pantalla sí dice:

```
· Employee Information
· PIM
```

El primero es el rótulo real del bloque. Drift de idioma: el FD en castellano, la aplicación en
inglés. Tres botones **al mismo nivel** — *La aplicación tiene razón* (elige el literal), *Es un
defecto*, *Luego*. Los tres continúan.

### Panel 2 — `s7` · **asistencia** (el de siempre)

Éste sí te pide trabajo: **Grabar** → pulsas tú el botón de búsqueda en la aplicación → **Parar**.
El FD lo llama «Buscar» y la aplicación lo llama «Search»: por eso no resuelve.

### Panel 3 — `s8` · **veredicto**

El FD pide «Registros encontrados». Aquí la lista te va a decepcionar a propósito, y quiero que lo
veas: la aplicación **sí** muestra un contador de resultados, pero lo pinta en un texto plano sin
marcar como resultado, así que **no sale en la lista**. Para eso está **«Ninguno de estos, lo
señalo yo»**: lo activas y pulsas el contador en la pantalla.

> **Prueba deliberada**: este panel solo aparece si resolviste `s7`. Si en el panel 2 pulsas
> *Bloquear paso*, la búsqueda nunca se lanza y el panel 3 **no te pregunta** — te dice en el
> informe que no había nada que decidir porque el camino no llegó. Preguntarte ahí sería meter en
> el acta una decisión tomada sobre una pantalla donde no ha pasado nada.

## Paso 3 · Ver qué grabaste

```powershell
type .work\ciclo\vivo\assist-patch.json
```

El parche de `s7`, con su locator y si se **verificó por replay**.

## Paso 4 · Vista previa de la fusión — no toca nada

```powershell
npx tsx copilot/src/merge-assist-patch.ts --work-dir=.work/ciclo/vivo --script=.work/ciclo/walk-script.json
```

Sin `--aplicar` **no escribe una sola línea**. Te agrupa los cambios por peso: el camino en bloque,
lo que cambia un resultado esperado uno a uno.

## Paso 5 · Aplicar, con tu nombre

Copia del paso 4 las banderas de lo que apruebes:

```powershell
npx tsx copilot/src/merge-assist-patch.ts --work-dir=.work/ciclo/vivo --script=.work/ciclo/walk-script.json --aplicar --actor="claudio.jeldes" --fd=examples/03-orangehrm/orangehrm-fd-ciclo.md
```

**`--actor=` es obligatorio.** Sin él no firma nada.

## Paso 6 · Que no se rompió nada

```powershell
npx tsx copilot/src/check-walk-script.ts .work/ciclo/walk-script.json --contract=config/style-contracts/orangehrm.yaml
```

**VÁLIDO**.

## Paso 7 · El acta

```powershell
npm run qa:decisions -- --site=orangehrm --vigentes
```

Tienen que salir **tus decisiones de hoy**, con tu nombre, su criterio (`CP005`), su paso y grado
**`en-vivo`** — miraste la pantalla de ese run, no una reproducción en limpio. Y **cadena
coherente**: si dice otra cosa, para y pásamelo.

## Paso 8 · El que decide si todo esto sirve

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/ciclo/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/ciclo/despues --rescue-budget=0 --aliases=.work/ciclo/despues/aliases.json
```

**Sin `--assist`. Sin ti delante.**

```powershell
npx tsx copilot/src/walk-scoreboard.ts .work/ciclo/antes .work/ciclo/despues
```

| | Esperado |
|---|---|
| antes | **5 de 8** |
| después | **6 de 8** |

`s7` tiene que pasar solo. `s6` y `s8` **siguen bloqueados y eso es correcto**: son drift real del
FD, y tu veredicto cambia el criterio del *próximo* plan (eso es la fase siguiente), no lo medido
hoy. Un veredicto no pinta un paso de verde — hacerlo sería fabricar el mismo verde falso que
encontraste tú la vez pasada.

> **Por qué el paso 8 usa otro fichero de aliases.** Cuando resuelves un panel, lo aprendido puede
> promocionarse a memoria durable de locators. Si el run de verificación reutilizara esa memoria,
> `s7` pasaría **por el alias y no por la fusión**, y estaríamos midiendo otra cosa. Con
> `--aliases=.work/ciclo/despues/aliases.json` la memoria arranca vacía: lo único que puede hacer
> pasar `s7` es que el locator esté **en el guion**. Que es justo lo que se quiere demostrar.

## Volver al punto de partida

```powershell
Copy-Item .work\ciclo\walk-script.antes.json .work\ciclo\walk-script.json -Force
```

```powershell
Remove-Item -Recurse -Force .work\ciclo\vivo, .work\ciclo\despues
```

El acta **no** se borra: es durable a propósito.

---

## Qué quiero que me cuentes

1. **La cifra del paso 8.** Es la única que decide si esto sirve.
2. **¿Notaste que los paneles 1 y 3 eran de otro tipo que el 2?** Sin que yo te lo dijera, ¿habrías
   sabido que a uno se le señala y a los otros se les responde?
3. **Panel 3 es el que más me interesa.** Con la lista llena de mueble, ¿«lo señalo yo» te sacó del
   apuro? ¿El texto que capturó era el que querías?
4. **¿Dudaste en algún veredicto?** Sobre todo: ¿alguno de los tres botones «tiraba» más que los
   otros? Si es así, es un defecto de diseño — el panel no puede empujarte a nada.
5. **Cuánto tardaste en cada panel**, separando los de veredicto del de asistencia. La cifra que
   tenemos (3-4 min) es tuya y es solo del de asistencia.

## Si algo se tuerce

| Síntoma | Qué hacer |
|---|---|
| `El token '&&' no es un separador válido` | Es PowerShell 5.1. Los comandos van sueltos |
| El paso 0 no da 5/8 | **Para y dímelo.** La aplicación demo cambia sola; medirlo contra otra base no vale |
| «NO se abre el panel de veredicto» | Te falta `--actor=` o `--fd=`. El mensaje dice cuál |
| «el acta tiene la cadena rota» | **No fuerces nada**: pásame `npm run qa:decisions -- --site=orangehrm` |
| Parece colgado | ¿Existe `.work\ciclo\vivo\assist-pending.json`? Entonces **te espera** |
| La fusión dice que no puede | No la fuerces: rechaza a propósito cuando perdería el oráculo de un paso o un dato secreto |
| `npx` no arranca | Usa `npx.cmd` |

**Si un panel te confunde, no lo arregles: para y dímelo.** Eso es el hallazgo.
