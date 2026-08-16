import { describe, it, expect } from 'vitest';
import { chromium } from '@playwright/test';

import {
  desmangleAtributos, desenvolverTexto, prepararFoto, REGLA_VISIBILIDAD, REPARACIONES_TODAS,
  rolDeElemento, hintDesde, accionDesde, MAX_PALABRAS, objetosDeArrayJson, type Percibido,
} from '../src/mind2web-to-bench.ts';
import { conTope } from '../src/resolve-bench.ts';
import { hintLocatorPlan, locatorSource } from '../src/walk-core.ts';

/**
 * K0.40 — el corpus de Mind2Web entra al banco de resolución.
 *
 * Lo que se prueba aquí es el ADAPTADOR, que es donde puede colarse el sesgo: si
 * la conversión regala datos al walker (un `id`, una `class`), la cifra del banco
 * deja de significar nada. Y las tres reparaciones de la foto, que son la parte
 * discutible: cada una tiene su test y su mitad falsable.
 */
const PERCIBIDO_VACIO: Percibido = {
  texto: null, ariaLabel: null, placeholder: null, title: null, alt: null, valorBoton: null,
};

describe('K0.40 — reparaciones de la foto (el volcado no es HTML de navegador)', () => {
  it('deshace el guion bajo SOLO en aria_* y data_*', () => {
    const html = '<a aria_label="Cerrar" data_testid="x" my_prop="no" class="a_b">t</a>';
    const out = desmangleAtributos(html);
    expect(out).toContain('aria-label="Cerrar"');
    expect(out).toContain('data-testid="x"');
    // MITAD FALSABLE: un atributo que de verdad se llama con guion bajo no se toca.
    // Sin la whitelist, esto sería "reparar" inventando.
    expect(out).toContain('my_prop="no"');
    // y no toca VALORES, solo nombres de atributo
    expect(out).toContain('class="a_b"');
  });

  it('no reescribe fuera de las etiquetas', () => {
    // el texto de la página puede hablar de aria_label sin ser un atributo
    expect(desmangleAtributos('<p>el atributo aria_label= sirve para…</p>')).toContain('aria_label=');
  });

  it('desenvuelve <text>, que si no se queda con el peldaño de texto', () => {
    const html = '<a backend_node_id="7"><text backend_node_id="8">  Roster  </text></a>';
    expect(desenvolverTexto(html)).toBe('<a backend_node_id="7">  Roster  </a>');
  });

  it('la regla de visibilidad oculta lo que no tenia caja y NUNCA la caja cero', () => {
    // la corrección que K0.32/K0.39 costó medir: un envoltorio de caja cero puede
    // tener hijos visibles, y ocultarlo se los lleva por delante
    expect(REGLA_VISIBILIDAD).toContain('-1,-1,-1,-1');
    expect(REGLA_VISIBILIDAD).not.toContain('0,0,0,0');
  });

  it('un ancestro SIN caja con algo dibujado dentro no se oculta (o se lleva al hijo)', async () => {
    // La misma lección, un nivel más arriba, y medida: sin el `:not(:has(…))`
    // esta regla tapaba 85 de 743 objetivos ANOTADOS en un solo shard, ninguno
    // de ellos con `-1` propio. Un ancestro sin caja con hijos dibujados no es
    // una rareza del volcado: es lo que hace `display: contents`.
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.setContent(prepararFoto(
        '<div bounding_box_rect="-1,-1,-1,-1"><b id="hijo" bounding_box_rect="10,10,50,20">visible</b></div>'
        + '<div id="muerto" bounding_box_rect="-1,-1,-1,-1"><i bounding_box_rect="-1,-1,-1,-1">oculto</i></div>',
        REPARACIONES_TODAS,
      ));
      // el hijo dibujado sobrevive a un padre sin caja...
      expect(await page.locator('#hijo').isVisible()).toBe(true);
      // ...y lo que no tiene NADA dibujado dentro sí desaparece (mitad falsable:
      // sin esto la regla sería inerte y la foto volvería a mentir sobre lo oculto)
      expect(await page.locator('#muerto').isVisible()).toBe(false);
    } finally {
      await browser.close();
    }
  }, 120_000);

  it('cada reparacion es desactivable: es lo que permite medir su efecto', () => {
    const html = '<a aria_label="X"><text>T</text></a>';
    const nada = prepararFoto(html, { desmangle: false, desenvolver: false, visibilidad: false });
    expect(nada).toBe(html);
    expect(prepararFoto(html, REPARACIONES_TODAS)).toBe(`${REGLA_VISIBILIDAD}<a aria-label="X">T</a>`);
  });
});

