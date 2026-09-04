# Guía 06 — el walker con rescate de IA

**Qué vas a ver**: la regresión corre sola, y cuando el walker no consigue resolver el elemento de un
paso, **se para en esa misma pantalla** y le pregunta a Claude. Claude mira el trozo de pantalla que el
walker le manda, contesta un locator —o dice que no puede—, y el walker sigue **desde ese mismo paso**,
con el mismo navegador y la misma sesión.

**Qué NO es esto**: no es el panel. Aquí no te pregunta a ti; le pregunta a la IA. El panel es la
[guía 05](05-panel.md), y las dos usan el mismo guion a propósito.

> **Los commands vienen del plugin.** Si `/ia4d-qa-automator:regression` no te aparece, no tienes el
> plugin instalado: el workspace aporta los scripts, el plugin aporta los commands.

## Antes de empezar

```powershell
cd C:\Users\USUARIO\qa\rbp-lab
npm.cmd run qa:healthcheck
```

Debe acabar en `Healthcheck OK`.

## Lanzarlo

Abre Claude Code en el workspace y pídele:

```
/ia4d-qa-automator:regression --script=examples/06-restful-booker/regresion-corta.walk.json --base-url=https://automationintesting.online/ --contract=config/style-contracts/restful-booker.yaml --work-dir=.work/lab --rescue-budget=4 --criterios=examples/06-restful-booker/criteria.json
```

**La barra final de la URL no es un adorno.** Sin ella el pre-flight de compliance responde
`URL not declared in allowed-targets`, que suena a que falta permiso cuando lo que falla es el patrón.

Lo primero que verás es un aviso de compliance (`W1: URL allowed but lacks non-prod prefix`) y a Claude
preguntándote si sigue. Es correcto: el sitio está autorizado en la receta, pero su URL no lleva prefijo
de no-producción y el gate lo dice en vez de callárselo. Contesta que sí.

## Lo que pasa, parada por parada

Son **tres paradas**, todas en el mismo caso: el alta de habitación del panel de administración. Los
otros dos casos corren enteros sin preguntar nada.

### Las dos primeras paradas — dos listas desplegables sin marcador

El plan pide dos `select` por su marcador de código (`type` y `accessible`) y **esos marcadores no
existen en la página**. Claude recibe el trozo de pantalla y ve esto:

```
- combobox:
  - option "Single" [selected]
  - option "Twin"
  - option "Double"
  - option "Family"
  - option "Suite"
- combobox:
  - option "false" [selected]
  - option "true"
```

Dos listas, ninguna con nombre. Pero **se distinguen por lo que contienen**: una tiene tipos de
habitación, la otra sólo `false` y `true`. Claude contesta por contenido, no por posición:

```
getByRole('combobox').filter({ hasText: 'Suite' })
getByRole('combobox').filter({ hasText: 'false' })
```

**Por qué importa que sea por contenido**: `.nth(0)` habría funcionado hoy y se habría roto el día que
alguien añada un campo antes. Un locator por contenido sobrevive a que cambien el orden.

### La tercera parada — y aquí Claude dice que NO

El plan pide el campo del precio (marcador `roomPrice`, que tampoco existe). En la pantalla hay **dos
cajas de texto**: una ya lleva el nombre de la habitación y la otra está vacía.

```
- textbox: "70623"
- textbox
```

Ni etiqueta, ni texto de ayuda, ni nombre accesible. **No hay forma de distinguirlas**, y Claude
declina con su motivo. Verás algo así:

```
"paso": "cp007-alta-habitacion/s8",
"locator": null
```

**Esto es el resultado correcto, no un fallo.** Adivinar por posición aquí significa escribir el precio
en el número de habitación. Y sí, seguramente el campo tenga un `id="roomPrice"` — pero eso no se ve en
lo que el walker le manda, y responder un atributo que no has visto es inventarlo. **Ese campo lo
resuelves tú en dos segundos con el panel de la guía 05**: esa es la división del trabajo.

## Al terminar

```
"stats": {
  "steps_total": 24,
  "steps_executed": 20,
  "steps_blocked": 4,
  "rescues_used": 3
}
```

Y el epílogo del walker, que merece leerse entero:

```
[dom-walker] OK  3 pantallas, 20/24 pasos, 3 rescates, 4 bloqueados
[dom-walker] 1 postcondición(es) pasaron por COINCIDENCIA PARCIAL:
  - cp004-contacto-envio/s8: el FD pedía 'Thanks for getting in touch'
    y en pantalla hay 'Thanks for getting in touch Ana Prueba!'
[dom-walker] 4 postcondición(es) pasaron con un paso ANTERIOR del mismo flujo bloqueado
  (pueden estar observando el estado previo)
```

Los dos avisos son el producto haciendo su trabajo:

- **coincidencia parcial**: el FD pedía un fragmento y en pantalla hay más texto. Pasa, pero te lo dice
  — un oráculo laxo aprueba cosas que no querías.
- **postcondición con un paso anterior bloqueado**: esas comprobaciones pasaron, pero antes había un
  paso sin ejecutar, así que **puede que estén mirando la pantalla de antes**. Un verde que quizá no
  significa lo que parece; el producto prefiere decirlo a apuntarse el tanto.

## Los cuatro pasos bloqueados, y por qué está bien

| Paso | Clase | Por qué |
|---|---|---|
| `cp004/s1` | `panel` | el enlace «Contact» aparece dos veces: **elegir es tuyo**, no de la IA |
| `cp005/s1` | `panel` | lo mismo |
| `cp007/s8` | `rescate` | Claude declinó: dos cajas indistinguibles |
| `cp007/s11` | `drift` | la habitación no llegó a crearse (faltaba el precio), así que su comprobación falla |

**Fíjate en que la IA no fue preguntada por `cp004/s1` ni `cp005/s1`.** No es un olvido: el triaje manda
la ambigüedad al humano y sólo el «no encuentro esto» a la IA, porque elegir entre varios candidatos a
ciegas es adivinar. El mismo guion, dos clases de ayuda, cada una a quien le toca.

## Qué mirar con lupa

| Señal | Qué significa si no aparece |
|---|---|
| El walker dice `RESCATE PENDIENTE ... El navegador NO se cierra` | si en su lugar el proceso termina, el canal de rescate no se declaró y estás en el camino viejo |
| Claude contesta **por contenido** (`filter({ hasText: ... })`) | si contesta `.nth(0)`, funcionará hoy y se romperá al primer cambio de orden |
| La tercera parada se **declina** | si Claude se inventa un locator ahí, está adivinando: eso es lo que produce verdes falsos |
| `rescues_used: 3` con **cero** relanzamientos | si el proceso se muere y hay que reanudar, la espera en el sitio no está funcionando |

## Si algo va mal

El walker deja su propio registro en `.work/lab/walker.log`. Ábrelo sólo si algo se atasca: mientras el
run avanza, Claude te va contando lo que hace.
