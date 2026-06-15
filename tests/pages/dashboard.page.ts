import { type Locator, type Page } from '@playwright/test';

/**
 * DashboardPage — Page Object Model for the "dashboard" screen.
 * Scaffolded by src/pom-scaffolder.ts. Locators below come from discovery-report.
 * Actions and intermediate methods are added by ia4d-writer.
 */
export class DashboardPage {
  readonly page: Page;
  readonly dashboard: Locator;
  readonly sidepanel: Locator;
  readonly search: Locator;
  readonly admin: Locator;
  readonly pim: Locator;
  readonly leave: Locator;
  readonly time: Locator;
  readonly recruitment: Locator;
  readonly myInfo: Locator;
  readonly performance: Locator;
  readonly dashboard2: Locator;
  readonly directory: Locator;
  readonly maintenance: Locator;
  readonly claim: Locator;
  readonly buzz: Locator;
  readonly admin2: Locator;
  readonly profilePicture: Locator;
  readonly element17: Locator;
  readonly about: Locator;
  readonly support: Locator;
  readonly changePassword: Locator;
  readonly logout: Locator;
  readonly timeAtWork: Locator;
  readonly myActions: Locator;
  readonly quickLaunch: Locator;
  readonly buzzLatestPosts: Locator;
  readonly employeesOnLeaveToday: Locator;
  readonly employeeDistributionBySubUnit: Locator;
  readonly assignLeave: Locator;
  readonly topbarHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dashboard = this.page.getByRole('heading', { name: 'Dashboard' });
    this.topbarHeading = this.page.getByRole('heading', { name: 'Dashboard', level: 6 });
    this.sidepanel = this.page.getByRole('navigation', { name: 'Sidepanel' });
    this.search = this.page.getByRole('textbox', { name: 'Search' });
    this.admin = this.page.getByRole('link', { name: 'Admin' });
    this.pim = this.page.getByRole('link', { name: 'PIM' });
    this.leave = this.page.getByRole('link', { name: 'Leave' });
    this.time = this.page.getByRole('link', { name: 'Time' });
    this.recruitment = this.page.getByRole('link', { name: 'Recruitment' });
    this.myInfo = this.page.getByRole('link', { name: 'My Info' });
    this.performance = this.page.getByRole('link', { name: 'Performance' });
    this.dashboard2 = this.page.getByRole('link', { name: 'Dashboard' });
    this.directory = this.page.getByRole('link', { name: 'Directory' });
    this.maintenance = this.page.getByRole('link', { name: 'Maintenance' });
    this.claim = this.page.getByRole('link', { name: 'Claim' });
    this.buzz = this.page.getByRole('link', { name: 'Buzz' });
    this.admin2 = this.page.getByText('Admin', { exact: true }); // was getByRole('paragraph') — 'paragraph' is not a valid Playwright ARIA role; using getByText instead
    // Scoped to banner to avoid strict-mode violation: the page has multiple 'profile picture' imgs
    // (one in topbar, several in Buzz/attendance widgets). Banner contains exactly one.
    this.profilePicture = this.page.getByRole('banner').getByRole('img', { name: 'profile picture' });
    this.element17 = this.profilePicture; // topbar user-dropdown trigger: clicking profile picture opens the menu (listitem had no name — not refinable; profilePicture is the stable semantic handle)
    this.about = this.page.getByRole('menuitem', { name: 'About' });
    this.support = this.page.getByRole('menuitem', { name: 'Support' });
    this.changePassword = this.page.getByRole('menuitem', { name: 'Change Password' });
    this.logout = this.page.getByRole('menuitem', { name: 'Logout' });
    // OrangeHRM dashboard widgets are not landmark regions — they are generic containers.
    // Widget titles are rendered as <p> (paragraph) elements. Locators target the visible title text.
    // Assertion is toBeVisible() on the title paragraph, which confirms widget presence without
    // asserting dynamic content (counts, names, dates).
    this.timeAtWork = this.page.getByText('Time at Work', { exact: true });
    this.myActions = this.page.getByText('My Actions', { exact: true });
    // quickLaunch targets the title paragraph — for button scoping use dashboardPage.assignLeave directly
    this.quickLaunch = this.page.getByText('Quick Launch', { exact: true });
    this.buzzLatestPosts = this.page.getByText('Buzz Latest Posts', { exact: true });
    this.employeesOnLeaveToday = this.page.getByText('Employees on Leave Today', { exact: true });
    this.employeeDistributionBySubUnit = this.page.getByText('Employee Distribution by Sub Unit', { exact: true });
    this.assignLeave = this.page.getByRole('button', { name: 'Assign Leave' });
  }

  async goto() {
    await this.page.goto('/web/index.php/dashboard/index');
  }

}
