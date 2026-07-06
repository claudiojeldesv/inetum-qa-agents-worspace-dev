import { describe, it, expect } from 'vitest';
import { checkUrl, type AllowedTargetsConfig } from '../../src/compliance-preflight.ts';

const baseConfig: AllowedTargetsConfig = {
  version: 1,
  mode: 'greybox',
  patterns: [
    'https://www.saucedemo.com/*',
    'https://*.qa.*',
    'https://*.staging.*',
    'http://localhost:*',
  ],
  forbidden_patterns: ['https://prod.*', 'https://*.production.*'],
};

describe('compliance-preflight checkUrl', () => {
  it('allows SauceDemo (declared)', () => {
    const r = checkUrl('https://www.saucedemo.com/inventory.html', baseConfig);
    expect(r.verdict).toBe('pass');
  });

  it('allows localhost', () => {
    const r = checkUrl('http://localhost:3000/app', baseConfig);
    expect(r.verdict).toBe('pass');
  });

  it('allows a qa subdomain', () => {
    const r = checkUrl('https://app.qa.example.com/', baseConfig);
    expect(r.verdict).toBe('pass');
  });

  it('blocks a production URL by hardcoded rule C2', () => {
    const r = checkUrl('https://app.production.example.com/', baseConfig);
    expect(r.verdict).toBe('block');
    expect(r.rule).toBe('C2');
  });

  it('blocks an unknown URL by rule C1', () => {
    const r = checkUrl('https://unknown-app.com/', baseConfig);
    expect(r.verdict).toBe('block');
    expect(r.rule).toBe('C1');
  });

  it('blocks explicit forbidden_patterns match', () => {
    const r = checkUrl('https://prod.bank.example.com/', baseConfig);
    expect(r.verdict).toBe('block');
    expect(r.rule).toBe('C2');
  });

  it('warns when URL is allowed but lacks non-prod prefix', () => {
    const config: AllowedTargetsConfig = {
      ...baseConfig,
      patterns: ['https://example.com/*'],
    };
    const r = checkUrl('https://example.com/page', config);
    expect(r.verdict).toBe('warn');
    expect(r.rule).toBe('W1');
  });
});
