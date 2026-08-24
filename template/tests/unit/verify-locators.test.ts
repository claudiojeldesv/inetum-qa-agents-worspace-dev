import { describe, it, expect } from 'vitest';
import {
  locatorSpecFor,
  parseTestIdAttribute,
  pathnameOf,
  findLoginForm,
  credentialsFromContract,
  rescatarAtributoDeTestId,
  nombresAccesiblesDelRol,
  candidatosParaInforme,
} from '../../src/scripts/verify-locators.ts';

describe('verify-locators locatorSpecFor (misma prioridad que el scaffolder)', () => {
  it('test_id manda sobre todo', () => {
    expect(locatorSpecFor({ role: 'button', name: 'Login', test_id: 'login-button' })).toEqual({
      kind: 'testId',
      testId: 'login-button',
    });
  });

  it('role+name cuando no hay test_id', () => {
    expect(locatorSpecFor({ role: 'button', name: 'Add to cart' })).toEqual({
      kind: 'roleName',
      role: 'button',
      name: 'Add to cart',
    });
  });

  it('label como tercer nivel', () => {
    expect(locatorSpecFor({ role: undefined, label: 'Email' })).toEqual({ kind: 'label', label: 'Email' });
  });

  it('role pelado como fallback (la clase F4: generic)', () => {
    expect(locatorSpecFor({ role: 'generic' })).toEqual({ kind: 'role', role: 'generic' });
    expect(locatorSpecFor({})).toEqual({ kind: 'role', role: 'generic' });
  });
});

describe('verify-locators parseTestIdAttribute', () => {
  it('extrae el atributo del playwright.config.ts', () => {
    expect(parseTestIdAttribute(`use: { testIdAttribute: 'data-test' }`)).toBe('data-test');
    expect(parseTestIdAttribute(`testIdAttribute: "data-qa"`)).toBe('data-qa');
  });

  it('null cuando el config no lo declara', () => {
    expect(parseTestIdAttribute(`use: { baseURL: 'x' }`)).toBeNull();
  });
});

describe('verify-locators pathnameOf', () => {
  const base = 'https://www.saucedemo.com/';

  it('resuelve rutas relativas contra la base', () => {
    expect(pathnameOf('/inventory.html', base)).toBe('/inventory.html');
    expect(pathnameOf('/', base)).toBe('/');
  });

  it('acepta URLs absolutas y normaliza trailing slash', () => {
    expect(pathnameOf('https://www.saucedemo.com/cart.html', base)).toBe('/cart.html');
    expect(pathnameOf('https://www.saucedemo.com/checkout/', base)).toBe('/checkout');
  });
});

describe('verify-locators findLoginForm (bootstrap contract-driven)', () => {
  const sauceScreens = [
    {
      name: 'login',
      interactive_elements: [
        { role: 'textbox', name: 'Username', test_id: 'username' },
        { role: 'textbox', name: 'Password', test_id: 'password' },
        { role: 'button', name: 'Login', test_id: 'login-button' },
      ],
    },
    { name: 'inventory', interactive_elements: [{ role: 'button', name: 'Add to cart' }] },
  ];

  it('detecta el formulario de login de SauceDemo', () => {
    const form = findLoginForm(sauceScreens);
    expect(form?.screen).toBe('login');
    expect(form?.user.test_id).toBe('username');
    expect(form?.password.test_id).toBe('password');
    expect(form?.submit.test_id).toBe('login-button');
  });

  it('null cuando ninguna pantalla tiene campo password', () => {
    expect(findLoginForm([{ name: 'home', interactive_elements: [{ role: 'link', name: 'About' }] }])).toBeNull();
  });

  it('cae al primer textbox no-password si el nombre de usuario no matchea el patrón', () => {
    const form = findLoginForm([
      {
        name: 'acceso',
        interactive_elements: [
          { role: 'textbox', name: 'Identificador' },
          { role: 'textbox', name: 'Contraseña' },
          { role: 'button', name: 'Entrar' },
        ],
      },
    ]);
    expect(form?.user.name).toBe('Identificador');
    expect(form?.submit.name).toBe('Entrar');
  });
});

describe('verify-locators credentialsFromContract', () => {
  it('array de credentials (formato saucedemo.yaml) → la primera', () => {
    const creds = credentialsFromContract({
      synthetic_fixtures: {
        credentials: [
          { username: 'standard_user', password: 'secret_sauce' },
          { username: 'locked_out_user', password: 'secret_sauce' },
        ],
      },
    });
    expect(creds).toEqual({ username: 'standard_user', password: 'secret_sauce' });
  });

  it('objeto con credentials_ref (formato auth) → la referenciada', () => {
    const creds = credentialsFromContract({
      auth: { credentials_ref: 'admin' },
      synthetic_fixtures: {
        credentials: { standard: { username: 'a', password: 'b' }, admin: { username: 'root', password: 'x' } },
      },
    });
    expect(creds).toEqual({ username: 'root', password: 'x' });
  });

  it('null sin fixtures', () => {
    expect(credentialsFromContract({})).toBeNull();
  });
});

/**
 * D34, segunda vuelta — el DOM dice de que atributo salio el `test_id`.
 *
 * Par falsable medido en la iteracion 2 del loop (2026-08-22): el discovery-analyzer, con
 * el prompt IDENTICO, declaro `test_id_attr` en 18 de 18 elementos en una corrida y en
 * **0 de 31** en la siguiente. El arreglo del lado productor era prosa, y la prosa se
 * cumple segun la tirada. Este rescate no depende de que nadie se acuerde.
 */
