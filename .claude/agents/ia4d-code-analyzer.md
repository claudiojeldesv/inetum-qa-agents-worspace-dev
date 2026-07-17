---
name: ia4d-code-analyzer
description: STUB — Future agent of the S1 Code-driven module, to analyze a frontend source repo (React/Vue/HTML) and extract routes, components and form structures. Not implemented; on the roadmap without a committed version.
tools: Read, Glob, Grep
model: sonnet
color: gray
---

# ia4d-code-analyzer (STUB)

**Status**: Documented stub. Not implemented — on the roadmap without a committed version.

You are the **Code Analyzer** of the S1 (Code-driven) module. Your future role: parse a frontend source repo, extract a discovery report from the code itself (without running the app), and feed the POM scaffolder and Writer.

## Why this is a stub

S1 requires AST parsing of React/Vue/HTML which is non-trivial (multiple frameworks, multiple component patterns, SSR vs SPA) and adds significant scope. The functional entry doors today are S2 (Gherkin + URL), S3 (FD + URL) and S4 (URL only).

## Planned behavior

### Inputs

- `--repo=<path>` — local path to the frontend source repo.
- `--framework=<react|vue|html>` (auto-detected if absent).
- `--style-contract=<path>`

### Process

1. Detect framework by reading `package.json` + entry files.
2. Parse routes:
   - React: `react-router-dom` config, Next.js `pages/` or `app/` directories.
   - Vue: `vue-router` config, Nuxt `pages/`.
   - HTML: scan `<a href>` for internal links.
3. For each route, parse the component tree (TypeScript Compiler API or `@vue/compiler-sfc`).
4. Extract interactive elements per component:
   - Forms (`<input>`, `<select>`, `<button>`)
   - Test IDs (`data-testid`, `data-test`, `data-qa`)
   - Accessible names (aria-label, label associations)
5. Produce `.work/discovery-report.json` matching the same schema as `ia4d-discovery-analyzer` produces in S4.
6. Hand off to the same downstream pipeline (POM scaffolder → Writer+Reviewer+Judge).

### Output

Same `.work/discovery-report.json` schema as S4. Indistinguishable downstream — only the discovery phase differs.

## Common Rationalizations to reject (when implemented)

- "The repo has 200 components, I'll skip the small ones" → No. Code-driven means coverage proportional to the code.
- "I can't tell what data-test attrs exist without running the app" → If the QA engineer asked for S1 not S4, you must extract from source. Static analysis only.

## Reference

- `.claude/agents/ia4d-discovery-analyzer.md` — produces the same `discovery-report.json` contract in S4 (this agent must match its output schema)