describe('K0.40 — el array de 600 MB se recorre por bytes', () => {
  it('separa los objetos de primer nivel', () => {
    const buf = Buffer.from('[{"a":1},{"b":{"c":2}}]', 'utf8');
    expect([...objetosDeArrayJson(buf)]).toEqual(['{"a":1}', '{"b":{"c":2}}']);
  });

  it('no cuenta llaves dentro de cadenas: el raw_html del dataset esta lleno de ellas', () => {
    // el caso que rompería un contador de llaves ingenuo, y es EL caso: los
    // volcados traen `<script>`, CSS y JSON incrustado dentro de los atributos
    const buf = Buffer.from(String.raw`[{"h":"{ } \" {"},{"x":2}]`, 'utf8');
    const out = [...objetosDeArrayJson(buf)];
    expect(out).toHaveLength(2);
    expect(JSON.parse(out[0])).toEqual({ h: '{ } " {' });
  });

  it('los caracteres multibyte no fingen una llave', () => {
    const buf = Buffer.from('[{"t":"señal ✓ 東京"}]', 'utf8');
    expect(JSON.parse([...objetosDeArrayJson(buf)][0])).toEqual({ t: 'señal ✓ 東京' });
  });
});

describe('K0.40 — el vigilante: un caso que no vuelve no puede parar el corpus', () => {
  it('corta lo que no responde y deja pasar lo que si', async () => {
    // Los topes de Playwright NO bastan: hay volcados que dejan al navegador
    // vivo pero sordo, `isConnected()` sigue diciendo que sí y la siguiente
    // petición no vuelve nunca. Medido dos veces sobre el mismo caso: media hora
    // con 27 s de CPU y cero casos nuevos. Hace falta un plazo propio, FUERA del
    // navegador, que no dependa de que el navegador conteste.
    await expect(conTope(new Promise(() => undefined), 50, 'colgado')).rejects.toThrow('tope de 50 ms');
    await expect(conTope(Promise.resolve('ok'), 5_000, 'rapido')).resolves.toBe('ok');
  });

  it('el rechazo tardio del caso abandonado no tumba el proceso', async () => {
    // sin el `catch` sobre la promesa original, el rechazo que llega DESPUÉS de
    // rendirse sube como unhandled rejection y mata el run entero — que es
    // justo lo que este vigilante existe para evitar
    const tardio = new Promise((_, rej) => setTimeout(() => rej(new Error('tarde')), 40));
    await expect(conTope(tardio, 10, 'lento')).rejects.toThrow('tope de 10 ms');
    await new Promise((r) => setTimeout(r, 80));
  });
});

