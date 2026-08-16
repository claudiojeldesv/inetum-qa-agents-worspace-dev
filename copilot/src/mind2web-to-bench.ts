/**
 * ADAPTADOR Mind2Web → banco de resolución (K0.40).
 *
 * K0.31 dejó el banco (`resolve-bench.ts`) con un formato de entrada agnóstico
 * del dataset a propósito, para que enganchar un corpus grande fuera trabajo de
 * DATOS y no de código. Esto es ese trabajo de datos.
 *
 * Mind2Web (OSU-NLP, CC-BY-4.0): 2.350 tareas humanas sobre 137 sitios reales,
 * con el HTML de la página en el instante de cada acción y el elemento correcto
 * anotado por una persona. Es el único corpus público que puede desmentir la
 * afirmación central del producto — "la escalera no adivina" — sobre páginas que
 * nadie de este equipo eligió.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE MIDE Y LO QUE NO. Hay que decirlo antes que nada porque decide si la
 * cifra significa algo:
 *
 *   El hint se deriva DEL ELEMENTO ANOTADO, así que esto NO mide inferencia
 *   ("dada una tarea en prosa, ¿qué elemento hay que tocar?"). Mide
 *   DESAMBIGUACIÓN: dadas las palabras que una persona vería en pantalla, entre
 *   los cientos o miles de elementos de una página real, ¿la escalera encuentra
 *   ESE, se planta, o coge otro en silencio?
 *
 * Esa es justo la pregunta del producto: el QA escribe el paso mirando la
 * pantalla (o leyendo un FD que la describe), y lo que puede salir caro no es
 * que el walker no encuentre —eso se ve— sino que encuentre otra cosa.
 *
 * Regla dura de la derivación: al hint solo entra lo que una persona PERCIBE
 * (texto visible, nombre accesible, marcador, título, texto alternativo). Nunca
 * `id`, `class`, posición ni nada estructural. Si entrara un `id`, el banco
 * estaría midiendo un selector, no un hint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES REPARACIONES DE LA FOTO, y por qué no son maquillaje.
 *
 * El `raw_html` de Mind2Web no es HTML de un navegador: es un volcado
 * SERIALIZADO del DOM vivo. Cargarlo tal cual mide el formato del volcado, no la
 * página. Tres cosas se pierden por el camino y las tres se restauran con datos
 * que el propio volcado trae — no se inventa nada:
 *
 *   1. NOMBRES DE ATRIBUTO CON GUION BAJO. El volcado escribe `aria_label` donde
 *      la página decía `aria-label`. Para un navegador `aria_label` no existe:
 *      no da nombre accesible, no lo ve `getByRole({name})` ni `getByLabel`.
 *      Sin deshacerlo, tres peldaños de la escalera están muertos por formato y
 *      la medida sería del volcado. Se deshace SOLO en `aria_*` y `data_*`
 *      (whitelist: un atributo real llamado `foo_bar` no se toca).
 *
 *   2. LOS NODOS DE TEXTO VIENEN ENVUELTOS en un elemento `<text>` inventado
 *      por el serializador. Esto no es cosmético: el motor de texto de Playwright
 *      resuelve al elemento MÁS PROFUNDO que contiene el texto, así que
 *      `getByText('NFL')` devolvería el `<text>` y no el `<a>` anotado — un
 *      EQUIVOCADO sistemático en todos los casos de texto, causado por el
 *      formato. Se desenvuelve y vuelve a haber nodos de texto de verdad.
 *
 *   3. NO HAY NI UNA HOJA DE ESTILO (medido: cero `<link>`, cero `<style>`,
 *      cero `<script>` en el volcado). Es la MISMA lección que K0.32 nos costó
 *      en nuestro propio corpus: sin CSS, lo oculto se vuelve visible, y la
 *      visibilidad es carga estructural de la regla dura del walker (visible y
 *      único → adelante; ≥2 → se planta). Un menú desplegado, tres diálogos
 *      cerrados y el pie entero pasan a competir. Mind2Web anotó la GEOMETRÍA
 *      REAL de cada nodo (`bounding_box_rect`) en el momento de la captura, así
 *      que la visibilidad se restaura desde lo MEDIDO en su día, con una sola
 *      regla CSS sobre los nodos que el navegador no llegó a dibujar.
 *
 *      Y se respeta la corrección de K0.39/K0.32: CAJA CERO NO ES OCULTO. Solo
 *      se ocultan los que no tienen caja en absoluto (`-1,-1,-1,-1`); un
 *      envoltorio de altura cero con hijos visibles se queda, porque ocultarlo
 *      se llevaría por delante a sus hijos.
 *
 * Las tres son desactivables por bandera, y esa es la mitad falsable: el efecto
 * de cada una se mide corriendo el banco con y sin ella.
 *
 * Uso:
 *   tsx copilot/src/mind2web-to-bench.ts <shard.json|dir> --out=<dir> [--crudo]
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

import { conTope } from './resolve-bench.ts';
import type { StepHint, WalkAction, WalkStep } from './walk-types.ts';

// ── Contratos de datos de Mind2Web ───────────────────────────────────────────

export interface M2wCandidate {
  tag: string;
  backend_node_id: string;
  /** JSON serializado como string (así viene en el dataset). */
  attributes: string;
}
export interface M2wAction {
  action_uid: string;
  raw_html: string;
  operation: { op: string; original_op: string; value: string };
  pos_candidates: M2wCandidate[];
}
export interface M2wTask {
  annotation_id: string;
  website: string;
  domain: string;
  confirmed_task: string;
  action_reprs: string[];
  actions: M2wAction[];
}

