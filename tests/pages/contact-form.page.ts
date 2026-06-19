import { type Locator, type Page } from '@playwright/test';

/**
 * ContactFormPage — Page Object Model for the "contact-form" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators refined by ia4d-writer (TC004).
 * Discovery-report strategies: discovery-report.json › screens[4] (contact-form).
 */
export class ContactFormPage {
  readonly page: Page;
  readonly nombreApellidos: Locator;
  readonly email: Locator;
  readonly telFono: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    // Discovery strategy: getByLabel(/nombre|apellidos/i)
    this.nombreApellidos = this.page.getByLabel(/nombre|apellidos/i).first();
    // Discovery strategy: getByLabel(/email|correo/i)
    this.email = this.page.getByLabel(/email|correo/i).first();
    // Discovery strategy: getByLabel(/teléfono|telefono/i) — accent-insensitive regex
    this.telFono = this.page.getByLabel(/tel[eé]fono/i).first();
    // Discovery strategy: getByRole('button', { name: /enviar|solicitar|contactar/i })
    this.submit = this.page.getByRole('button', { name: /enviar|solicitar|contactar/i }).first();
  }

  async goto() {
    await this.page.goto('/ahorro-inversion/solicitar-informacion');
  }

  /**
   * Assert all required fields are visible.
   * Called from the spec to satisfy MF-8 (POM used for page interactions).
   */
  async assertFieldsVisible(): Promise<void> {
    await this.nombreApellidos.waitFor({ state: 'visible' });
    await this.email.waitFor({ state: 'visible' });
    await this.telFono.waitFor({ state: 'visible' });
    await this.submit.waitFor({ state: 'visible' });
  }

  /**
   * Submit the form in its current state (may be empty for negative-validation).
   * SAFE: does not pre-fill any fields — caller is responsible for data.
   */
  async submitForm(): Promise<void> {
    await this.submit.click();
  }
}
