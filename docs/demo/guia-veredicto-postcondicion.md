# El panel que decide quién tiene razón — guía

Workspace: `C:\Users\USUARIO\qa\hrm`, ya desplegado con el código nuevo. Healthcheck **39/39**.
**Tiempo: ~15 minutos.** Tres paneles, y cada uno se resuelve de una forma distinta.

> ## Ojo con la terminal
>
> **Windows PowerShell 5.1 no acepta `&&`.** Todos los comandos van sueltos: te sitúas una vez y
> ya no vuelves a escribir `cd`.
>
> ```powershell
> cd C:\Users\USUARIO\qa\hrm
> ```

## Si lo haces con Claude desde la terminal

```powershell
$claude = (Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\claude.exe"
& $claude
```

> Lee GUIA-VEREDICTO.md y llévame por los pasos. Los paneles los resuelvo yo.

**Recuérdale que mientras haya un panel abierto el proceso está esperando, no colgado.** Que no lo mate.

---

## Qué es esto, y de dónde sale

En el run anterior sacaste **15 de 16**. Y uno de esos 15 verdes **no significaba nada**: el FD
pedía `Records Found` y la pantalla decía `No Records Found`. La búsqueda no había devuelto nada y
el caso lo daba por bueno, porque el texto pedido cabe dentro del que la aplicación mostraba.

Ahí apareció el agujero: **el panel solo salía cuando algo se rompía**. Una postcondición que no se
cumple se escribía en el informe y moría ahí — era el único desacuerdo entre el FD y la aplicación
que no tenía forma de llegar al acta.

Ahora la tiene. Eso es lo que vas a probar.

**Lo que este ejercicio NO arregla**, y conviene que lo sepas antes: aquel verde falso de `s15`
sigue siendo verde. Un verde no abre panel, por vacío que sea. Esto cubre los rojos.

---

## Paso 0 · Comprobar

```powershell
npm run qa:healthcheck
```

Tiene que decir **39 comprobaciones**. Y el guion del ejercicio, que ya está montado:

```powershell
npx tsx copilot/src/check-walk-script.ts .work/veredicto/walk-script.json --contract=config/style-contracts/orangehrm.yaml
```

**VÁLIDO**.

## Paso 1 · Leer el caso

Abre `examples\03-orangehrm\orangehrm-fd-veredicto.md`. Son once pasos en el registro de siempre.
**Léelo antes de correr nada**: sin el caso delante no puedes juzgar si la aplicación o el documento
tienen razón, y eso es justo lo que se te va a pedir tres veces.

