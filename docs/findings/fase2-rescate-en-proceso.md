# Fase 2 medida en campo — el rescate que no muere

**Cinco peticiones de rescate en un solo run de EspoCRM: cero relanzamientos, cero replays, el
navegador nunca se cerró. 84/89 pasos, el mejor resultado del sitio hasta hoy — y de los 5 bloqueos
que quedan, NINGUNO es de resolución.**

**Qué es**: la medición en campo de la Fase 2 de
[plan-rescate-en-proceso.md](../tasks/plan-rescate-en-proceso.md), con los dos papeles del diseño
separados de verdad por primera vez: **el QA conduce el walk en su máquina y el orquestador contesta
los rescates**. El walker no habla con ningún LLM — escribe `rescue-request.json` y espera un
`rescue-response.json` (regla dura #5 intacta).
**Fecha**: 2026-09-02. **Sitio**: `demo.espocrm.com`, guion de 10 flujos / 89 pasos.
**Comando**: sin `--assist` (no hay panel: el objetivo era el rescate por IA), `--rescue-budget=4`,
canal declarado con `npm run qa:canal -- --listener=claude --timeout=120`.

---

## 1. El resultado, contra las líneas base del mismo sitio

| run | ejecutados | bloqueos | rescates | relanzamientos del QA |
|---|--:|--:|--:|--:|
| motor solo (línea base) | 71/89 | 18 | 0 | 0 |
| estreno manual con panel | 80/89 | 9 | 0 | 0 |
| **Fase 2 con IA** | **84/89** | **5** | 4 consumidos | **0** |

Y el reparto por clase de los 5 que quedan:

| clase | bloqueos |
|---|--:|
| `drift` (falla el oráculo, no el locator) | **5** |
| `cascada` · `accion` · `panel` · `rescate` | **0** |

**No queda ni un bloqueo de resolución.** Los cinco son postcondiciones del FD que no se observan —
lo que ni un rescate ni un panel arreglan, porque lo decide un QA.

## 2. El caso que justificaba el diseño, cumplido

**`cp007-alta-cuenta/s8` y `s9` son pasos CONSECUTIVOS**, los dos bloqueados. La traza del audit-log:

```
09:30:04  rescate resuelto cp007-alta-cuenta/s8 → getByRole('textbox', { name: 'Ciudad' }).nth(0)
09:30:05  rescate solicitado: cp007-alta-cuenta/s9 (fill)      ← UN SEGUNDO después
09:30:53  rescate resuelto cp007-alta-cuenta/s9 → getByRole('textbox', { name: 'País' }).nth(0)
```

Un segundo entre resolver `s8` y que `s9` pregunte, **en la misma sesión y con la pantalla que acababa
de dejar el arreglo anterior**. Con el modelo viejo eso son dos `exit 42`, dos relanzamientos y **dos
replays completos de `cp007` desde su primer paso** (D66). Es exactamente lo que el QA planteó al
abrir esta línea de trabajo — *«si pudiera pulsar aceptar, en el mismo browser podría verse la nueva
pantalla inmediatamente»* — y lo que ni el modelo reactivo ni el diferido pueden dar.

**Y la cascada cobró el premio que el censo estimó**: `cp009-baja-cuenta` encadena TRES puertas
(`Acciones` → `Eliminar` → `Eliminar`). **Un solo rescate** (s8) las abrió: `s9`, `s10` y `s11`
resolvieron solos y el flujo entero acabó en verde, 12 pasos de 12.

## 3. Lo que NO demuestra este run, y hay que decirlo

**Que la IA resuelva sola.** Contestó el orquestador, y **en dos de los cuatro rescates útiles usó la
enseñanza previa del QA** en vez de deducirla del snapshot:

- `cp009-baja-cuenta/s8` — **el snapshot podado NO bastaba**: no hay ningún botón llamado «Acciones»
  en la pantalla; hay `button "Editar"` y detrás uno **sin nombre**, que es el desplegable. Un
  respondedor con solo esa foto tendría que declinar. Se resolvió con el locator que el QA había
  señalado en su estreno (`getByRole('group').nth(0) >> getByRole('button').nth(1)`).
- `cp001-acceso/s1` — snapshot **casi vacío** (`- contentinfo: - link "EspoCRM, Inc."`): la SPA no
  había pintado. Es territorio D72/D73.

Esto **confirma en campo** lo que midió el banco A/B del 2026-09-01: el cuello de botella es la
EVIDENCIA, no el modelo. Y da la forma concreta de la escalera de evidencia que la Fase 2 del plan
describe y que hoy **no está automatizada**: aquí la recorrió el orquestador a mano, leyendo el
`assist-patch.json` del estreno del QA.

**Dos locators quedaron frágiles a propósito y a disgusto.** `cp007/s8` y `s9` se resolvieron con
`.nth(0)` porque el snapshot muestra `textbox "Ciudad"` **dos veces** —facturación y envío— y las
cabeceras de sección no están en el árbol de accesibilidad, así que no había forma de acotarlas con
la evidencia disponible. Un posicional desbloquea el paso pero **no entra en memoria durable**
(`aliasPromotionVerdict` lo rechaza), que es justo lo que avisa el semáforo «¿durará?» de D81. El
arreglo de verdad de esos dos pasos es del guion, no del rescate: son D75 (`hint.placeholder`, que el
motor no puede leer) con un `scope` declarado que nadie consume (D76).

## 4. El fleco que este run destapó, y es el más importante

**Dos de los cuatro rescates fueron para pasos que el QA YA HABÍA ENSEÑADO** en su estreno del
2026-09-01 (`cp003/s5` y `cp009/s8`, los dos en su `assist-patch.json`).

La cadena de por qué volvió a preguntar:

1. el QA los enseñó en el panel y quedaron en `assist-patch.json`;
2. la verificación por replay falló (**D77**, arreglado el 2026-09-01 con D79);
3. la fusión (`merge-assist-patch`) **exige aprobación explícita** y nunca se ejecutó;
4. el run siguiente no tenía ni alias ni guion corregido → **volvió a preguntar lo mismo**.

**El producto aprendió y no se lo guardó.** Y no es un defecto de una pieza: es el ciclo
panel → verificación → fusión → memoria durable, que está construido por trozos y no se ha cerrado
de punta a punta ni una sola vez. Mientras siga así, **cada run vuelve a pagar lo que el anterior ya
aprendió** — y eso es lo que convierte una herramienta que ayuda en una herramienta que capitaliza.

Nota alentadora del mismo run: los cuatro rescates **sí se promovieron a alias** (entradas
`alias-promotion` a las 09:28:11, 09:30:58 y 09:32:29), y uno se usó dos veces dentro del propio run
(`alias-hit s5` a las 09:31:03 y 09:31:10). El mecanismo de memoria funciona; lo que falta es el
puente desde lo que enseña el QA.

## 5. Un cabo suelto que no explico

`cp001-acceso/s1` **pidió rescate dos veces** (09:24:13 y 09:25:18, 65 s de diferencia) y al final
**resolvió solo, sin consumir ningún rescate** — no hay registro suyo en `rescues` y su report es
`ok`. Que resolviera solo se explica: la SPA acabó de pintar. Lo que **no** puedo explicar desde los
artefactos es la segunda petición, porque ninguno de los dos ramales de la espera dejó traza:

- si el plazo se hubiera agotado habría un `skip` («nadie contestó… se degrada a exit 42») y el
  proceso habría salido;
- si no hubiera habido canal, un `skip` («rescate sin espera en proceso»).

No hay ninguno de los dos. Las dos explicaciones candidatas —un relanzamiento del walker que el
audit-log append-only no distingue, o una salida de la espera que no registro— son indistinguibles
con lo que hay en disco. **Coste real: cero** (no consumió presupuesto ni respuesta), pero es una
laguna de instrumentación mía: **la espera debería registrar SIEMPRE su desenlace**, no solo el éxito
y el plazo agotado. Se arregla en la próxima rebanada y el siguiente run lo zanja.

## 6. Límites de esta medición

- **Un sitio, un run, un respondedor** (el orquestador, con la memoria del proyecto disponible).
- El reloj está dominado por MI latencia como respondedor (35-73 s por rescate), no por el
  mecanismo: la espera en sí es un sondeo de 300 ms. Un respondedor automático mediría otra cosa.
- No hay brazo de control en el mismo día: la comparación es contra runs anteriores del mismo guion y
  el mismo sitio, con arreglos intermedios (D78, D79, D81) que también mejoraron el resultado. **La
  mejora de 9 a 5 bloqueos no es toda de Fase 2**; lo que sí es atribuible a Fase 2 en exclusiva es
  el **cero relanzamientos** con cinco peticiones, que antes eran cinco.