/** Motivos por los que un caso NO entra al corpus. Se cuentan y se declaran. */
export type MotivoDescarte =
  | 'sin verdad anotada'
  | 'la verdad no es unica en la foto'
  | 'la verdad no se ve en la foto'
  | 'sin palabras que un QA pudiera escribir'
  | 'las palabras no son un hint (demasiado largas)';

/**
 * Tope de longitud del hint. Un QA no escribe un paso con 200 caracteres de
 * texto: si el único asidero del elemento es un párrafo entero, el caso no
 * representa nada que el producto vaya a ver. Se descarta y se cuenta.
 */
export const MAX_PALABRAS = 100;

/**
 * Los shards del dataset pesan ~600 MB y `readFileSync(…, 'utf8')` no puede con
 * ellos: V8 no admite cadenas de más de 512 MB (`ERR_STRING_TOO_LONG`). Un Buffer
 * sí los aguanta, así que el array de tareas se recorre por BYTES y cada objeto
 * de primer nivel se convierte a cadena por separado.
 *
 * Solo se comparan bytes ASCII (`{`, `}`, `"`, `\`), y en UTF-8 los bytes de
 * continuación son todos ≥ 0x80: ningún carácter multibyte puede fingir una
 * llave. Lo único que hay que llevar con cuidado es no contar llaves que estén
 * dentro de una cadena — y el `raw_html` del dataset está lleno de ellas.
 */
export function* objetosDeArrayJson(buf: Buffer): Generator<string> {
  let profundidad = 0;
  let inicio = -1;
  let enCadena = false;
  let escapado = false;
  for (let i = 0; i < buf.length; i += 1) {
    const c = buf[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (c === 0x5c) escapado = true;
      else if (c === 0x22) enCadena = false;
      continue;
    }
    if (c === 0x22) { enCadena = true; continue; }
    if (c === 0x7b) { if (profundidad === 0) inicio = i; profundidad += 1; continue; }
    if (c === 0x7d) {
      profundidad -= 1;
      if (profundidad === 0 && inicio >= 0) {
        yield buf.toString('utf8', inicio, i + 1);
        inicio = -1;
      }
    }
  }
}

// ── Reparaciones de la foto (puras) ──────────────────────────────────────────

/**
 * Deshace el aplanado de guiones del serializador, SOLO en `aria_*` y `data_*`,
 * y solo dentro de etiquetas (no en el contenido de texto). La whitelist es lo
 * que hace la operación defendible: no se "arreglan" atributos que quizá se
 * llamaban así de verdad.
 */
export function desmangleAtributos(html: string): string {
  return html.replace(/<[a-zA-Z][^>]*>/g, (tag) =>
    tag.replace(/(\s)(aria|data)((?:_[a-zA-Z0-9]+)+)=/g, (_m, sp: string, pre: string, rest: string) =>
      `${sp}${pre}${rest.replace(/_/g, '-')}=`),
  );
}

