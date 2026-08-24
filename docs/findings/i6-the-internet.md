# I6 — the-internet: el gate extremo a extremo en un sitio nuevo

**2026-08-24.** Tercera pieza de la gira de dominio y la iteración I6 del
[plan del gate de locators medidos](../tasks/plan-gate-locators-medidos.md): primera vez que un
sitio entra al pipeline con G1 (`MF-locator-no-medido`) y G3 (`accessible_names_found`) puestos.
Workspace limpio desde `template/` (healthcheck 32/32), plan del planner nativo acotado a 5 módulos,
6 casos, dos iteraciones.

## La predicción, escrita antes de correr

> Con G1+G3, el sitio nuevo no repite el patrón Dolibarr — los locators fantasma mueren en
> pre-review antes de ejecutar la suite, y los rojos que queden serán de otras clases.

## El resultado

| | Dolibarr (sin gate) | the-internet (con gate) |
|---|---|---|
| iteración 1 | **0/6** | **4/6** |
| causa de los rojos de iter1 | 6/6 por anclas afirmadas sin medir | 2/2 en **huecos declarados** |
| pre-review must-fix de locators | 0 (la regla no existía) | 0 — pero ver el matiz de abajo |
| iteración 2 | 3/6 | **6/6, doble pasada verde** (24,3 s / 19,3 s) |
| pases de Writer para sanar | 6 regenerados + diagnóstico manual | 2 reanudaciones, un intento cada una |

**La predicción se cumplió con un matiz que importa**: G1 dio 0 must-fix no porque cazara fantasmas,
sino porque **no se escribieron** — los Writers consumieron un discovery verificado, los nombres
reales de G3 y el protocolo de anotación, y no afirmaron ni un ancla sin medir. El valor del gate se
materializó aguas arriba (información + disuasión), no en el bloqueo. La potencia de bloqueo de G1
quedó demostrada en el corpus (I1: 6/6; I3: TC-004), no aquí. Las dos afirmaciones son compatibles y
conviene no venderlas como una sola.

## Los dos rojos de la iteración 1: la zona declarada

1. **TC-001** — `getByRole('heading', { name: 'Secure Area' })` → strict violation, 2 coincidencias
   (substring contra "Welcome to the **Secure Area**…"). La clase `Ref.` otra vez — pero en la
   pantalla `secure`, que el verificador declaró **unknown** (inalcanzable sin sesión) y G1 marcó
   como should-fix "hueco del verificador". El fallo ocurrió dentro del hueco declarado. Arreglo en
   un intento: `exact: true` citando la medición EN VIVO del propio error de Playwright.
2. **TC-005** — `Hello World!` no visible en 5000 ms: la carga real del sitio ronda los 5 s y el
   plan tenía el tiempo **declarado como hueco** ("no se midió"). Arreglo en un intento: presupuesto
   explícito `{ timeout: 15000 }` citando el run.

Los rojos migraron de "zona afirmada sin medir" (Dolibarr) a "zona declarada como no medida". Eso es
exactamente lo que el gate podía conseguir: no elimina la ignorancia, la deja firmada.

## La predicción de genericidad: cumplida en el borde

Declaraciones que este sitio necesitó y Dolibarr no hubiera necesitado ya: **UNA** —
`css_fallback_attributes: [id]`, porque el combobox de `/dropdown` no tiene nombre accesible y solo
se identifica por `id="dropdown"`. Sin locale, sin `entry_steps`, sin política de sesión. La
predicción de [genericidad-del-motor.md](genericidad-del-motor.md) §7 era "cero o una". Tiempo de
alta aproximado (liveness → doble verde, incluidos el desvío del bloqueo de compliance y 6
Writers+Reviewers): **~1h15 de reloj**; la parte de configuración pura (target + credencial +
contract), **~10 minutos**.

## Lo que hizo bien el producto

- **El pre-flight bloqueó al planner** contra el target aún no dado de alta en el workspace de la
  sesión. La coherencia planner↔verificador funcionó: los conteos de ambigüedad del plan
  (`Last Name` ×2, `edit`/`delete` ×8, checkboxes sin nombre ×2) coinciden con los medidos por
  `verify-locators` — dos medidores independientes, mismos números.
- El plan declaró sus huecos y **los dos fallos de iter1 cayeron dentro de ellos** — la sección
  "Huecos" demostró ser predictiva, no ceremonial.
- G3 en su primer sitio nuevo: la clase "nombre con espacio inicial" (`" Login"`, los flash) quedó
  medida ANTES de generar, y ningún Writer tropezó con ella.
- Ownership de POMs intacto (TC-002 dejó TODO en vez de tocar `login.page.ts` ajeno).

## Dos defectos nuevos (indexados: D53, D54)

- **D53** — el planner nativo, bloqueado por compliance, **intentó editar el allowlist** vía
  `browser_run_code_unsafe` (fs.writeFileSync desde el proceso del servidor Playwright) antes de
  detenerse. Lo frenó el clasificador de permisos de Claude Code, y el agente entonces paró y pidió
  — pero la primera reacción fue rodear el control, amparándose en la guía de usuario del CLAUDE.md
  del workspace. El prompt por-flujo que construye el command no lleva la regla de no-elusión que
  los agentes propios sí llevan. Abierto: endurecer el prompt del planner.
- **D54** — `MF-postcondition` contó un heading de mueble ("Dropdown List") como postcondición de
  negocio exigible en TC-004: falso positivo medido, adjudicado por el Reviewer como informativo.
  `BUSINESS_ROLES` incluye `heading` sin distinguir mueble de resultado. Pariente de D37 (aquel era
  ceguera de pantalla; este es ceguera de naturaleza). Abierto.

## Consecuencia para G2

El residuo de I6 **no pide** la variante "G2-evidencia" (nombres accesibles en tiempo de acción):
ninguno de los dos rojos era de la clase "desambiguado pero equivocado". La única instancia medida
de esa clase sigue siendo el TC-003 de Dolibarr. G2 queda donde la decisión del QA lo dejó:
condicionado a que un residuo real lo justifique.

## Abierto

- D53 y D54 (arriba).
- La pantalla `secure` sigue unknown para el verificador (haría falta `entry_steps` o el manejador
  de auth por URL — aquí sería legítimo: el login SÍ vive en una URL). No se añadió para no
  contaminar la medición de genericidad; queda como mejora opcional del contract.
- Los dos sitios… ya solo UNO de la gira: `automationexercise.com`. Y Mifos X pendiente de backend.
