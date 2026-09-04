@entry:/
Feature: Portal de reservas Shady Meadows B&B
  Recorte en Gherkin del Diseno Funcional restful-booker-fd.md, para la puerta S2
  (Req-driven) de ia4d-qa-automator. Cuatro escenarios de los diez casos del FD:
  los mismos flujos, con la etiqueta @TC-CPxxx apuntando al caso del FD para que la
  trazabilidad se vea CRUZAR las puertas (el mismo CP004 sale por S2, por S3 y en la
  linea del panel del walker).

  Los pasos describen INTENCION del visitante; el DOM real lo aporta el planner en el
  Acto Mapear. Datos sinteticos del FD: huesped Ana Prueba. Credenciales del
  administrador en synthetic_fixtures del style-contract, nunca inline.

  @flow:contacto-envio @TC-CP004
  Scenario: Un visitante envia un mensaje al hotel desde el formulario de contacto
    Given un visitante esta en el portal publico del hotel
    When el visitante abre la seccion de contacto
    And rellena su nombre, correo, telefono, asunto y mensaje
    And envia el formulario
    Then el sistema confirma la recepcion citando el nombre del remitente

  @flow:contacto-validaciones @TC-CP005
  Scenario Outline: El formulario de contacto informa de cada campo obligatorio que falta
    Given un visitante esta en la seccion de contacto del portal
    When el visitante envia el formulario sin rellenar ningun campo
    Then el sistema no envia el mensaje e informa de que <campo> es obligatorio

    Examples:
      | campo   |
      | Name    |
      | Subject |
      | Message |

  @flow:acceso-admin @TC-CP006
  Scenario: El administrador accede al panel de gestion del hotel
    Given un administrador con credenciales validas esta fuera de sesion
    When el administrador se identifica en la pantalla de acceso
    Then el sistema abre el panel de gestion con el listado de habitaciones

  @flow:reserva-individual @TC-CP001
  Scenario: Un huesped reserva la habitacion individual y recibe la confirmacion
    Given un visitante esta en el portal publico del hotel
    When el visitante consulta la disponibilidad de una estancia de dos noches
    And elige la habitacion individual
    And facilita sus datos de contacto y confirma la reserva
    Then el sistema confirma la reserva y muestra las fechas de la estancia