/**
 * Quita el envoltorio `<text>` que el serializador puso alrededor de cada nodo
 * de texto, dejando el texto suelto. Sin esto, el peldaño de texto resuelve
 * siempre al envoltorio y nunca al elemento anotado.
 */
export function desenvolverTexto(html: string): string {
  return html.replace(/<text\b[^>]*>([\s\S]*?)<\/text>/g, '$1');
}

/**
 * La visibilidad medida en la captura, devuelta a la foto. Una sola regla, sobre
 * el valor exacto que el volcado usa para "este nodo no tenía caja".
 *
 * Dos cautelas, y las dos son la MISMA lección de K0.32 —«un envoltorio sin caja
 * puede tener hijos visibles, y ocultarlo los borra a ellos»— aplicada a dos
 * niveles distintos:
 *
 *  1. NO incluye `w=0`/`h=0`. Caja cero no es oculto.
 *  2. El `:not(:has(…))` es la parte que se me escapó al primer intento y que
 *     midió el corpus: sin él, esta regla ocultaba 85 de 743 objetivos ANOTADOS
 *     en un solo shard. Ninguno de esos 85 tenía `-1` propio (medido: los 743
 *     traen caja) — los tapaba un ANCESTRO sin caja. Y un ancestro sin caja con
 *     hijos dibujados no es una rareza del volcado: es exactamente lo que hace
 *     `display: contents`.
 *
 * O sea: un nodo sin caja se oculta solo si tampoco hay nada dibujado dentro.
 */
export const REGLA_VISIBILIDAD =
  '<style>[bounding_box_rect="-1,-1,-1,-1"]:not(:has([bounding_box_rect]:not([bounding_box_rect="-1,-1,-1,-1"]))){display:none!important}</style>';

export interface OpcionesFoto {
  desmangle: boolean;
  desenvolver: boolean;
  visibilidad: boolean;
}
export const REPARACIONES_TODAS: OpcionesFoto = { desmangle: true, desenvolver: true, visibilidad: true };

export function prepararFoto(html: string, o: OpcionesFoto): string {
  let out = html;
  if (o.desmangle) out = desmangleAtributos(out);
  if (o.desenvolver) out = desenvolverTexto(out);
  if (o.visibilidad) out = REGLA_VISIBILIDAD + out;
  return out;
}

// ── Derivación del paso (puras) ──────────────────────────────────────────────

/**
 * Rol ARIA del elemento. El atributo `role` explícito manda; si no, el implícito
 * de la etiqueta. Lo que no tiene rol reconocible devuelve null y el paso se
 * expresará por texto visible, que es lo que haría un QA.
 *
 * El rol es el que el elemento tiene EN ESTA FOTO, no el que su etiqueta suele
 * implicar, y eso tiene una consecuencia gorda con este corpus: **Mind2Web
 * elimina el `href`** (medido: 429 anclas en una página, cero `href`, cero
 * `role="link"`). Un `<a>` sin `href` no tiene rol de enlace — es la
 * especificación de HTML, no una rareza del volcado —, así que mapear `a` →
 * `link` a ciegas emite hints estructuralmente irresolubles.
 *
 * Y no es teórico: en uniqlo eso PRODUJO un EQUIVOCADO. El `<a>` anotado no era
 * enlace, pero otro de la misma página traía `role="link"` explícito, así que
 * `getByRole('link', {name:'Women'})` resolvió el otro.
 *
 * NO se inyecta un `href` inventado a partir de `is_clickable`: las otras tres
 * reparaciones restauran lo que el volcado GRABÓ, y el `href` no lo grabó.
 * Adivinarlo sería otra cosa. Se declara la limitación y se mide con ella
 * puesta, que además es la dirección conservadora: sin rol de enlace, la
 * escalera pierde su peldaño más fuerte en la clase más numerosa del corpus.
 */