## Paso 2 · Correr

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/veredicto/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/veredicto/vivo --rescue-budget=0 --aliases=.work/veredicto/vivo/aliases.json --assist --headed --actor="claudio.jeldes" --fd=examples/03-orangehrm/orangehrm-fd-veredicto.md --assist-timeout=1800
```

Dos banderas nuevas: **`--actor=` y `--fd=`**. Sin ellas el panel **no se abre** y te lo dice por
consola. Es deliberado: pedirte un veredicto para descubrir después que no se puede firmar sería
hacerte trabajar para nada.

`--assist-timeout=1800` te da media hora por panel. Tómate el tiempo que quieras.

## Paso 3 · Los tres paneles

Es un panel **distinto** al del ejercicio anterior. **No te pide que grabes nada** — no hay camino
que demostrar. Arriba, qué pedía el plan y qué no cuadra; debajo, **lo que la pantalla sí dice**,
leído en vivo; y tres botones al mismo nivel:

| Botón | Cuándo | Qué firma |
|---|---|---|
| **La aplicación tiene razón** | el criterio del FD está mal escrito | `app`, **con el literal que elijas** |
| **Es un defecto** | la aplicación debería mostrar eso y no lo muestra | `fd` |
| **Luego** | no lo tienes claro ahora | `defer` |

**Los tres continúan el run.** Ninguno es la salida «buena».

### Panel 1 — `s6`, en el listado de empleados

El FD pide **«Datos del empleado»**. El panel te va a ofrecer:

```
· PIM
· Employee Information
```

Aquí la lista **sirve**: el segundo es el rótulo real del bloque. Es el drift más común que existe
en un proyecto corporativo — el FD escrito en castellano contra una aplicación en inglés.

### Panel 2 — `s9`, en el listado de permisos

El FD pide **«Registros encontrados»**. El panel te va a ofrecer:

```
· Leave
· Leave List
```

**Y ninguno de los dos es un resultado**: son el menú y el título de la pantalla. El contador de
resultados que la aplicación sí muestra no aparece en la lista.

> **Esto es un límite conocido y medido, no un fallo del run.** La lista sale de los textos que la
> página marca como resultado (encabezados, avisos, estados) y esta aplicación pinta su contador en
> un texto plano sin marcar. Ahí es donde entra **«Ninguno de estos, lo señalo yo»**: lo activas,
> pulsas en la pantalla el texto que de verdad dice el resultado, y se toma **su texto**.
>
> **Quiero saber si esa salida te salva o te deja tirado.** Es la pregunta principal del ejercicio.

### Panel 3 — `s10`

El FD pide **«Solicitud aprobada correctamente»**. Misma lista de mueble, y esta vez **no hay nada
en la pantalla que se parezca**: la aplicación no muestra ningún mensaje de confirmación ahí.

> Si pulsas **«La aplicación tiene razón» sin elegir texto**, el panel vuelve y te dice por qué. No
> es un despiste: una decisión que no dice **qué** dice la aplicación no sirve para nada después —
> no habría con qué sustituir el criterio del FD.

## Paso 4 · Ver qué quedó firmado

```powershell
npm run qa:decisions -- --site=orangehrm --vigentes
```

Tus tres decisiones, con **tu nombre**, su criterio (`CP004`), su paso (`cp004-permisos/s6`…) y
grado **`en-vivo`** — miraste la pantalla de ese run, no una reproducción en limpio, y eso queda
escrito en vez de disfrazarse de algo más fuerte.

```powershell
npx tsx copilot/src/walk-scoreboard.ts .work/veredicto/vivo
```

**Los tres pasos siguen contando como bloqueados, incluso los que dijiste que la aplicación tiene
razón.** No es un olvido: lo que se midió es que el texto del FD no está. Que tú adoptes otro
literal cambia el criterio del **próximo** run, no lo medido en éste. Pintarlo de verde aquí sería
fabricar exactamente el verde falso que encontraste tú.

## Repetir desde cero

```powershell
Remove-Item -Recurse -Force .work\veredicto\vivo
```

El acta **no** se borra: es durable a propósito. Si quieres empezar con acta limpia:

```powershell
Remove-Item config\decisions\orangehrm.jsonl
```

---

## Qué quiero que me cuentes

1. **Panel 2 es el que importa.** Con la lista llena de mueble, ¿«lo señalo yo» te sacó del apuro, o
   te quedaste sin saber qué hacer? Y si lo usaste: ¿el texto que capturó era el que querías?
2. **¿Los tres botones te parecieron del mismo peso?** Si alguno «tira» más que los otros es un
   defecto de diseño: el panel no puede empujarte a adoptar la aplicación.
3. **¿Dudaste en alguno?** Sobre todo en `s9`: la lista de permisos está vacía porque no hay
   solicitudes, no porque la aplicación falle. Dímelo con las palabras que usarías tú — es lo que
   va a definir cómo se redacta la pregunta.
4. **Cuánto tardaste en cada uno.** La cifra que tenemos es tuya (3-4 min por panel) y era de otro
   tipo de panel. Ésta cuenta aparte.

## Si algo se tuerce

| Síntoma | Qué hacer |
|---|---|
| `El token '&&' no es un separador válido` | Es PowerShell 5.1. Los comandos van sueltos, sin `cd …&&` delante |
| «NO se abre el panel de veredicto» | Te falta `--actor=` o `--fd=`. El mensaje dice cuál |
| «el acta tiene la cadena rota» | **No fuerces nada**: pásame la salida de `npm run qa:decisions -- --site=orangehrm` |
| Parece colgado | Mira si existe `.work\veredicto\vivo\assist-pending.json`. Si existe, **te espera** |
| `npx` no arranca | Usa `npx.cmd` en vez de `npx` |

**Si el panel te confunde, no lo arregles: para y dímelo.**
