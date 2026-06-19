import { type Locator, type Page } from '@playwright/test';

/**
 * SimuladorAhorroPage — Page Object Model for the "simulador-ahorro" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class SimuladorAhorroPage {
  readonly page: Page;
  readonly aportaciNInicial: Locator;
  readonly aportaciNMensual: Locator;
  readonly plazoEnAOs: Locator;
  readonly calculateSimulateAction: Locator;
  readonly nextStepCta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.aportaciNInicial = this.page.getByRole('textbox', { name: 'aportación inicial' });
    this.aportaciNMensual = this.page.getByRole('textbox', { name: 'aportación mensual' });
    this.plazoEnAOs = this.page.getByRole('textbox', { name: 'plazo en años' });
    this.calculateSimulateAction = this.page.getByRole('button', { name: 'calculate/simulate action' });
    this.nextStepCta = this.page.getByRole('button', { name: 'next-step CTA' });
  }

  async goto() {
    await this.page.goto('/ahorro-inversion/simulador');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