export function rolDeElemento(
  tag: string, roleAttr: string | null, tipo: string | null, tieneHref = false,
): string | null {
  if (roleAttr && roleAttr.trim()) return roleAttr.trim().split(/\s+/)[0];
  const t = tag.toLowerCase();
  if (t === 'a') return tieneHref ? 'link' : null;
  if (t === 'input') {
    const ty = (tipo ?? 'text').toLowerCase();
    if (['submit', 'button', 'reset', 'image'].includes(ty)) return 'button';
    if (ty === 'checkbox') return 'checkbox';
    if (ty === 'radio') return 'radio';
    if (ty === 'search') return 'searchbox';
    // `password` no tiene rol ARIA: devolver 'textbox' sería mentir y
    // getByRole('textbox') no lo encontraría igual.
    if (['text', 'email', 'tel', 'url', 'number'].includes(ty)) return ty === 'number' ? 'spinbutton' : 'textbox';
    return null;
  }
  const mapa: Record<string, string> = {
    button: 'button', select: 'combobox', textarea: 'textbox', img: 'img',
    li: 'listitem', option: 'option', table: 'table', tr: 'row', td: 'cell', th: 'columnheader',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading',
    nav: 'navigation', main: 'main', form: 'form', dialog: 'dialog',
  };
  return mapa[t] ?? null;
}

/** Lo que se ve del elemento, en el orden en que una persona lo nombraría. */
export interface Percibido {
  texto: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  title: string | null;
  alt: string | null;
  valorBoton: string | null;
}

/**
 * El hint, construido SOLO con lo perceptible. Devuelve también de dónde salieron
 * las palabras: sin eso no se puede auditar si el banco se está midiendo a sí mismo.
 */
export function hintDesde(p: Percibido, rol: string | null): { hint: StepHint; fuente: string } | MotivoDescarte {
  const limpio = (s: string | null): string | null => {
    const v = (s ?? '').replace(/\s+/g, ' ').trim();
    return v.length > 0 ? v : null;
  };
  const texto = limpio(p.texto);
  const aria = limpio(p.ariaLabel);
  const ph = limpio(p.placeholder);
  const title = limpio(p.title);
  const alt = limpio(p.alt);
  const valor = limpio(p.valorBoton);

  const conRol = (v: string, fuente: string): { hint: StepHint; fuente: string } => ({
    hint: rol ? { role: rol, name: v } : { text: v },
    fuente,
  });

  // Orden: lo que el autor escribió COMO nombre va antes que el texto suelto.
  const elegido = aria
    ? conRol(aria, 'aria-label')
    : texto
      ? conRol(texto, 'texto visible')
      : ph
        // el marcador va por `label` para que disparen getByLabel y getByPlaceholder (K0.39)
        ? { hint: (rol ? { role: rol, label: ph } : { label: ph }) as StepHint, fuente: 'placeholder' }
        : title
          ? conRol(title, 'title')
          : alt
            ? conRol(alt, 'alt')
            : valor
              ? conRol(valor, 'value')
              : null;

  if (!elegido) return 'sin palabras que un QA pudiera escribir';
  const palabras = elegido.hint.name ?? elegido.hint.text ?? elegido.hint.label ?? '';
  if (palabras.length > MAX_PALABRAS) return 'las palabras no son un hint (demasiado largas)';
  return elegido;
}

/**
 * La acción del banco. Importa más de lo que parece: desde K0.28 la acción decide
 * qué peldaños entran (el tier anclado solo actúa sobre controles), así que
 * traducirla mal cambiaría la escalera que se está midiendo.
 *
 * `original_op` es más fino que `op` (Mind2Web colapsa HOVER y ENTER dentro de
 * CLICK), y esa distinción es exactamente la que separa peldaños.
 */
export function accionDesde(op: string, originalOp: string): WalkAction {
  const o = (originalOp || op || '').toUpperCase();
  if (o === 'HOVER') return 'hover';
  if (o === 'ENTER') return 'press';
  if (o === 'TYPE') return 'fill';
  if (o === 'SELECT') return 'select';
  return 'click';
}

// ── Extracción en un DOM de verdad ───────────────────────────────────────────

/**
 * Lo perceptible se lee del navegador, no del HTML como string: `innerText`
 * respeta la visibilidad restaurada, y eso es justo lo que se quiere — las
 * palabras que una persona habría visto, no las que había en el volcado.
 *
 * Se usa la API granular del Locator y NO `evaluate` con la lectura en un
 * string: `Locator.evaluate(<string>)` no recibe el elemento como argumento
 * (hallazgo de la Fase 6, repetido en el banco de rescates y otra vez aquí).
 */
