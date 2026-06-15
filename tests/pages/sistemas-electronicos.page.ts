import { type Locator, type Page } from '@playwright/test';

/**
 * SistemasElectronicosPage — Page Object Model for the "sistemas-electronicos" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class SistemasElectronicosPage {
  readonly page: Page;
  readonly conContratoDeMantenimientoYConVigilanciaPermanente: Locator;
  readonly conContratoDeMantenimientoYSinVigilanciaPermanente: Locator;
  readonly noDispongoDeNingNServicioDeEsteTipo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.conContratoDeMantenimientoYConVigilanciaPermanente = this.page.getByRole('button', { name: ' CON CONTRATO DE MANTENIMIENTO Y CON VIGILANCIA PERMANENTE' });
    this.conContratoDeMantenimientoYSinVigilanciaPermanente = this.page.getByRole('button', { name: ' CON CONTRATO DE MANTENIMIENTO Y SIN VIGILANCIA PERMANENTE' });
    this.noDispongoDeNingNServicioDeEsteTipo = this.page.getByRole('button', { name: ' NO DISPONGO DE NINGÚN SERVICIO DE ESTE TIPO' });
  }

  async goto() {
    await this.page.goto('/sistemas-electronicos');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
