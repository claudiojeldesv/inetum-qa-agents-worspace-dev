import { type Locator, type Page } from '@playwright/test';

/**
 * ActivityPage — Page Object Model for the "activity" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class ActivityPage {
  readonly page: Page;


  constructor(page: Page) {
    this.page = page;

  }

  async goto() {
    await this.page.goto('/parabank/activity.htm');
  }

  // TODO writer: add semantic action methods (e.g. login(user, pass), addItemToCart(name))
}