export async function leerPercibido(
  loc: import('@playwright/test').Locator,
): Promise<Percibido & { tag: string; role: string | null; tipo: string | null; href: boolean }> {
  const at = (n: string): Promise<string | null> => loc.getAttribute(n).catch(() => null);
  const [texto, ariaLabel, placeholder, title, alt, valor, tag, role, tipo, href] = await Promise.all([
    loc.innerText().catch(() => ''),
    at('aria-label'), at('placeholder'), at('title'), at('alt'), at('value'),
    loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => ''),
    at('role'), at('type'),
    // solo para calcular el ROL: el valor del href jamás entra en el hint
    at('href').then((v) => v !== null),
  ]);
  /**
   * `value` solo nombra al elemento en los input que se DIBUJAN con su valor
   * dentro: submit, button, reset. En un checkbox o en un campo de texto el
   * `value` es dato del formulario, no algo que nadie lea como etiqueta —
   * medido en el corpus: de ahí salieron hints como {role:'checkbox', name:'1'}
   * y {role:'textbox', name:'All'}, que ningún QA escribiría. Es una violación
   * de la regla declarada arriba (al hint solo entra lo perceptible), y por eso
   * se corrige aquí y no en el walker.
   */
  const esBoton = ['submit', 'button', 'reset'].includes((tipo ?? '').toLowerCase());
  return {
    texto, ariaLabel, placeholder, title, alt,
    valorBoton: tag === 'input' && esBoton ? valor : null,
    tag, role, tipo, href,
  };
}

export interface CasoEmitido {
  id: string;
  site: string;
  task: string;
  html_path: string;
  action: WalkAction;
  hint: WalkStep['hint'];
  target: string;
  /** De dónde salieron las palabras del hint. Para auditar el sesgo, no para el walker. */
  fuente_hint: string;
}

export interface Informe {
  emitidos: number;
  descartes: Record<string, number>;
  fuentes: Record<string, number>;
  acciones: Record<string, number>;
  sitios: Set<string>;
}

function contar(m: Record<string, number>, k: string): void {
  m[k] = (m[k] ?? 0) + 1;
}

