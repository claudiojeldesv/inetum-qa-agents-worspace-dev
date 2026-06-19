import { type Locator, type Page } from '@playwright/test';

/**
 * HomePage — Page Object Model for the "home" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class HomePage {
  readonly page: Page;
  readonly telFono: Locator;
  readonly hogar: Locator;
  readonly decesos: Locator;
  readonly vida: Locator;
  readonly salud: Locator;
  readonly heLeDoYAceptoLaInformaciNSobreLaProtecciNDeDatos: Locator;
  readonly quieroRecibirInformaciNSobreProductosYOfertasQueMePuedanBeneficiar: Locator;
  readonly solicitarLlamada: Locator;
  readonly teLlamamosGratis: Locator;
  readonly atenciNAlCliente: Locator;
  readonly contrataTuSeguro: Locator;
  readonly santalucASeguros: Locator;
  readonly teLlamamosGratis2: Locator;
  readonly teLlamamosGratis3: Locator;
  readonly teLlamamosGratis4: Locator;
  readonly eligeTuSeguro: Locator;
  readonly telFono2: Locator;
  readonly heLeDoYAceptoLaInformaciNSobreLaProtecciNDeDatos2: Locator;
  readonly teLlamamos: Locator;
  readonly cerrarVentanaDeDiLogo: Locator;
  readonly consultaLasCondiciones: Locator;
  readonly siguiente: Locator;
  readonly anterior: Locator;
  readonly avisoLegal: Locator;
  readonly polTicaDePrivacidad: Locator;
  readonly polTicaDeCookies: Locator;

  constructor(page: Page) {
    this.page = page;
    this.telFono = this.page.getByRole('textbox', { name: 'Teléfono' });
    this.hogar = this.page.getByRole('radio', { name: 'Hogar' });
    this.decesos = this.page.getByRole('radio', { name: 'Decesos' });
    this.vida = this.page.getByRole('radio', { name: 'Vida' });
    this.salud = this.page.getByRole('radio', { name: 'Salud' });
    this.heLeDoYAceptoLaInformaciNSobreLaProtecciNDeDatos = this.page.getByRole('checkbox', { name: 'He leído y acepto la información sobre la Protección de datos' });
    this.quieroRecibirInformaciNSobreProductosYOfertasQueMePuedanBeneficiar = this.page.getByRole('checkbox', { name: 'Quiero recibir información sobre productos y ofertas que me puedan beneficiar' });
    this.solicitarLlamada = this.page.getByRole('button', { name: 'Solicitar llamada' });
    this.teLlamamosGratis = this.page.getByRole('button', { name: 'Te llamamos GRATIS' });
    this.atenciNAlCliente = this.page.getByRole('link', { name: 'Llamar al 900242020' });
    this.contrataTuSeguro = this.page.getByRole('link', { name: /Llamar al 959|Llamar al 900 10/i }).first();
    this.santalucASeguros = this.page.getByRole('img', { name: 'Santalucía Seguros' });
    this.teLlamamosGratis2 = this.page.getByRole('button', { name: 'Te llamamos GRATIS' });
    this.teLlamamosGratis3 = this.page.getByRole('button', { name: 'Te llamamos GRATIS' });
    this.teLlamamosGratis4 = this.page.getByRole('button', { name: 'Te llamamos GRATIS' });
    this.eligeTuSeguro = this.page.getByRole('combobox', { name: 'Elige tu seguro' });
    this.telFono2 = this.page.getByRole('textbox', { name: 'Teléfono' });
    this.heLeDoYAceptoLaInformaciNSobreLaProtecciNDeDatos2 = this.page.getByRole('checkbox', { name: 'He leído y acepto la información sobre la Protección de datos' });
    this.teLlamamos = this.page.getByRole('button', { name: 'Te llamamos' });
    this.cerrarVentanaDeDiLogo = this.page.getByRole('button', { name: 'Cerrar ventana de diálogo' });
    this.consultaLasCondiciones = this.page.getByRole('link', { name: 'Consulta las condiciones' });
    this.siguiente = this.page.getByRole('button', { name: 'Siguiente' });
    this.anterior = this.page.getByRole('button', { name: 'Anterior' });
    this.avisoLegal = this.page.getByRole('link', { name: 'Aviso Legal' });
    this.polTicaDePrivacidad = this.page.getByRole('link', { name: 'Política de Privacidad' });
    this.polTicaDeCookies = this.page.getByRole('link', { name: 'Política de Cookies' });
  }

  async goto() {
    await this.page.goto(process.env['QA_BASE_URL'] ?? 'https://www.santalucia.es/es/segurosmultirramo');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
