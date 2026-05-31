import { type Locator, type Page } from '@playwright/test';

/**
 * CatalogPage — Page Object Model for the "catalog" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class CatalogPage {
  readonly page: Page;

  /**
   * Intentionally NOT using getByTestId('product-01KSYQM9VRT3KSME48W9N7DE9S').
   *
   * Locator-hardener decision: the UUID in data-test ('product-<uuid>') is
   * dataset-dependent — the literal value changes if the DB is seeded differently
   * or the product is deleted/recreated. Hardcoding it is a known fragility
   * flagged in discovery coverage_gaps.
   *
   * Stable alternative: getByTestId(/^product-/) matches ANY product card link
   * by the invariant prefix, then .first() picks the topmost in DOM order.
   * This survives UUID rotation while still using the data-test contract.
   * Playwright getByTestId accepts RegExp since v1.27.
   */
  get firstProductLink(): Locator {
    return this.page.getByTestId(/^product-/).first();
  }

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
  }

  async openFirstProduct(): Promise<void> {
    await this.firstProductLink.click();
  }
}
