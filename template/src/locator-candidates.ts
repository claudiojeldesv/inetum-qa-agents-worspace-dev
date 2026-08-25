/**
 * Qué nombres de pantalla merecen enseñarse cuando un locator no resolvió.
 *
 * Nació en `verify-locators` (G3) para que el informe del verificador dijera con qué
 * está chocando un locator ambiguo en vez de un «no resuelve» mudo. Vive aquí porque
 * el **panel de asistencia** tiene exactamente el mismo problema un nivel arriba: D27
 * midió que el QA respondió «No existe» a un elemento que existía **tres veces** —
 * ambigüedad presentada como ausencia— porque el panel recibía la pista y no la causa.
 *
 * Es la misma pregunta («de lo que hay en pantalla, ¿qué se parece a lo que pedí?») y
 * tiene que dar la misma respuesta en los dos sitios: si el informe y el panel
 * ordenaran distinto, el QA y el Writer verían pantallas que no cuadran.
 *
 * Módulo puro y sin dependencias a propósito: lo importan un script de Node con
 * Playwright y el walker, y ninguno de los dos debe arrastrar al otro.
 */

/**
 * - `ambiguo`: los nombres que CONTIENEN el pedido — la semántica substring de
 *   `getByRole(..., { name })`, que es exactamente como se produjo la colisión. `Ref.`
 *   en Dolibarr lista `Ref.`, `Ref. customer`, `Project ref.` y se ve con qué choca.
 * - **no encontrado**: los que comparten alguna palabra (≥3 caracteres) con el pedido
 *   — candidatos a «el nombre real no es exactamente el caption». Sin ese filtro, una
 *   pantalla de navegación con 100 enlaces inunda la lista y deja de informar.
 *
 * Tope de 8: es un diagnóstico, no un volcado.
 */
export function candidatosParaInforme(nombres: string[], pedido: string, ambiguo: boolean): string[] {
  const p = pedido.toLowerCase();
  let cand: string[];
  if (ambiguo) {
    cand = nombres.filter((n) => n.toLowerCase().includes(p));
  } else {
    const palabras = p.split(/\s+/).filter((w) => limpio(w).length >= 3);
    cand = palabras.length === 0 ? [] : nombres.filter((n) => {
      const nl = n.toLowerCase();
      return palabras.some((w) => nl.includes(w)) || pegado(nl, p);
    });
  }
  return [...new Set(cand)].slice(0, 8);
}

/**
 * Los textos de RESULTADO de una pantalla, ordenados por parecido con lo que el plan
 * esperaba — pero **sin descartar ninguno**.
 *
 * La diferencia con `candidatosParaInforme` no es cosmética. Allí se filtra porque la
 * pregunta es «¿con qué está chocando este locator?» y un enlace del menú no es una
 * respuesta. Aquí la pregunta es otra: **«¿qué dice de verdad esta pantalla?»**, y para
 * eso hay que enseñar lo que hay aunque no se parezca a nada — que la aplicación diga
 * algo distinto de lo esperado ES la respuesta.
 *
 * Filtrar aquí producía además una afirmación falsa: con la lista vacía el panel
 * concluía «esta pantalla no muestra NINGÚN resultado», cuando lo cierto podía ser
 * «muestra tres, y ninguno se parece». Son dos diagnósticos distintos y llevan a
 * decisiones distintas (defecto vs. plan viejo). Se vio diseñando el ejercicio de
 * OrangeHRM, antes de que llegara a un QA.
 */
export function resultadosOrdenados(nombres: string[], esperado: string): string[] {
  const parecidos = new Set(candidatosParaInforme(nombres, esperado, false));
  const resto = nombres.filter((n) => !parecidos.has(n));
  return [...new Set([...parecidos, ...resto])].slice(0, 8);
}

/**
 * ¿El pedido da para emparejar por palabras?
 *
 * El emparejamiento exige palabras de ≥3 caracteres, así que un pedido más corto
 * **no produce candidatos jamás, por construcción**. Y ahí la lista vacía significa
 * «no se puede comparar», no «no hay nada parecido» — decir lo segundo es afirmar algo
 * falso, que es peor que callarse.
 *
 * No es un caso de laboratorio: el FD de onesait dice literalmente *«pulsar el botón de
 * cerrar "X"»* tres veces, y las aplicaciones corporativas pintan ese botón como `×`,
 * `✕` o `✖`. Medido en OrangeHRM el 2026-08-25: el modal tiene su botón de cerrar con
 * el texto `×`, y el panel respondía «ni nada que se le parezca» con el botón delante.
 */
export function pedidoSinPalabrasUtiles(pedido: string): boolean {
  return pedido
    .toLowerCase()
    .split(/\s+/)
    .every((w) => limpio(w).length < 3);
}

/** Sin espacios, guiones ni puntuación: `"Log In"` y `"login"` son la misma palabra. */
function limpio(v: string): string {
  return v.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Segunda vía de coincidencia, medida el 2026-08-24 escribiendo el test de D27.
 *
 * El emparejamiento por palabras venía de G3 y allí basta, porque el informe compara
 * contra el nombre accesible que el propio DOM devolvió. En el panel el `pedido` sale
 * del FD, que separa distinto: el paso pedía **`login`** y el botón de ParaBank se
 * llama **`Log In`** — `"log in".includes("login")` es `false` y el candidato más
 * obvio de la pantalla se quedaba fuera. El test lo cazó antes que el campo.
 *
 * Solo se aplica a la rama de «no encontrado» (en la ambigua la semántica substring
 * ES el mecanismo de la colisión y tocarla falsearía el diagnóstico), y exige 3
 * caracteres por los dos lados para que un nombre corto no se enganche a todo.
 */
function pegado(nombre: string, pedido: string): boolean {
  const a = limpio(nombre);
  const b = limpio(pedido);
  if (a.length < 3 || b.length < 3) return false;
  return a.includes(b) || b.includes(a);
}
