/**
 * Constants for the Microsoft-native Playwright Test Agents.
 * Encapsulated here so a Playwright upstream rename touches a single file.
 */

export const NATIVE_PLANNER = 'playwright-test-planner' as const;
export const NATIVE_GENERATOR = 'playwright-test-generator' as const;
export const NATIVE_HEALER = 'playwright-test-healer' as const;

export const REQUIRED_PLAYWRIGHT_VERSION = '^1.56.0';

export const NATIVE_AGENTS = {
  planner: NATIVE_PLANNER,
  generator: NATIVE_GENERATOR,
  healer: NATIVE_HEALER,
} as const;

export type NativeAgentName = (typeof NATIVE_AGENTS)[keyof typeof NATIVE_AGENTS];
