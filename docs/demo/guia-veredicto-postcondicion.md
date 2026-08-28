# El panel que decide quién tiene razón — guía corta

Workspace: `C:\Users\USUARIO\qa\hrm`, el mismo del ejercicio anterior.
**Tiempo: ~10 minutos.** Una sola decisión, pero es un tipo de decisión que hasta ahora no existía.

> Sigues en **Windows PowerShell 5.1**: no acepta `&&`. Sitúate una vez y ya no vuelvas a escribir `cd`.
>
> ```powershell
> cd C:\Users\USUARIO\qa\hrm
> ```

---

## Qué es esto, y por qué sale de lo que tú encontraste

En el run anterior sacaste **15 de 16**. Y de esos 15 verdes, **uno no significaba nada**:

```
s15: el FD pedía 'Records Found' y en pantalla hay 'No Records Found'
```

La pantalla de permisos **no tenía ninguna solicitud** y el caso lo daba por bueno, porque el texto
que el FD pedía cabe dentro del que la aplicación mostraba. El motor lo cantó, pero no cambió el
veredicto — decidir que «No X» niega a «X» depende del idioma y sería adivinar.

Y ahí apareció el agujero de verdad: **el panel solo salía cuando algo se rompía**. Un verde sin
poder discriminante no rompe nada, así que esa discrepancia no tenía dónde decidirse. Antes de esto,
una postcondición incumplida se escribía en el informe y moría ahí: era **el único drift que no
podía llegar al acta**.

Ahora sí puede. Eso es lo que vas a probar.

---

## Paso 1 · Poner un criterio que de verdad discrimine

Guarda primero una copia, para poder volver:

```powershell
Copy-Item .work\panel\walk-script.json .work\panel\walk-script.antes-veredicto.json
```

El problema de `s15` no es que fallara: es que **no podía fallar**. Le ponemos un criterio con poder
discriminante, que es lo que el FD debería haber dicho desde el principio si quería comprobar que
hay resultados. **A mano, en un editor** — abre `.work\panel\walk-script.json`, busca el paso `s15`
y cambia su `value`:

```json
{ "id": "s15", "action": "expect_text", "value": "(1) Records Found" }
```

> No hay comando para esto, y es deliberado. Un programa que reescribe el plan sin una decisión
> firmada detrás es exactamente lo que la aprobación del ejercicio anterior existe para impedir;
> no voy a añadir una puerta trasera para montar una demo. Esto es preparación del ejercicio, no
> parte del producto.

Con la pantalla de permisos vacía, ese texto **no aparece**. Eso es un rojo de verdad, y ahí es
donde te va a preguntar.

## Paso 2 · Correr con el panel de veredicto

```powershell
npx tsx copilot/src/dom-walker.ts --script=.work/panel/walk-script.json --contract=config/style-contracts/orangehrm.yaml --base-url=https://opensource-demo.orangehrmlive.com --work-dir=.work/panel/veredicto --rescue-budget=0 --aliases=.work/panel/veredicto/aliases.json --assist --headed --actor="claudio.jeldes" --fd=examples/03-orangehrm/orangehrm-fd-panel.md
```

Fíjate en las dos banderas nuevas: **`--actor=` y `--fd=`**. Sin ellas el panel **no se abre** y te
lo dice por consola. Es a propósito: pedirte un veredicto para descubrir después que no se puede
firmar sería hacerte trabajar para nada.

## Paso 3 · Decidir

En `s15` sale un panel distinto al de antes. **No te pide que grabes nada** — no hay camino que
demostrar, hay que decidir quién tiene razón:

- Arriba, qué pedía el plan y qué no cuadra.
- Debajo, **lo que la pantalla sí dice**, medido en vivo y ordenado por parecido con lo esperado.
- **«Ninguno de estos, lo señalo yo»** si el resultado bueno no está en la lista: lo pulsas en la
  página y se toma su texto.
- Y tres botones **al mismo nivel**:

| Botón | Cuándo | Qué firma |
|---|---|---|
| **La aplicación tiene razón** | el criterio del FD estaba mal escrito | `app`, **con el literal que elijas** |
| **Es un defecto** | la aplicación debería mostrar eso y no lo muestra | `fd` |
| **Luego** | no lo tienes claro ahora | `defer` |

**Los tres continúan el run.** Ninguno es la salida «buena».

En este caso concreto la respuesta honesta es discutible, y eso es parte de lo que quiero que me
cuentes: la lista de permisos está vacía porque no hay solicitudes, no porque la aplicación falle.

> Si pulsas **«La aplicación tiene razón» sin elegir texto**, el panel vuelve y te lo dice. No es
> un despiste del programa: una decisión que no dice **qué** dice la aplicación no sirve para nada
> después — no habría con qué sustituir el criterio del FD.

## Paso 4 · Ver qué quedó firmado

```powershell
npm run qa:decisions -- --site=orangehrm --vigentes
```

Tu decisión tiene que salir con **tu nombre**, su criterio (`CP001`), su paso (`.../s15`) y grado
**`en-vivo`** — miraste la pantalla de ese run, no una reproducción en limpio, y eso queda escrito
en vez de disfrazarse de algo más fuerte.

```powershell
npx tsx copilot/src/walk-scoreboard.ts .work/panel/veredicto
```

**El paso sigue contando como bloqueado, incluso si dijiste que la aplicación tiene razón.** No es
un olvido: lo que se midió es que el texto del FD no está. Que tú adoptes otro literal cambia el
criterio del **próximo** run, no lo medido en éste. Pintarlo de verde aquí sería fabricar
exactamente el verde falso que encontraste tú.

## Volver al punto de partida

```powershell
Copy-Item .work\panel\walk-script.antes-veredicto.json .work\panel\walk-script.json -Force
```

---

## Qué quiero que me cuentes

1. **¿El panel te dio lo suficiente para decidir sin salir de él?** Sobre todo: ¿la lista de lo que
   dice la pantalla te sirvió, o tuviste que ir a mirar la aplicación por tu cuenta?
2. **¿Los tres botones te parecieron del mismo peso?** Si alguno «tira» más que los otros, es un
   defecto de diseño: el panel no puede empujarte a adoptar la aplicación.
3. **Cuánto tardaste.** La cifra que tenemos es la tuya: 3-4 minutos por panel, y era antes de los
   arreglos. Ésta es de otro tipo de panel, así que cuenta aparte.
4. **Si dudaste sobre qué botón tocaba en `s15`**, dímelo con las palabras que usarías tú. Es lo que
   va a definir cómo se redacta la pregunta.

## Si algo se tuerce

| Síntoma | Qué hacer |
|---|---|
| Sale «NO se abre el panel de veredicto» | Te falta `--actor=` o `--fd=`. El mensaje dice cuál |
| «el acta tiene la cadena rota» | No fuerces nada: pásame la salida de `npm run qa:decisions -- --site=orangehrm` |
| Parece colgado | Mira si existe `.work\panel\veredicto\assist-pending.json`. Si existe, **te espera** |
| Más margen | `--assist-timeout=1800` (segundos) |
