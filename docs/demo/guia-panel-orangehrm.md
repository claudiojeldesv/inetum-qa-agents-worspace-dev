# Cerrar el ciclo — del panel al plan, paso a paso

Workspace: `C:\Users\USUARIO\qa\hrm`. Healthcheck **39/39**.

**Lo que vas a probar**: que lo que resuelves en el modal **se queda en el plan**. Hasta ahora lo
resolvías, el run seguía, y al siguiente run volvías a tropezar con lo mismo. Ahora hay una pieza
que funde lo aprendido en el guion — pero **solo con tu aprobación y con tu firma**.

Dos partes: resolver los paneles (~20 min, hace falta que estés delante) y fundir lo resuelto
(~5 min).

> ## Ojo con la terminal
>
> Estás en **Windows PowerShell 5.1**, que **no acepta `&&`**. Por eso todos los comandos de aquí
> van sueltos: te sitúas una vez en el workspace y ya no vuelves a escribir `cd`.
>
> ```powershell
> cd C:\Users\USUARIO\qa\hrm
> ```
>
> A partir de ahí, cada bloque se pega tal cual.

## Si lo haces con Claude desde la terminal

`claude` no está en el PATH de esta máquina, pero está instalado. Estas dos líneas cogen siempre la
versión más reciente, así que siguen valiendo cuando se actualice:

```powershell
$claude = (Get-ChildItem "$env:APPDATA\Claude\claude-code" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName + "\claude.exe"
& $claude
```

Y le dices:

> Lee GUIA-PANEL.md y llévame por los pasos. Los paneles los resuelvo yo.

**Lo único que no puede hacer él son los cuatro paneles.** Y conviene repetirle una cosa:
**mientras haya un panel abierto el proceso está esperando, no colgado.** Que no lo mate.

---

# Parte 1 · Resolver los paneles

## Paso 0 · Comprobar

```powershell
npm run qa:healthcheck
```

Tiene que terminar en **`Healthcheck OK … (39 comprobaciones)`**.

## Paso 1 · Guardar el punto de partida

```powershell
Copy-Item .work\panel\walk-script.json .work\panel\walk-script.antes.json
```

Para poder comparar al final y repetir el ejercicio si quieres.

## Paso 2 · Correr con el panel

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/panel/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/panel/vivo --rescue-budget=0 --aliases=.work/panel/vivo/aliases.json --assist --headed
```

Se abre un navegador visible. El caso entra solo, va a **PIM** y abre el listado. En el **paso 7**
se planta y sale el panel. En cada uno: **Grabar** → hazlo tú en la aplicación → **Parar**.

### Los cuatro paneles

| | El panel dirá | Qué hacer |
|---|---|---|
| **1 · s7** | no encuentra «Buscar» | Grabar → pulsa **`Search`** → Parar |
| **2 · s9** | no encuentra «papelera» | Grabar → pulsa el **icono de papelera** de la primera fila → Parar |
| **3 · s13** | no encuentra «Leave List», y ofrece `Leave` | Grabar → pulsa **`Leave`** → Parar |
| **4 · s16** | no encuentra «X» | **«No existe aquí»** — es la respuesta correcta |

En el **panel 2** te avisará de que el paso hace algo de verdad y te ofrecerá **«Capturar sin
ejecutar»**. El caso es no destructivo (el paso siguiente cancela la baja), así que puedes hacerlo
normal.

> **El panel 2 es el que importa.** Al resolverlo se desbloquean tres pasos de golpe, y es el que
> produce el cambio más interesante para la parte 2.

---

# Parte 2 · Fundir lo resuelto en el plan

## Paso 3 · Ver qué grabaste

```powershell
Get-Content .work\panel\vivo\assist-patch.json
```

Ese fichero es todo lo que el panel aprendió. **Hasta hoy se quedaba ahí y nadie lo leía.**

## Paso 4 · Vista previa — no toca nada

```powershell
npx tsx copilot/src/merge-assist-patch.ts --work-dir=.work/panel/vivo --script=.work/panel/walk-script.json
```

Te enseña los cambios **agrupados en dos**, y la diferencia entre los grupos es el corazón de todo
esto:

- **CÓMO SE LLEGA** — pasos de camino que el plan no tenía. Se aceptan **en bloque**: son
  fontanería, no cambian qué es correcto.
- **QUÉ SIGNIFICA CORRECTO** — una comprobación nueva, o que el objetivo resulte ser **otro
  elemento** del que el plan nombraba. **Estos no entran si no los nombras uno a uno**, y cada uno
  te imprime la bandera exacta para aprobarlo.

Ejemplo de lo que verás del panel 2: el plan decía «papelera» y lo que hace el trabajo se llama
`Delete` — **no es el mismo elemento**, así que sale en el grupo caro y te pedirá permiso explícito.

**Este comando no escribe nada.** Lánzalo las veces que quieras.

## Paso 5 · Aplicar, con tu nombre

Copia del paso 4 las banderas de lo que apruebes. Por ejemplo:

```powershell
npx tsx copilot/src/merge-assist-patch.ts --work-dir=.work/panel/vivo --script=.work/panel/walk-script.json --aplicar --actor="claudio.jeldes" --fd=examples/03-orangehrm/orangehrm-fd-panel.md --elemento=s9
```

- **`--actor=` es obligatorio.** Sin él no firma nada: fundir el plan del cliente sin responsable es
  justo lo que el acta existe para impedir.
- `--elemento=s9` / `--oraculo=s9#v1` — solo lo que tú nombres. Sin nombrar nada entra únicamente el
  camino.
