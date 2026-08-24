# Los tres rojos de la iteración 2 de Dolibarr: dos clases, no tres

**2026-08-24.** Causa de los tres rojos que quedaron sin arreglar, volcada de los artefactos del run
antes de que el workspace desaparezca.

**Por qué existe este documento.** El diagnóstico era perecedero: `loop-dolibarr` lleva un payload
**pre-G1** y su `pre-review.ts` y `verify-locators.ts` no coinciden con ningún otro directorio de
campo, ni con el producto de hoy. Redesplegar ese sitio con el producto actual regeneraría otros
specs, y estos tres rojos habría que volver a medirlos desde cero. La causa está establecida contra
los artefactos, no de memoria: `playwright-results.json`, los POMs de `tests/pages/dolibarr/` y una
pasada retroactiva del gate actual.

Resultado del run: **3 verdes** (TC-001 login, TC-003 productos, TC-006 login inválido) y **3 rojos**
(TC-002 terceros, TC-004 pedidos, TC-005 facturas).

---

## Clase A — el índice posicional aterriza en el mueble (2 de los 3)

**TC-002, terceros.** El plan espera la ficha; la aplicación se queda en el listado:

```
Expected pattern: /\/societe\/card\.php/
Received string:  ".../societe/list.php?contextpage=thirdpartylist&…&page=354&mainmenu=companies"
6 × unexpected value
```

**TC-005, facturas.** Idéntico:

```
Expected pattern: /\/compta\/facture\/card\.php/
Received string:  ".../compta/facture/list.php?contextpage=invoicelist&…&page=874"
11 × unexpected value
```

El dato que delata la causa es `page=354` y `page=874`. No es que el clic no navegue: **navega a otra
página del listado**. El enlace que se pulsó era un control de paginación, no la referencia de un
registro.

Los locators lo confirman. Terceros:

```ts
this.resultsTable = this.page.getByRole('table').first();
// …
return this.resultsTable
  .getByRole('cell').filter({ has: this.page.getByRole('link') }).first()
  .getByRole('link').first();
```

Facturas, sin acotar a ninguna tabla:

```ts
this.firstInvoiceRefLink = this.page
  .getByRole('row').filter({ has: this.page.getByRole('link') }).first()
  .getByRole('link').first();
```

## El caso de control verde, en el mismo sitio y el mismo run

Productos hace lo mismo y **pasa**. La diferencia está escrita en su propio comentario, que es la
explicación del mecanismo — la escribió el Writer al arreglarlo ahí:

> Dolibarr pinta la barra de paginación como fila/tabla: filtrar `row` sin acotar a la tabla de
> resultados hace que la fila de paginación cuente primero y el índice se desplace, aterrizando en la
> cabecera de columnas en vez de la primera fila de datos.

Y su locator aplica las dos correcciones que a los otros dos les faltan:

```ts
this.firstProductRefLink = this.page
  .getByRole('table').filter({ has: this.technicalId })   // acota por un columnheader MEDIDO
  .getByRole('row').filter({ has: this.page.getByRole('link') })
  .nth(1)                                                 // la 1.ª fila con enlace es la cabecera ordenable
  .getByRole('link').first();
```

Dos ausencias, no una: **el ancla del contenedor** (`.filter({ has: <elemento medido> })` en vez de
`.first()` sobre `table`) y **el desplazamiento del índice** (`.nth(1)` en vez de `.first()`, porque
la primera fila con enlace es la cabecera con los enlaces de ordenación).

Lo relevante para el producto no es el arreglo —es de una línea— sino que **el conocimiento existía
dentro del mismo run y no se propagó a los POMs hermanos**. Tres listados con la misma estructura de
página: uno resuelto y documentado, dos rotos por lo mismo.

## Clase B — `exact: true` contra un nombre con espacio inicial (el tercero)

**TC-004, pedidos:**

```
Locator: getByRole('columnheader', { name: 'Ref.', exact: true })
Expected: visible → element(s) not found
```

Es el hallazgo de I4, ya cerrado como mecanismo: el nombre accesible real de esa columna en pedidos
es `" Ref."` **con espacio inicial**, y en facturas es exacto. `exact: true` se introdujo para
resolver un `ambiguous(3)` medido (`Ref.` es subcadena de `Ref. customer` y de `Project ref.`), y
funcionó en facturas y rompió en pedidos. Misma corrección, dos resultados, y por eso hizo falta G3:
el informe ahora dice el nombre accesible **real** en vez de solo que no resuelve.

## Qué ve el gate actual, medido en retroactivo

Pasada del `pre-review.ts` de hoy —con G1— sobre estos seis specs y el `discovery-report.json` del
run, que es la única forma honesta de saber si el gate habría servido:

```
specs_total 6 · specs_clean 0 · must_fix_total 25 · should_fix_total 68
```

El contraste con lo que el propio run declaró en su día está en su `qa-automator-run-summary.json`:

```
pre_review: { specs: 6, clean: 6, must_fix: 0 }
```

**Seis de seis limpios entonces; cero de seis limpios ahora.** Ese salto de 0 a 25 must-fix sobre el
mismo código y el mismo discovery es la medida de lo que G1 añade — y también el motivo por el que
este directorio no sirve como línea base: el veredicto que guardó no es el que daría hoy.

| Rojo | ¿lo nombra G1? | Qué dice |
|---|---|---|
| TC-004 pedidos (`Ref.`) | **sí** | `ARREGLO SIN REMEDIR: el discovery lo midió 'ambiguous(2)'` — exacto |
| TC-002 terceros (paginación) | **no** | 13 must-fix en el spec, **ninguno** sobre el locator que falló |
| TC-005 facturas (paginación) | **no** | 3 must-fix; el que señala (`Ref.`, L31) **no es** el que rompió |

**G1 alcanza 1 de 3.** Y el que alcanza lo alcanza con el mensaje correcto.

Los otros dos son invisibles **por diseño**, no por un fallo de implementación: K0.41 delimitó la
regla dura a las anclas que llevan palabras del guion, y `getByRole('row')` a secas no es la
ambigüedad de la que habla la regla. G2 tampoco los vería: cuenta coincidencias por locator, y un rol
sin nombre coincide legítimamente con muchas. El fallo aquí no es «el nombre no resuelve» sino **«el
índice apunta al mueble»**, que es otra cosa.

## La regla que sí los cazaría, con su par falsable ya en el corpus

`MF-indice-sin-ancla`: un `.first()` o `.nth(n)` sobre una cadena de roles **sin nombre** que no está
acotada por un contenedor filtrado con un elemento **medido**. Es exactamente lo que distingue al
verde de los dos rojos, así que el par falsable existe y no hay que fabricarlo:

- **debe señalar** `third-parties-list.firstResultLink` y `customer-invoices-list.firstInvoiceRefLink`
- **no debe señalar** `products-list.firstProductRefLink`

**No implementada.** Queda escrita con su comprobación para cuando se decida; el criterio de muerte
es el de siempre: si marca el verde, la regla no sirve.

## Defecto

**D55** — El índice posicional sobre roles sin nombre es ciego al mueble: `.first()`/`.nth()` sin
ancla medida aterriza en la barra de paginación o en la cabecera, y **ningún gate lo ve** (G1 por
diseño, K0.41; G2 tampoco, un rol sin nombre coincide con muchas). Medido en Dolibarr iter2: 2 de 3
rojos, con caso de control verde en el mismo run cuyo comentario explica el mecanismo. Pariente de
D2: el conocimiento existía en un POM y no se propagó a los hermanos.
