# Guía 02 — S4: sólo la URL

**Qué vas a ver**: le das una dirección y nada más. El agente explora la aplicación, propone un plan de
pruebas, te pide que elijas, genera los tests con sus objetos de página, los audita y los ejecuta.

**Es la puerta que impresiona** porque no hay que preparar nada. También es la que más te va a pedir a
ti: sin documento que le diga qué importa, **acotar es tu trabajo**.

## La regla que gobierna esta puerta: acota

Una aplicación de negocio tiene decenas de pantallas. Si le dices «explora», explora todo: caro, lento y
con un plan que no se parece a lo que tu equipo probaría. Por eso el agente **te obliga a acotar**: si no
declaras módulos, te enseña un aviso y sólo sigue si escribes literalmente `EXPLORAR SIN ACOTAR`.

Ese aviso no es burocracia. Es el producto negándose a gastar tu presupuesto adivinando.

## El comando

```
/ia4d-qa-automator:autonomous --url=https://automationintesting.online/ --style=config/style-contracts/restful-booker.yaml --flows=contacto --max-scenarios=3
```

| | |
|---|---|
| `--flows=contacto` | acota a un módulo. Empieza por uno: para ver la puerta, sobra |
| `--max-scenarios=3` | tope de casos a materializar. Sin él, 8 |
| `--style=` | sin esto usaría el contrato por defecto (el de SauceDemo), y las convenciones serían las de otro proyecto |

**La barra final de la URL importa**: sin ella el pre-flight responde `block / C1 / URL not declared in
allowed-targets`, que suena a falta de permiso cuando lo que falla es el patrón. Con ella da
`warn / W1 / URL allowed but lacks non-prod prefix`, el agente te lo enseña y decides tú.

Otros módulos que puedes probar después: `reserva`, `admin-rooms`, `admin-mensajes`.

## Las dos veces que te va a parar

1. **El aviso de compliance** (`W1`). El sitio está autorizado, pero su URL no lleva prefijo de entorno
   no productivo. Te lo dice y espera tu confirmación.
2. **El checkpoint del plan**. Te enseña lo que ha encontrado y qué casos propone. **Elige pocos.** Es el
   punto donde tu criterio de QA vale más que cualquier automatismo: el agente sabe qué hay en la
   pantalla, tú sabes qué le importa al negocio.

## Lo que te deja

| Dónde | Qué |
|---|---|
| `docs/test-plans/restful-booker/*.plan.md` | el plan de pruebas, versionado |
| `tests/e2e/restful-booker/*.spec.ts` | los tests |
| `tests/pages/restful-booker/*.page.ts` | un objeto de página por pantalla |
| `.work/restful-booker/discovery-report.json` | qué encontró explorando |
| `.work/restful-booker/qa-automator-run-summary.json` | el resumen del run |
| `.work/restful-booker/audit-log.json` | quién hizo qué, en orden |

Abre un `.spec.ts` y fíjate en tres cosas: usa el objeto de página en vez de selectores sueltos, lleva el
scan de accesibilidad inyectado, y **afirma un resultado de negocio**, no sólo que la página cargó.

## Compáralo con las otras puertas

Cuando termines las guías 03 y 04, vuelve aquí y compara los tests de las tres. Mismo sitio, mismo
motor, tres entradas distintas:

- **S4** (esta guía) no sabía qué importaba: el plan sale de lo que hay en pantalla.
- **S3** tenía el FD: los tests citan `CP004` y su línea del documento.
- **S2** tenía el Gherkin: los tests citan el `RF-NNN` del escenario.

**La diferencia no está en el motor, está en lo que sabías al empezar.** Esa es toda la tesis de los
cuatro módulos.

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| Te **obliga** a acotar o a escribir `EXPLORAR SIN ACOTAR` | si explora sin pedir permiso, la guarda del modo ciego no funciona |
| El pre-flight te **pregunta** ante el `warn` | si pasa de largo, el gate no está haciendo su trabajo |
| El checkpoint del plan **te lo enseña antes** de generar | generar sin enseñarte el plan es lo contrario de lo que vende esta herramienta |
| Los specs usan objetos de página, no selectores sueltos | si no, el Style Contract no se está aplicando |
