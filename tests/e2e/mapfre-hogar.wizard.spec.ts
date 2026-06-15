// fixme-approved-by: playwright-test-healer — anti-bot server-side (E0006/acceso-restringido)
/**
 * @criterion RF-001 (fd-mapfre-hogar.md:30-36) · RF-002 (fd-mapfre-hogar.md:38-45) ·
 *            RF-004 (fd-mapfre-hogar.md:62-68) · RF-005 (fd-mapfre-hogar.md:70-74) ·
 *            RF-006 (fd-mapfre-hogar.md:76-83) · RF-007 (fd-mapfre-hogar.md:85-91) ·
 *            RF-008 (fd-mapfre-hogar.md:93-97) · RF-009 (fd-mapfre-hogar.md:99-105) ·
 *            RF-010 (fd-mapfre-hogar.md:107-113)
 * @writer-iterations 1
 * @reviewer-verdict pass
 *
 * RF-003 EXCLUIDO — drift confirmado: la pantalla de selección de dirección resuelta
 * ('ARENAL 24') no aparece en el DOM con los datos de prueba (CALLE REINA VICTORIA 24,
 * CP 03201). La API devuelve next='piso-o-unifamiliar' directamente. Ver plan §1.3.
 *
 * Scenario: wizard-tarificacion-completo
 * SPA lineal: NO se puede navegar directamente a pantallas intermedias.
 * El test recorre las 16 pantallas en secuencia desde la URL de entrada.
 * Datos: todos desde config/style-contracts/mapfre-hogar.yaml → synthetic_fixtures.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { PostalCodePage }               from '../pages/postal-code.page';
import { StreetAddressPage }            from '../pages/street-address.page';
import { TipoViviendaPage }             from '../pages/tipo-vivienda.page';
import { DetalleViviendaPage }          from '../pages/detalle-vivienda.page';
import { MetrosConstruidosPage }        from '../pages/metros-construidos.page';
import { DatosViviendaPage }            from '../pages/datos-vivienda.page';
import { AnioConstruccionPage }         from '../pages/anio-construccion.page';
import { CodigoPostalConfirmacionPage } from '../pages/codigo-postal-confirmacion.page';
import { OcupacionViviendaPage }        from '../pages/ocupacion-vivienda.page';
import { SistemasElectronicosPage }     from '../pages/sistemas-electronicos.page';
import { ProteccionDomoticaPage }       from '../pages/proteccion-domotica.page';
import { SistemasNoElectronicosPage }   from '../pages/sistemas-no-electronicos.page';
import { ContinentePage }               from '../pages/continente.page';
import { ContenidoPage }                from '../pages/contenido.page';
import { DocumentoIdentidadPage }       from '../pages/documento-identidad.page';
import { FechaNacimientoPage }          from '../pages/fecha-nacimiento.page';

// Synthetic fixtures — source of truth: config/style-contracts/mapfre-hogar.yaml
const FIXTURES = {
  codigoPostal:       '03201',
  calleBusqueda:      'REINA',
  calleSugerencia:    'CALLE REINA VICTORIA',
  numero:             '24',
  // piso: DOM real usa radio-buttons (no dropdown). "planta primera" = equivalente a piso 01.
  pisoOpcion:         ' PISO O APARTAMENTO EN PLANTA PRIMERA',
  sistemaElectronico: ' CON CONTRATO DE MANTENIMIENTO Y CON VIGILANCIA PERMANENTE',
  proteccionDomotica: ' NO',
  metrosConstruidos:  '80',
  numHabitaciones:    '3',
  numBanios:          '1',
  anioConstruccion:   '1990',
  fechaDia:           '01',
  fechaMes:           '02',
  fechaAnio:          '1990',
  // DNI sintético de prueba — allowlisted en style-contract (PII boundary)
  dni:                '71416690B',
} as const;

const ENTRY_URL = process.env['QA_BASE_URL'] ??
  'https://precio.mapfre.es/calcular-seguro-hogar/es/direccion?origen=SEO&PPPO=MINTER&flujo=fq';

test.describe('Feature: Wizard de tarificación de seguro de hogar MAPFRE', () => {

  // FIXME: El servidor de Mapfre devuelve E0006 ("acceso-restringido") en la respuesta
  // al POST /api/pages/direccion tras el envío del código postal. La respuesta incluye
  // Walmeric_leadid (hash de fingerprint de navegador) que el backend de Mapfre ha
  // bloqueado después de las múltiples ejecuciones automatizadas de esta sesión.
  // El bloqueo es server-side (HTTP 200 con next:"acceso-restringido") — no es transitorio
  // ni un selector roto. El código del test es correcto; el obstáculo es el anti-bot de
  // producción de un tercero. Se desbloquea ejecutando desde un entorno con IP/fingerprint
  // no marcado (nueva máquina, proxy, entorno limpio).
  test.fixme('Scenario: wizard-tarificacion-completo', async ({ page }) => {

    // ── PANTALLA 1: Código Postal ──────────────────────────────────────────────
    // @criterion RF-001 (fd-mapfre-hogar.md:30-36)
    // Given: El usuario accede al tarificador en la pantalla de código postal
    // When: Introduce CP válido y pulsa Aceptar
    // Then: Avanza a la pantalla de dirección (calle y número)

    await page.goto(ENTRY_URL);

    // Axe-core A11y check — gate off (fail_on_violations: false), modo WARNING auditable
    // Severity threshold: [serious, critical]
    const axeResults = await new AxeBuilder({ page }).analyze();
    const a11yViolations = axeResults.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolations.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolations.length} serious/critical violation(s): ` +
          a11yViolations.map(v => v.id).join(', '),
      });
    }

    // Aceptar cookies
    // El aria-label del dialog contiene HTML crudo (no texto plano), por lo que
    // getByRole('dialog', { name: '...' }) no hace match. Se usan ids estables
    // del widget OneTrust (css_fallback_attributes: id per style-contract).
    const cookieDialog = page.locator('.ot-sdk-container');
    await expect(cookieDialog).toBeVisible();
    await page.locator('#onetrust-accept-btn-handler').click();
    await expect(cookieDialog).not.toBeVisible();

    const postalCodePage = new PostalCodePage(page);
    await expect(postalCodePage.cDigoPostal).toBeVisible();
    await postalCodePage.cDigoPostal.fill(FIXTURES.codigoPostal);
    await expect(page.getByText('ELX-ELCHE, ALICANTE-ALACANT')).toBeVisible();
    await postalCodePage.aceptar2.click();
    await expect(page).toHaveURL(/\/direccion-completa/);

    // ── PANTALLA 2: Dirección (calle y número) ────────────────────────────────
    // @criterion RF-002 (fd-mapfre-hogar.md:38-45)
    // Given: El usuario se encuentra en la pantalla de calle y número
    // When: Escribe parte del nombre de la calle, selecciona la sugerencia, introduce número
    // Then: Avanza (en estos datos, la API salta directamente a /piso-o-unifamiliar)

    const streetPage = new StreetAddressPage(page);
    await expect(streetPage.nombreDeLaVA).toBeVisible();
    await streetPage.nombreDeLaVA.pressSequentially(FIXTURES.calleBusqueda);
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('listitem', { name: FIXTURES.calleSugerencia }).click();
    await expect(streetPage.nombreDeLaVA).toHaveValue(FIXTURES.calleSugerencia);
    await expect(streetPage.nMero).toBeEnabled();
    await streetPage.nMero.fill(FIXTURES.numero);
    await streetPage.aceptar.click();
    // RF-003 DRIFT: la pantalla de desambiguación no aparece con estos datos;
    // la API devuelve directamente /piso-o-unifamiliar.
    await expect(page).toHaveURL(/\/piso-o-unifamiliar/);

    // ── PANTALLA 3 (tránsito): Tipo de vivienda ───────────────────────────────

    const tipoViviendaPage = new TipoViviendaPage(page);
    await expect(tipoViviendaPage.pisoOApartamentoPisoOApartamento).toBeVisible();
    await tipoViviendaPage.pisoOApartamentoPisoOApartamento.click();
    await expect(page).toHaveURL(/\/tipo-vivienda/);

    // ── PANTALLA 4: Detalle de vivienda ───────────────────────────────────────
    // @criterion RF-004 (fd-mapfre-hogar.md:62-68)
    // Given: El usuario se encuentra en la pantalla 'Detalle de vivienda'
    // When: Selecciona el piso (radio-button — no dropdown, ver discrepancia plan §1.5)
    // Then: Avanza a /metros-construidos

    const detalleViviendaPage = new DetalleViviendaPage(page);
    await expect(page.getByRole('heading', { name: 'Detalle de vivienda', level: 2 })).toBeVisible();
    await expect(detalleViviendaPage.pisoOApartamentoEnPlantaPrimera).toBeVisible();
    await detalleViviendaPage.pisoOApartamentoEnPlantaPrimera.click();
    await expect(page).toHaveURL(/\/metros-construidos/);

    // ── PANTALLA 5 (tránsito): Metros construidos ─────────────────────────────
    // css_fallback_attributes: id — el DOM no expone label semántico para #metrosConstruidos

    const metrosPage = new MetrosConstruidosPage(page);
    // POM scaffolded this as getByTestId but the DOM uses id="metrosConstruidos" (not data-testid).
    // Using css id fallback per style-contract css_fallback_attributes: [id].
    const metrosInput = page.locator('#metrosConstruidos');
    await expect(metrosInput).toBeVisible();
    await metrosInput.fill(FIXTURES.metrosConstruidos);
    await metrosPage.aceptar.click();
    await expect(page).toHaveURL(/\/numero-habitaciones-banios/);

    // ── PANTALLA 6 (tránsito): Datos de la vivienda (habitaciones/baños) ─────

    const datosViviendaPage = new DatosViviendaPage(page);
    await expect(datosViviendaPage.nMeroHabitacionesSalones).toBeVisible();
    await datosViviendaPage.nMeroHabitacionesSalones.fill(FIXTURES.numHabitaciones);
    await datosViviendaPage.nMeroBaOs.fill(FIXTURES.numBanios);
    await datosViviendaPage.aceptar.click();
    await expect(page).toHaveURL(/\/anio-construccion/);

    // ── PANTALLA 7 (tránsito): Año de construcción ───────────────────────────
    // css_fallback_attributes: id — el DOM no expone label semántico para #anioConstruccion

    const anioPage = new AnioConstruccionPage(page);
    // POM scaffolded this as getByTestId but the DOM uses id="anioConstruccion" (not data-testid).
    // Using css id fallback per style-contract css_fallback_attributes: [id].
    const anioInput = page.locator('#anioConstruccion');
    await expect(anioInput).toBeVisible();
    await anioInput.fill(FIXTURES.anioConstruccion);
    await anioPage.aceptar.click();
    await expect(page).toHaveURL(/\/codigo-postal/);

    // ── PANTALLA 8 (tránsito): Confirmación Código Postal ────────────────────

    const cpConfirmPage = new CodigoPostalConfirmacionPage(page);
    await expect(cpConfirmPage.cDigoPostal).toHaveValue(FIXTURES.codigoPostal);
    await cpConfirmPage.aceptar.click();
    await expect(page).toHaveURL(/\/uso/);

    // ── PANTALLA 9: Ocupación de la vivienda ──────────────────────────────────
    // @criterion RF-005 (fd-mapfre-hogar.md:70-74)
    // Given: El usuario se encuentra en la pantalla con valor por defecto establecido
    // When: Pulsa Aceptar sin modificar
    // Then: Avanza a /sistemas-electronicos

    const ocupacionPage = new OcupacionViviendaPage(page);
    await expect(page.getByRole('heading', { name: 'Ocupación de la vivienda', level: 2 })).toBeVisible();
    await expect(ocupacionPage.habitual).toBeVisible();
    await expect(ocupacionPage.aceptar).toBeVisible();
    await ocupacionPage.aceptar.click();
    await expect(page).toHaveURL(/\/sistemas-electronicos/);

    // ── PANTALLA 10: Sistemas electrónicos de seguridad ───────────────────────
    // @criterion RF-006 (fd-mapfre-hogar.md:76-83)
    // Given: El usuario se encuentra en la pantalla de sistemas electrónicos
    // When: Selecciona una opción de sistema de seguridad
    // Then: Avanza a /sistema-proteccion-domotica

    const sistElecPage = new SistemasElectronicosPage(page);
    await expect(page.getByRole('heading', { level: 2 }).filter({ hasText: 'electrónicos de seguridad' })).toBeVisible();
    await expect(sistElecPage.conContratoDeMantenimientoYConVigilanciaPermanente).toBeVisible();
    await sistElecPage.conContratoDeMantenimientoYConVigilanciaPermanente.click();
    await expect(page).toHaveURL(/\/sistema-proteccion-domotica/);

    // ── PANTALLA 11: Protección domótica ──────────────────────────────────────
    // @criterion RF-007 (fd-mapfre-hogar.md:85-91)
    // Given: El usuario se encuentra en la pantalla '¿Dispones de sistema de protección domótica?'
    // When: Elige 'NO'
    // Then: Avanza a /sistemas-no-electronicos

    const domoticaPage = new ProteccionDomoticaPage(page);
    await expect(domoticaPage.no).toBeVisible();
    await domoticaPage.no.click();
    await expect(page).toHaveURL(/\/sistemas-no-electronicos/);

    // ── PANTALLA 12: Sistemas NO electrónicos ─────────────────────────────────
    // @criterion RF-008 (fd-mapfre-hogar.md:93-97)
    // Given: El usuario se encuentra en la pantalla con valor por defecto (NINGUNO checked)
    // When: Pulsa Aceptar sin modificar checkboxes
    // Then: Avanza a /capital-continente-propietario

    const sistNoElecPage = new SistemasNoElectronicosPage(page);
    await expect(sistNoElecPage.ninguno).toBeChecked();
    await sistNoElecPage.aceptar.click();
    await expect(page).toHaveURL(/\/capital-continente-propietario/);

    // ── PANTALLA 13 (tránsito): Continente ───────────────────────────────────

    const continentePage = new ContinentePage(page);
    await expect(continentePage.aceptar).toBeVisible();
    await continentePage.aceptar.click();
    await expect(page).toHaveURL(/\/capital-contenido/);

    // ── PANTALLA 14 (tránsito): Contenido ────────────────────────────────────

    const contenidoPage = new ContenidoPage(page);
    await expect(contenidoPage.aceptar).toBeVisible();
    await contenidoPage.aceptar.click();
    await expect(page).toHaveURL(/\/documento-identidad/);

    // ── PANTALLA 15: Documento de identidad ───────────────────────────────────
    // @criterion RF-009 (fd-mapfre-hogar.md:99-105)
    // Given: El usuario se encuentra en la pantalla 'Documento de identidad'
    // When: Introduce el DNI sintético de prueba y confirma
    // Then: Avanza a /fecha-nacim

    const dniPage = new DocumentoIdentidadPage(page);
    // POM scaffold element2 is unrefined (getByRole('textbox') without name).
    // Using getByPlaceholder per discovery-report and plan §1.16.
    const dniInput = page.getByPlaceholder('12345678A', { exact: true });
    await expect(dniInput).toBeVisible();
    await dniInput.fill(FIXTURES.dni);
    await expect(dniPage.aceptar).toBeEnabled();
    await dniPage.aceptar.click();
    await expect(page).toHaveURL(/\/fecha-nacim/);

    // ── PANTALLA 16: Fecha de nacimiento — ASSERT TERMINAL ────────────────────
    // @criterion RF-010 (fd-mapfre-hogar.md:107-113)
    // Given: El usuario se encuentra en la pantalla con tres campos separados: día/mes/año
    // When: Introduce día '01', mes '02', año '1990' carácter a carácter (pressSequentially)
    // Then: Los tres campos quedan con su valor. TEST TERMINA AQUÍ — no se pulsa ACEPTAR.
    //
    // ELEMENTO FRÁGIL: los tres textboxes están anidados dentro de un elemento button
    // (ver plan §1.17). POM scaffold no los resuelve; se usa getByPlaceholder por discovery.

    const _fechaPage = new FechaNacimientoPage(page);

    const diaInput = page.getByPlaceholder('dd', { exact: true });
    const mesInput = page.getByPlaceholder('mm', { exact: true });
    const anioInputFecha = page.getByPlaceholder('aaaa');

    await diaInput.pressSequentially(FIXTURES.fechaDia);
    // El foco avanza automáticamente al campo mes tras completar día (SPA behavior)
    await mesInput.pressSequentially(FIXTURES.fechaMes);
    // El foco avanza automáticamente al campo año
    await anioInputFecha.pressSequentially(FIXTURES.fechaAnio);

    // Axe-core A11y check — pantalla terminal (RF-010)
    // Severity threshold: [serious, critical]
    const axeResultsFinal = await new AxeBuilder({ page }).analyze();
    const a11yViolationsFinal = axeResultsFinal.violations.filter(v =>
      ['serious', 'critical'].includes(v.impact ?? '')
    );
    if (a11yViolationsFinal.length > 0) {
      test.info().annotations.push({
        type: 'a11y-warning',
        description: `${a11yViolationsFinal.length} serious/critical violation(s) on final screen: ` +
          a11yViolationsFinal.map(v => v.id).join(', '),
      });
    }

    // Assert terminal: los tres campos contienen su valor introducido
    // Nota: el DOM añade ' /' como separador visual en día y mes (ver plan §1.17 steps 2-3)
    await expect(diaInput).toHaveValue('01 /');
    await expect(mesInput).toHaveValue('02 /');
    await expect(anioInputFecha).toHaveValue(FIXTURES.fechaAnio);
    // No se pulsa ACEPTAR — éste es el criterio de éxito terminal del flujo (RF-010).
  });

});