describe('K0.40 — el hint solo lleva lo que una persona percibe', () => {
  it('nunca sale un id, una clase ni nada estructural', () => {
    const r = hintDesde({ ...PERCIBIDO_VACIO, texto: 'Añadir al carrito' }, 'button');
    expect(r).not.toBeTypeOf('string');
    expect(JSON.stringify(r)).not.toMatch(/id|class|nth|xpath/i);
  });

  it('el nombre que escribio el autor va antes que el texto suelto', () => {
    const r = hintDesde({ ...PERCIBIDO_VACIO, texto: 'X', ariaLabel: 'Cerrar dialogo' }, 'button');
    expect(r).toMatchObject({ fuente: 'aria-label', hint: { role: 'button', name: 'Cerrar dialogo' } });
  });

  it('sin rol reconocible el paso se expresa por TEXTO, que es lo que haria un QA', () => {
    expect(hintDesde({ ...PERCIBIDO_VACIO, texto: 'Denver' }, null)).toMatchObject({ hint: { text: 'Denver' } });
  });

  it('el marcador entra como `label` para que disparen sus dos peldanos', () => {
    const r = hintDesde({ ...PERCIBIDO_VACIO, placeholder: 'Buscar' }, 'textbox');
    expect(r).toMatchObject({ fuente: 'placeholder', hint: { role: 'textbox', label: 'Buscar' } });
  });

  it('el `value` solo nombra al elemento si el input se dibuja con el dentro', () => {
    // Corpus real: de aquí salieron {role:'checkbox', name:'1'} y
    // {role:'textbox', name:'All'} — el `value` de un checkbox es dato del
    // formulario, no algo que nadie lea. Un hint así no lo escribe ningún QA, y
    // se cuela por violar la regla declarada, no porque el walker falle.
    expect(hintDesde({ ...PERCIBIDO_VACIO, valorBoton: 'Enviar' }, 'button'))
      .toMatchObject({ fuente: 'value', hint: { role: 'button', name: 'Enviar' } });
    // MITAD FALSABLE: la extracción no llega a poner `valorBoton` cuando el
    // input no es de tipo botón, y sin palabras el caso se descarta
    expect(hintDesde(PERCIBIDO_VACIO, 'checkbox')).toBe('sin palabras que un QA pudiera escribir');
  });

  it('sin palabras y con palabras que no son un hint: los dos se descartan, no se inventan', () => {
    expect(hintDesde(PERCIBIDO_VACIO, 'img')).toBe('sin palabras que un QA pudiera escribir');
    expect(hintDesde({ ...PERCIBIDO_VACIO, texto: 'x'.repeat(MAX_PALABRAS + 1) }, null))
      .toBe('las palabras no son un hint (demasiado largas)');
  });

  it('password no se disfraza de textbox: no tiene rol ARIA y mentir lo haria irresoluble', () => {
    expect(rolDeElemento('input', null, 'password')).toBeNull();
    expect(rolDeElemento('input', null, 'text')).toBe('textbox');
    expect(rolDeElemento('div', 'tab', null)).toBe('tab');
    expect(rolDeElemento('span', null, null)).toBeNull();
  });

  it('un <a> SIN href no es un enlace, y este corpus no trae ninguno', () => {
    // Mind2Web elimina el `href` (medido: 429 anclas, cero href). Mapear a→link
    // a ciegas emite hints irresolubles, y en uniqlo PRODUJO un EQUIVOCADO: el
    // `<a>` anotado no era enlace y otro de la página traía role="link".
    expect(rolDeElemento('a', null, null, false)).toBeNull();
    // MITAD FALSABLE: donde el enlace sí es enlace, el rol se emite igual que siempre
    expect(rolDeElemento('a', null, null, true)).toBe('link');
    // y un role explícito manda por encima de todo
    expect(rolDeElemento('a', 'link', null, false)).toBe('link');
  });

  it('la accion sale de original_op, que es mas fina que op (y decide que peldanos entran)', () => {
    // Mind2Web colapsa HOVER y ENTER dentro de CLICK; desde K0.28 la acción
    // decide si el tier anclado participa, así que traducirla mal cambia la
    // escalera que se está midiendo.
    expect(accionDesde('CLICK', 'HOVER')).toBe('hover');
    expect(accionDesde('CLICK', 'CLICK')).toBe('click');
    expect(accionDesde('TYPE', 'TYPE')).toBe('fill');
    expect(accionDesde('SELECT', 'SELECT')).toBe('select');
  });
});

describe('K0.40 — el marcador no acepta substring cuando las palabras vienen del NOMBRE', () => {
  const prio = ['getByRole', 'getByPlaceholder'];

  it('desde `name` solo se prueba el marcador EXACTO', () => {
    // Caso real del corpus (travelzoo, 1ba150cb-1): el paso pedía la sugerencia
    // «Hotels» de un desplegable; el substring del marcador encontró UNO —el
    // buscador, «Hotels, e.g. Las Vegas»— y lo resolvió en silencio.
    const fuentes = hintLocatorPlan({ role: 'listitem', name: 'Hotels' }, prio)
      .filter((a) => a.kind === 'placeholder').map(locatorSource);
    expect(fuentes).toEqual(["getByPlaceholder('Hotels', { exact: true })"]);
  });

  it('MITAD FALSABLE: desde `label` la red de substring sigue puesta', () => {
    // `label` es como el FD dice "lo que se lee en el hueco del campo": ahí el
    // substring es la red del drift, igual que en el peldaño de texto (K0.28).
    const fuentes = hintLocatorPlan({ label: 'Hotels' }, prio)
      .filter((a) => a.kind === 'placeholder').map(locatorSource);
    expect(fuentes).toEqual([
      "getByPlaceholder('Hotels', { exact: true })",
      "getByPlaceholder('Hotels')",
    ]);
  });

  it('no toca lo que K0.39 arreglo: el caso de Vaadin resolvia por el EXACTO', () => {
    const fuentes = hintLocatorPlan({ name: 'Search' }, prio).map(locatorSource);
    expect(fuentes).toContain("getByPlaceholder('Search', { exact: true })");
  });
});