describe('verify-locators — rescate del atributo de test_id contra el DOM', () => {
  /** Sonda falsa: el test declara que selector resuelve y a cuantos elementos. */
  const sonda = (mapa: Record<string, number>) => ({
    locator: (sel: string) => ({ count: async () => mapa[sel] ?? 0 }),
  });

  it('EL PAR FALSABLE: un test_id que venia de `id` se rescata como `id`', async () => {
    // el caso ParaBank: test_id 'fromAccountId' tomado del atributo id
    const r = await rescatarAtributoDeTestId(
      sonda({ '[id="fromAccountId"]': 1 }),
      'fromAccountId',
      'data-test',
    );
    expect(r).toEqual({ attr: 'id' });
  });

  it('rescata tambien desde `name` (el login legacy de ParaBank)', async () => {
    const r = await rescatarAtributoDeTestId(sonda({ '[name="username"]': 1 }), 'username', 'data-test');
    expect(r).toEqual({ attr: 'name' });
  });

  it('NO propone el atributo que ya fallo', async () => {
    // si el configurado es data-test y resolviera, no estariamos aqui: se excluye
    const r = await rescatarAtributoDeTestId(sonda({ '[data-test="x"]': 1 }), 'x', 'data-test');
    expect(r).toBeNull();
  });

  it('dos coincidencias no identifican nada: no se rescata', async () => {
    const r = await rescatarAtributoDeTestId(sonda({ '[id="item"]': 3 }), 'item', 'data-test');
    expect(r).toBeNull();
  });

  it('si ningun atributo resuelve, devuelve null y el elemento queda not-found', async () => {
    const r = await rescatarAtributoDeTestId(sonda({}), 'fantasma', 'data-test');
    expect(r).toBeNull();
  });

  it('prefiere `id` sobre el resto cuando varios resolverian', async () => {
    const r = await rescatarAtributoDeTestId(
      sonda({ '[id="x"]': 1, '[name="x"]': 1, '[data-qa="x"]': 1 }),
      'x',
      'data-test',
    );
    expect(r).toEqual({ attr: 'id' });
  });

  it('un selector invalido no rompe el rescate: sigue con el siguiente candidato', async () => {
    const explota = {
      locator: (sel: string) => ({
        count: async () => {
          if (sel.startsWith('[id=')) throw new Error('selector invalido');
          if (sel === '[name="x"]') return 1;
          return 0;
        },
      }),
    };
    expect(await rescatarAtributoDeTestId(explota, 'x', 'data-test')).toEqual({ attr: 'name' });
  });
});

/**
 * G3 (plan gate-locators-medidos) — el informe dice QUE nombres reales hay cuando el
 * (rol, nombre) falla. Los snapshots son sinteticos con el formato de ariaSnapshot;
 * el formato real lo valida la iteracion de campo I4 contra Dolibarr.
 */
describe('G3 — nombresAccesiblesDelRol', () => {
  const SNAPSHOT = [
    '- table:',
    '  - rowgroup:',
    '    - row "Ref. Ref. customer Type":',
    '      - columnheader "Ref."',
    '      - columnheader "Ref. customer"',
    '      - columnheader "Project ref."',
    '      - columnheader "Type"',
    '- link "List"',
    '- link "New invoice"',
    '- button "Say \\"hola\\""',
  ].join('\n');

  it('extrae los nombres del rol pedido y solo de ese rol', () => {
    expect(nombresAccesiblesDelRol(SNAPSHOT, 'columnheader')).toEqual([
      'Ref.', 'Ref. customer', 'Project ref.', 'Type',
    ]);
    expect(nombresAccesiblesDelRol(SNAPSHOT, 'link')).toEqual(['List', 'New invoice']);
  });

  it('un rol con caracteres de regex no revienta y las comillas escapadas se des-escapan', () => {
    expect(nombresAccesiblesDelRol(SNAPSHOT, 'button')).toEqual(['Say "hola"']);
    expect(nombresAccesiblesDelRol(SNAPSHOT, 'row(')).toEqual([]);
  });

  it('un rol sin nombre (linea sin comillas) no cuenta', () => {
    expect(nombresAccesiblesDelRol(SNAPSHOT, 'table')).toEqual([]);
  });
});

describe('G3 — candidatosParaInforme', () => {
  const NOMBRES = ['Ref.', 'Ref. customer', 'Project ref.', 'Type', 'Third party'];

  it('ambiguo: lista los que CONTIENEN el pedido (la colision substring real de Dolibarr)', () => {
    // getByRole matchea case-insensitive por substring: 'Ref.' choca con los tres
    expect(candidatosParaInforme(NOMBRES, 'Ref.', true)).toEqual([
      'Ref.', 'Ref. customer', 'Project ref.',
    ]);
  });

  it('not-found: comparte palabra con el pedido — el caption que no es el nombre real', () => {
    expect(candidatosParaInforme(['Reference number', 'Type'], 'Ref. number', false)).toEqual([
      'Reference number',
    ]);
  });

  it('not-found con pedido sin palabras utiles (todo <3 chars) no inunda: vacio', () => {
    expect(candidatosParaInforme(NOMBRES, 'a b', false)).toEqual([]);
  });

  it('dedup y tope de 8: es un diagnostico, no un volcado', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => `Item ${i}`).concat(['Item 0']);
    const r = candidatosParaInforme(muchos, 'Item', true);
    expect(r).toHaveLength(8);
    expect(new Set(r).size).toBe(8);
  });
});