- Si te falta algo, te lo dice **antes** de hacerte revisar nada.

Deja tres cosas: el guion reescrito, **las decisiones firmadas** en
`config\decisions\orangehrm.jsonl`, y una copia del original en `config\baselines\` que **no se
sobrescribe nunca** — para que la distancia siempre se mida contra el plan de partida.

## Paso 6 · Comprobar que no se rompió nada

```powershell
npx tsx copilot/src/check-walk-script.ts .work/panel/walk-script.json --contract=config/style-contracts/orangehrm.yaml
```

```powershell
npm run qa:decisions -- --site=orangehrm --vigentes
```

El primero tiene que decir **VÁLIDO**. El segundo, **cadena coherente**, con tus decisiones y tu
nombre en cada una.

## Paso 7 · El que decide si todo esto sirve

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/panel/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/panel/despues --rescue-budget=0 --aliases=.work/panel/despues/aliases.json
```

**Sin `--assist`. Sin ti delante.** Los pasos que antes se plantaban tienen que pasar solos.

```powershell
npx tsx copilot/src/walk-scoreboard.ts .work/panel/seco .work/panel/despues
```

| | |
|---|---|
| Antes (sin panel) | **10 de 16** pasos, 6 bloqueados |
| Después de fundir | ← esto es la medición |

**Si no sube, la fusión no vale de nada por bien que se firme.** Es el punto que aún no está
probado: lo verifiqué con un parche que fabriqué yo, y eso mide mi locator inventado, no la
herramienta. **Solo se cierra con el parche que salga de tus cuatro paneles.**

---

## Qué pasarme al terminar

1. La salida del **paso 4** (la vista previa). Quiero ver cómo agrupó tus cambios.
2. La salida del **paso 7** (el marcador antes/después). Es la medición.
3. Y las cuatro de siempre: si el texto de cada panel te bastó para decidir, si los candidatos
   ayudaron o estorbaron, cuánto tardaste en cada uno, y si esta vez **sí** notaste que resolver el
   panel 2 desbloqueaba tres pasos.

## Si algo se tuerce

| Síntoma | Qué hacer |
|---|---|
| `El token '&&' no es un separador válido` | Es PowerShell 5.1. Los comandos de esta guía van sueltos: no le pongas `cd … &&` delante |
| Parece colgado | Mira si existe `.work\panel\vivo\assist-pending.json`. Si existe, **te espera** |
| Volver al punto de partida | `Copy-Item .work\panel\walk-script.antes.json .work\panel\walk-script.json -Force` |
| La fusión dice que no puede | **No la fuerces**: pásame el mensaje. Rechaza a propósito cuando perdería el oráculo de un paso o un dato secreto |
| Repetir solo un tramo del run | Añade `--from=s7 --to=s11` |
| Más margen en los paneles | `--assist-timeout=1800` (segundos) |

**Si el panel te confunde, no lo arregles: para y dímelo.**
