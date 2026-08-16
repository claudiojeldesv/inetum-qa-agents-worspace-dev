# Spec template — la anatomía canónica del `.spec.ts`

Contrato de FORMA del output del agente. Lo consumen tres piezas: el emisor determinista
(`walk-to-spec`, que lo implementa como código), el `ia4d-writer` (que recibe el golden de abajo
como ejemplo few-shot: su output debe ser indistinguible de esto salvo el contenido) y
`pre-review.ts` (checks `SF-*` de forma, should-fix — la forma no bloquea un test correcto,
pero el Reviewer la ve y el Writer la corrige en iteración).

Por qué existe: tres runs del agente produjeron tres dialectos (`// Paso 1` / `// Step 1` /
`test.step()`, cabeceras distintas, describe con y sin prefijo). El prompt decía QUÉ reglas
cumplir, no CÓMO SE VE un spec bien hecho. La forma es lo que el ingeniero QA lee.

Lo cosmético (comillas, indentación, líneas) NO se le pide al LLM: Prettier normaliza todo spec
al final del pipeline a $0. Este documento fija lo que Prettier no puede: estructura y semántica
de bloques.

---

## El golden example

```typescript
/**
 * @criterion RF-001 (fd-parabank-regresion.md:22-24)
 * @tc-id TC-01
 * @generated-by ia4d-writer
 * @writer-iterations 0
 * @reviewer-verdict pass
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginPage } from '../../pages/parabank/login.page';
import { AccountsOverviewPage } from '../../pages/parabank/accounts-overview.page';

// RF-001 valida el propio login → este spec arranca SIN el storageState autenticado de la suite.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Inicio de sesión', () => {
  test('credenciales válidas → accede al área privada y ve el resumen de cuentas', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const accountsOverviewPage = new AccountsOverviewPage(page);

    await test.step('Dado: el formulario de login', async () => {
      await loginPage.goto();
      await expect(loginPage.username).toBeVisible();
    });

    await test.step('Evidencia a11y (WCAG 2.1 AA)', async () => {
      const scan = await new AxeBuilder({ page }).analyze();
      test.info().annotations.push({
        type: 'a11y-scan',
        description: `${scan.violations.length} violaciones (warning — a11y.fail_on_violations: false)`,
      });
    });

    await test.step('Cuando: introduce las credenciales demo', async () => {
      await loginPage.login('john', 'demo');
    });

    await test.step('Entonces: accede al área privada (RF-001)', async () => {
      await expect(accountsOverviewPage.accountsOverview).toBeVisible();
      // estado condicional: Log Out solo existe autenticado
      await expect(accountsOverviewPage.logOut).toBeVisible();
    });
  });
});
```

---

## Anatomía, bloque a bloque (orden FIJO)

1. **JSDoc de cabecera** — trazabilidad y procedencia de un vistazo:
   - `@criterion` — cita del criterio fuente (S3: `RF-NNN (fichero:líneas)`; S4: prosa del plan). Obligatorio (MF-5).
   - `@tc-id` — solo si el command lo pasó.
   - `@generated-by` — `walk-to-spec vN` (emisor determinista) o `ia4d-writer`. Quién produjo el
     fichero es dato de auditoría, no se infiere.
   - `@writer-iterations` / `@reviewer-verdict` — solo en el camino Writer.
2. **Imports en 4 grupos, este orden**: runner (`@playwright/test`) → a11y (`@axe-core/playwright`)
   → POMs (en orden de aparición) → fixtures/datos sintéticos. Sin líneas en blanco entre grupos
   (Prettier no las gestiona; el orden sí es contrato).
3. **Excepciones de estado** (`test.use`, etc.) — solo si aplican, SIEMPRE precedidas de un
   comentario de una línea con el porqué (clase 2 del régimen de comentarios).
4. **`test.describe('<feature en prosa ES>')`** — sin prefijo `Feature:` (no añade información),
   sin slug kebab-case, sin naturaleza. Ej.: `'Inicio de sesión'`, `'Transferencia entre cuentas'`.
5. **`test('<condición> → <resultado>')`** — patrón del contract (`naming.test_title_pattern`).
   La naturaleza vive solo en el tag `@negative`, jamás en el título.
6. **Instancias de POM juntas**, al inicio del test, en orden de uso.
7. **Pasos como `test.step()`** (con `evidence.level: steps`, el default) — ver mapeo de títulos.
   Los asserts de cada paso viven DENTRO de su step, nunca huérfanos entre steps.
8. **El scan a11y es siempre el segundo step**, con título fijo `'Evidencia a11y (WCAG 2.1 AA)'`
   — tras el primer `goto`, antes de cualquier acción de negocio. El ojo del QA aprende dónde está.

## Mapeo de títulos de step (vocabulario del FD)

| Naturaleza del paso | Título |
|---|---|
| Setup / estado inicial (goto, precondiciones) | `Dado: <estado>` |
| Scan a11y | `Evidencia a11y (WCAG 2.1 AA)` (fijo) |
| Acción de negocio (fill/click/select) | `Cuando: <acción en prosa>` |
| Postcondición (`expect_*`) | `Entonces: <resultado> (<RF-NNN si aplica>)` |

No es Gherkin decorativo: el guion viene del FD y el QA que revisa lee la misma estructura
condición→acción→resultado que escribió en su diseño funcional. En Allure, cada step da timing
propio y ancla los attachments de `evidence.level: full`; en un fallo, el error dice en qué paso
de NEGOCIO rompió, no solo en qué línea.

## Régimen de comentarios — solo TRES clases permitidas

1. **Estado condicional** — por qué un locator solo existe en este estado:
   `// estado condicional: Remove sustituye a Add tras añadir el producto`.
2. **Excepción declarada** — por qué este spec se desvía de la convención de la suite (el
   `test.use` del golden). Una línea, encima del código que la implementa.
3. **Cita de evidencia parcial** — cuando el walk trae `matched_text` distinto del literal buscado
   (K0.37), el spec aserta el literal del FD y cita el texto completo observado:
   `// texto completo observado: "(0) No Records Found" — el criterio pide "Records Found"`.

Todo lo demás es ruido y está prohibido: narrar la línea siguiente, explicar qué hace un click,
`// verificamos que...`. Cada comentario que sobrevive significa algo para el revisor.

Los tags de protocolo (`// css-fallback:`, `// TODO writer:`, `// TODO consolidacion-pom:`,
`// instancia verificada:`) no son comentarios de esta taxonomía — son marcas machine-readable
del protocolo Writer/Reviewer y siguen sus propias reglas.

## `evidence.level` y la forma del cuerpo

- **`steps` (default)** — el golden de arriba: `test.step()` por paso lógico.
- **`full`** — `steps` + screenshot al cierre de cada step (`test.info().attach`, viewport).
- **`minimal`** — opt-out austero por contract: cuerpo plano con marcadores `// Paso N: <prosa>`
  (español; `// Step N` es dialecto y el pre-review lo marca). Mismo orden de bloques, mismos
  asserts, mismo régimen de comentarios.

## Enforcement

| Capa | Mecanismo |
|---|---|
| Emisor `walk-to-spec` | El template es código: imposible desviarse. Par falsable: su output pasa `pre-review` con 0 findings de forma |
| `ia4d-writer` | Este golden como few-shot; "indistinguible salvo contenido" |
| `pre-review.ts` | `SF-generated-by`, `SF-steps`, `SF-step-lang`, `SF-a11y-step` (should-fix) |
| Prettier | `npx prettier --write` sobre los specs al cierre del stage de writers, antes del Reviewer de lote/verify |
