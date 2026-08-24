# Plan — el dato que se quema

**Que un flujo que consume un objeto de negocio deje de parecer un problema de calidad cuando lo que
falta es un dato.**

**Origen**: sesión del 2026-08-24. El QA planteó el caso que rompe todo lo demás: *«imagínate que
tienes una póliza y esa póliza se quema»*. Un flujo que anula una póliza no se puede repetir con la
misma póliza. Ni hoy, ni en el próximo run, ni en CI a las tres de la mañana.

**Estado**: diseño, no implementado. Es el agujero más grande del producto para banca y seguros,
donde la mitad de los flujos que importan consumen algo.

---

## 1. Lo que el producto NO va a hacer

**No va a crear pólizas.** No puede y no debe: no sabe qué es una póliza, ni qué estado necesita, ni
tiene permiso en el entorno del cliente. Cualquier diseño que lo intente es fabricación.

Lo que sí debe hacer, y es todo el valor de este plan: **dejar de disfrazar la falta de dato como un
fallo de calidad**.

Hoy, si el pool de pólizas se agotó porque el batch nocturno no ha repuesto, el test abre el
navegador, no encuentra ninguna fila en el listado y falla con un timeout sobre un locator. El QA se
pasa la mañana depurando un locator que está perfecto. Ese es el defecto a arreglar.

## 2. La línea de corte: quién declara qué

Tres capas con dueños y ritmos distintos. Meterlas en el mismo documento es el error de base:

**El FD dice EN QUÉ ESTADO hace falta el dato.** «Una póliza en estado Vigente emitida hace menos de
30 días» es una precondición **funcional** y le corresponde al FD. Ciclo de vida: por release, firmado.

**El contract dice CÓMO SE OBTIENE aquí.** «Las pólizas salen de este comando / de este endpoint / de
este pool que repone el batch de las 02:00» es un hecho **operativo** del entorno: no existía cuando
se escribió el FD, no lo controla el mismo equipo, y cambia cada semana. El mismo FD se prueba en tres
entornos durante dos años.

Y **nunca en un fichero de contexto en prosa** para que lo lea el modelo. Nadie lo versiona, nadie
comprueba que siga siendo cierto, y se podre en silencio — la forma exacta de la familia D2. Está
medido en este proyecto que arreglar al productor con prosa es moneda al aire: el mismo prompt declaró
un campo en 18/18 elementos una corrida y en 0/31 la siguiente (D34).

Cuando el FD **no** dice el estado —que es lo normal— eso entra por el camino del drift y la enmienda
firmada de [plan-panel-y-acta.md](plan-panel-y-acta.md).

## 3. Diseño

### 3.1 La sección del contract

```yaml
data:
  poliza_vigente:
    para: RF-014                  # qué precondición del FD cubre
    obtener: 'npm run datos:poliza -- --estado=vigente'
    se_consume: true              # se quema al ejecutar
    minimo: 5                     # por debajo, avisa antes de correr

flows:
  cancelacion-poliza:
    necesita: [poliza_vigente]
```

El agente **no sabe qué es una póliza: ejecuta el comando que el QA declara y usa lo que devuelva**.
Misma filosofía que `auth.entry_steps`: no adivina cómo se entra al login, honra lo declarado.

Validación en `src/contract-validator.ts`, como el resto: schema, enums, coherencia (un flujo que
`necesita` algo no declarado en `data` es un error del contract, no un fallo en ejecución).

### 3.2 El veredicto `sin-dato`, de primera clase

**Es el corazón del plan.** Un flujo cuyo dato no está disponible **no abre el navegador** y no
produce un rojo. Produce:

```
cancelacion-poliza: NO EJECUTADO — sin dato disponible
  (pool de poliza_vigente vacío; mínimo 5, quedan 0)
```

La suite reporta: *5 verdes · 1 no ejecutado por datos · 0 rojos*. **La suite no miente**, y el QA
sabe en diez segundos que tiene un problema de entorno y a quién pedírselo.

Toca: `run-s4-mecanico.ts` (etapa nueva antes del Acto 5), el `qa-automator-run-summary.json`, y el
reporte. En el reporte el estado de los datos va **separado de la calidad**, no mezclado.

### 3.3 Consumo anotado

Cada run anota qué objeto quemó (`consumido: POL-4711`) en el run-summary y el audit-log. Para que
nadie lo reutilice por error y para que el estado del pool sea visible.

### 3.4 Precondición temporal

Un caso real que ningún FD menciona: *la póliza no es cancelable hasta 24 h después de emitirse*. La
precondición de datos tiene dimensión temporal. Campo `antiguedad_minima` en la declaración, y si el
pool solo tiene pólizas de hoy → `sin-dato`, no rojo.

## 4. Lo que aporta el cliente, no nosotros

Las cuatro estrategias reales, para que la conversación con quien lleve el entorno sea concreta. El
producto **invoca** cualquiera de ellas; no implementa ninguna:

1. **Fábrica por API** — el test crea su póliza antes de empezar. Lo mejor, y lo que hacen los equipos
   maduros. Necesita un servicio de creación (normalmente el mismo que usa el front) y permiso en
   preproducción.
2. **Pool precargado** — cien creadas en el estado correcto; el test coge una y la marca gastada. La
   respuesta pragmática cuando no hay API, y lo que de verdad se hace en seguros. Su pega: se agota, y
   ese día la suite se pone en `sin-dato` — que ahora es un estado legible y no un rojo confuso.
3. **Restaurar estado** (snapshot de BD) — limpísimo y políticamente casi imposible en un entorno
   compartido: borrarías el trabajo de otros equipos.
4. **Crear por la interfaz** — la primera fase del test crea lo que la segunda consume. Más lento y
   más frágil, pero no depende de nadie. El puente realista mientras se consigue lo primero.

Y el caso que no tiene salida limpia: **el flujo que cruza dos sistemas** (la póliza se crea en el
host, en una pantalla 3270, y se consume en el portal web). La receta honesta es «pídesela al equipo
X» y el flujo es **semiautomático**: debe decirlo, en vez de fingir que es una suite de regresión.

## 5. Comprobaciones falsables

- **El caso feliz**: con el comando declarado, el run llama, recibe un identificador, lo inyecta como
  fixture, ejecuta, verde, y el resumen anota el consumo.
- **El caso que da todo el valor**: con el pool a cero, el flujo **no abre navegador**, el veredicto es
  `sin-dato` con el motivo y el mínimo, y **la suite no tiene rojos**. Este es el par falsable: sin el
  arreglo, el mismo escenario da un rojo con un timeout sobre un locator correcto.
- **El contract incoherente**: un flujo que `necesita` un dato no declarado se rechaza en la
  validación, antes de gastar un token.
- **La precondición temporal**: pool con pólizas de hoy y `antiguedad_minima: 24h` → `sin-dato`.

## 6. Fuera de alcance

- Crear datos. Nunca.
- Adivinar de dónde salen los datos si el contract no lo declara: sin declaración, el flujo corre como
  hoy y el `sin-dato` no existe (sin regresión para los sitios que no lo necesitan).
- Gestionar el pool (rellenarlo, medir su nivel en el origen). El producto lee lo que el comando
  devuelve; el pool es del cliente.

## 7. Por qué esto importa más de lo que parece

Todo lo diseñado en [plan-panel-y-acta.md](plan-panel-y-acta.md) hace la herramienta **usable hoy**
para el día a día del QA. Este plan es lo que la hace **repetible siempre**. Son dos cosas distintas y
la segunda es la que decide si una suite de regresión sirve en banca o es un adorno que se pone rojo
cada dos noches por razones que no son defectos.