export async function convertirAccion(
  page: Page, tarea: M2wTask, idx: number, outDir: string, opciones: OpcionesFoto, inf: Informe,
): Promise<CasoEmitido | null> {
  const a = tarea.actions[idx];
  const bid = a.pos_candidates[0]?.backend_node_id;
  if (!bid) { contar(inf.descartes, 'sin verdad anotada'); return null; }

  const id = `${tarea.annotation_id.slice(0, 8)}-${idx}`;
  const rel = join('html', `${id}.html`);
  const foto = prepararFoto(a.raw_html, opciones);
  writeFileSync(join(outDir, rel), foto, 'utf8');

  // tope explícito: hay volcados con cientos de miles de nodos que dejan al
  // navegador colgado o lo tumban, y sin tope se lleva por delante el corpus
  await page.setContent(foto, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const target = `[backend_node_id="${bid}"]`;
  const loc = page.locator(target);
  if ((await loc.count().catch(() => 0)) !== 1) {
    contar(inf.descartes, 'la verdad no es unica en la foto'); return null;
  }
  // Un objetivo que no se ve no admite veredicto: el walker se plantaría por la
  // regla dura y contarlo como plantada culparía a la escalera de la foto.
  if (!(await loc.isVisible().catch(() => false))) {
    contar(inf.descartes, 'la verdad no se ve en la foto'); return null;
  }

  const p = await leerPercibido(loc);
  const rol = rolDeElemento(p.tag, p.role, p.tipo, p.href);
  const r = hintDesde(p, rol);
  if (typeof r === 'string') { contar(inf.descartes, r); return null; }

  const action = accionDesde(a.operation.op, a.operation.original_op);
  contar(inf.fuentes, r.fuente);
  contar(inf.acciones, action);
  inf.sitios.add(tarea.website);
  inf.emitidos += 1;
  return {
    id, site: tarea.website, task: tarea.confirmed_task,
    html_path: rel.replace(/\\/g, '/'), action, hint: r.hint, target, fuente_hint: r.fuente,
  };
}

export function renderInforme(i: Informe): string {
  const orden = (m: Record<string, number>): string[] =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${k}: ${v}`);
  const totalDesc = Object.values(i.descartes).reduce((a, b) => a + b, 0);
  return [
    `casos emitidos   ${i.emitidos}   (${i.sitios.size} sitios distintos)`,
    `descartados      ${totalDesc}`,
    ...orden(i.descartes),
    'de donde salieron las palabras del hint (auditoria del sesgo):',
    ...orden(i.fuentes),
    'acciones:',
    ...orden(i.acciones),
  ].join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const entrada = args.find((a) => !a.startsWith('--'));
  const outDir = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);
  if (!entrada || !outDir) {
    console.error('uso: tsx copilot/src/mind2web-to-bench.ts <shard.json|dir> --out=<dir> [--sin-desmangle] [--sin-desenvolver] [--sin-visibilidad]');
    process.exit(1);
  }
  const opciones: OpcionesFoto = {
    desmangle: !args.includes('--sin-desmangle'),
    desenvolver: !args.includes('--sin-desenvolver'),
    visibilidad: !args.includes('--sin-visibilidad'),
  };

  const abs = resolve(entrada);
  const shards = statSync(abs).isDirectory()
    ? readdirSync(abs).filter((f) => f.endsWith('.json')).sort().map((f) => join(abs, f))
    : [abs];

  const out = resolve(outDir);
  mkdirSync(join(out, 'html'), { recursive: true });
  const manifest = join(out, 'corpus.jsonl');
  // `--anexar` permite procesar el dataset shard a shard en procesos separados:
  // un shard que tumbe el navegador no se lleva el trabajo de los otros diez, y
  // la memoria del buffer de 600 MB se suelta entre uno y otro.
  if (!args.includes('--anexar')) writeFileSync(manifest, '', 'utf8');

  const inf: Informe = { emitidos: 0, descartes: {}, fuentes: {}, acciones: {}, sitios: new Set() };
  let browser: Browser = await chromium.launch();
  // el volcado no trae recursos externos, pero el corte lo garantiza y hace el banco offline de verdad
  const nuevaPagina = async (): Promise<Page> => {
    const p = await conTope(browser.newPage(), 20_000, 'pestaña nueva');
    await p.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    return p;
  };
  /**
   * Un navegador sordo no se cierra ni se comprueba: se abandona. El `close()`
   * va con tope y su fallo se ignora a propósito — puede quedar un proceso
   * huérfano, y es un precio mejor que un corpus que no termina nunca.
   */
  const relanzarNavegador = async (): Promise<void> => {
    await conTope(browser.close(), 5_000, 'cierre').catch(() => undefined);
    browser = await chromium.launch();
    page = await nuevaPagina();
  };
  let page = await nuevaPagina();

  for (const s of shards) {
    const buf = readFileSync(s);
    for (const crudo of objetosDeArrayJson(buf)) {
      let t: M2wTask;
      try {
        t = JSON.parse(crudo) as M2wTask;
      } catch (e) {
        // una tarea ilegible no puede tumbar un corpus de miles: se avisa y se sigue
        console.error(`[m2w] tarea descartada en ${basename(s)}: ${(e as Error).message}`);
        continue;
      }
      for (let i = 0; i < (t.actions ?? []).length; i += 1) {
        /**
         * Una foto rota no puede tumbar un corpus de miles — es la misma regla
         * que el manifiesto del banco ya aplica, y aquí faltaba: una sola página
         * de 700 KB reventó el navegador (`Page crashed`) y se llevó por delante
         * seis mil conversiones que ya estaban hechas. El caso se descarta con
         * su motivo y se sigue, con página nueva porque la anterior está muerta.
         */
        let c: CasoEmitido | null = null;
        try {
          c = await conTope(convertirAccion(page, t, i, out, opciones, inf), 60_000, 'caso');
        } catch (e) {
          contar(inf.descartes, 'la foto colgo o tumbo el navegador');
          console.error(`[m2w] ${t.annotation_id.slice(0, 8)}-${i}: ${(e as Error).message.split('\n')[0]}`);
          await relanzarNavegador();
        }
        if (c) appendFileSync(manifest, `${JSON.stringify(c)}\n`, 'utf8');
      }
    }
    console.log(`[m2w] ${basename(s)} procesado — ${inf.emitidos} casos acumulados`);
  }
  await browser.close();
  console.log(`\nreparaciones: desmangle=${opciones.desmangle} desenvolver=${opciones.desenvolver} visibilidad=${opciones.visibilidad}`);
  console.log(renderInforme(inf));
  console.log(`\nmanifiesto: ${manifest}`);
}

const invoked = (process.argv[1] ?? '').replace(/\\/g, '/');
if (invoked.endsWith('mind2web-to-bench.ts')) void main();
