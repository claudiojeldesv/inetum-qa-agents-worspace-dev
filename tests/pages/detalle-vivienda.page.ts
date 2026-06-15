import { type Locator, type Page } from '@playwright/test';

/**
 * DetalleViviendaPage — Page Object Model for the "detalle-vivienda" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class DetalleViviendaPage {
  readonly page: Page;
  readonly pisoOApartamentoEnPlantaBaja: Locator;
  readonly pisoOApartamentoEnPlantaPrimera: Locator;
  readonly pisoOApartamentoEnPlantaIntermedia: Locator;
  readonly pisoOApartamentoEnTico: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pisoOApartamentoEnPlantaBaja = this.page.getByRole('button', { name: 'PISO O APARTAMENTO EN PLANTA BAJA' });
    this.pisoOApartamentoEnPlantaPrimera = this.page.getByRole('button', { name: ' PISO O APARTAMENTO EN PLANTA PRIMERA' });
    this.pisoOApartamentoEnPlantaIntermedia = this.page.getByRole('button', { name: 'PISO O APARTAMENTO EN PLANTA INTERMEDIA' });
    this.pisoOApartamentoEnTico = this.page.getByRole('button', { name: 'PISO O APARTAMENTO EN ÁTICO' });
  }

  async goto() {
    await this.page.goto('/tipo-vivienda');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
