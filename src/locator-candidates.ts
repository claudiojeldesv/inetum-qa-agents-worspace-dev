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
