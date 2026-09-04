# Guía 03 — S3: el Documento Funcional y la URL

**Qué vas a ver**: le das el FD de los diez casos y la URL, y el agente **extrae los criterios**, los
mapea contra la aplicación real, genera los tests con su trazabilidad, y —esto es lo importante— **te
dice qué pide el FD que la aplicación no tiene**. Eso último se llama *drift*, y es la razón de ser de
esta puerta.

**Qué NO hace**: no inventa criterios. Si el FD no dice algo, sale como pregunta de refinamiento, no
como suposición.

## Antes de nada, el material

El FD está en [`../restful-booker-fd.md`](../restful-booker-fd.md). **Léete su última sección**, «Nota
para quien ejecute la prueba»: declara tres tensiones a propósito, y una de ellas —la de CP010— es
justo lo que esta puerta tiene que sacar a la luz.

## Paso 1 — mira los criterios antes de correr nada

El FD en markdown no es un fichero de criterios; hay un conversor determinista que lo traduce, **sin
LLM**:

```powershell
cd C:\Users\USUARIO\qa\rbp-lab
```

```powershell
npx.cmd tsx src/scripts/fd-to-criteria.ts --fd=examples/06-restful-booker/restful-booker-fd.md --url=https://automationintesting.online/
```

Sin `--out` es **vista previa: no escribe nada**. Debe listar los diez casos con su línea exacta
(verificado el 2026-09-04):

```
[qa:criterios] 10 caso(s) en restful-booker-fd.md
  CP001  restful-booker-fd.md:16-45         Reserva de habitación individual
  CP002  restful-booker-fd.md:49-68         Consulta de disponibilidad
  ...
  CP010  restful-booker-fd.md:249-275       Reserva rechazada por fechas ocupadas

[qa:criterios] VISTA PREVIA: no se ha escrito nada. Añade --out=<ruta.json> para generarlo.
```

Esa columna del medio —`restful-booker-fd.md:249-275`— es la trazabilidad: cada criterio sabe **de qué
líneas del documento salió**. Es lo que después aparece dentro del panel del walker (guía 05) y en la
cita de cada test.

El `criteria.json` del lab ya está generado con este mismo comando; puedes regenerarlo añadiendo
`--out=examples/06-restful-booker/criteria.json` y comprobar que sale idéntico.

## Paso 2 — lanza la puerta S3

```
/ia4d-qa-automator:spec-refiner --fd=examples/06-restful-booker/restful-booker-fd.md --url=https://automationintesting.online/ --style=config/style-contracts/restful-booker.yaml
```

Antes de tocar el navegador, el agente comprueba dos cosas y las verás pasar:

- **el módulo**: con `--fd` + `--url` resuelve `S3 / functional`. (Sólo con `--url` sería S4, la guía 02.)
- **el pre-flight de compliance**, que **no tiene flag para saltárselo**. Con este sitio da
  `warn / W1 / URL allowed but lacks non-prod prefix`: la URL está autorizada en la lista, pero no lleva
  prefijo de entorno no productivo. El agente te lo enseña y te pregunta. Es lo correcto — un aviso que
  se calla no protege a nadie.

**La barra final de la URL importa**: sin ella el veredicto sería `block / C1 / URL not declared in
allowed-targets`, que suena a falta de permiso cuando lo que falla es el patrón.

## Paso 3 — el checkpoint es tuyo

En algún punto el agente te enseñará lo que ha encontrado y **te pedirá que decidas** qué casos se
materializan. No es un trámite: acotar es lo que evita generar treinta tests mediocres en vez de seis
buenos. Elige pocos la primera vez.

## Paso 4 — lee el drift, que es el premio

Al terminar tendrás, en `.work/restful-booker/`:

| Fichero | Qué contesta |
|---|---|
| `drift-report.json` | **qué pide el FD que la aplicación no da** |
| `discovery-report.json` | qué pantallas y elementos encontró, y a qué criterio corresponde cada uno |
| `qa-automator-run-summary.json` | el resumen del run |
| `refinement-questions.md` | lo que el FD no dejaba claro — preguntas, no suposiciones |

Y los tests en `tests/e2e/restful-booker/`, cada uno citando su criterio.

**Mira CP010 en el drift.** El FD exige que la aplicación avise cuando las fechas ya están ocupadas, y
la aplicación no avisa: su propio documento declara que ese paso «es el que el negocio espera, no
necesariamente el que la aplicación tiene». La respuesta correcta **no** es arreglar el test para que
pase: es dejar constancia de que hay una diferencia y que alguien decida. Un test verde ahí sería
adoptar un defecto.

## Paso 5 — ejecuta lo generado

```powershell
$env:QA_WORK_DIR='.work/restful-booker'
```

```powershell
$env:QA_BASE_URL='https://automationintesting.online/'
```

```powershell
npx.cmd playwright test tests/e2e/restful-booker/ --reporter=list
```

**Que algo salga rojo no es un fracaso del lab.** Este sitio es una demo compartida con estado: el
catálogo de habitaciones cambia y las reservas persisten. Antes de tocar un test, mira si lo que falló
es el test o el dato.

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| Cada criterio trae su `fichero.md:línea` | sin eso no hay trazabilidad al documento, sólo un id |
| El pre-flight **te pregunta** ante el `warn` | si pasa de largo, el gate no está haciendo su trabajo |
| Hay `refinement-questions.md` con preguntas | si el agente no preguntó nada sobre un FD de diez casos, sospecha: estará suponiendo |
| CP010 aparece como **drift**, no como test verde | un verde ahí significa que se adoptó el defecto |
