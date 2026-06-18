@entry:/web/index.php/auth/login
Feature: Portal HR OrangeHRM
  Casos de aceptacion del acceso y el panel principal de OrangeHRM OS, escritos en Gherkin
  maduro (cada Scenario declara su Then, incluidos los negativos). Entrada del modulo S2
  (Req-driven) de ia4d-qa-automator. Los pasos describen INTENCION del usuario; el DOM real
  lo aporta el planner en el Acto Mapear. Credenciales publicas no-PII (Admin / admin123)
  declaradas en config/allowed-targets.yaml y en synthetic_fixtures del style-contract.
  Entorno demo compartido y reseteable: assertar señales de UI, nunca datos persistentes exactos.

  @flow:login @REQ-LOGIN
  Scenario: Inicio de sesion con credenciales validas
    Given un usuario no ha iniciado sesion en el portal
    When el usuario introduce el usuario Admin y la contrasena admin123
    And confirma el acceso
    Then el sistema autentica al usuario y muestra el panel principal con el encabezado Dashboard

  @flow:login-invalid @REQ-LOGIN-INVALID
  Scenario: Inicio de sesion rechazado con credenciales invalidas
    Given un usuario no ha iniciado sesion en el portal
    When el usuario introduce un usuario y una contrasena incorrectos
    And confirma el acceso
    Then el sistema rechaza el acceso y muestra una alerta de credenciales invalidas sin redirigir

  @flow:login-required @REQ-LOGIN-REQUIRED
  Scenario: Validacion de campos obligatorios al enviar el formulario vacio
    Given un usuario esta en la pantalla de acceso sin mensajes de validacion
    When el usuario confirma el acceso sin rellenar usuario ni contrasena
    Then el sistema muestra el mensaje Required bajo ambos campos y no redirige

  @flow:dashboard @REQ-DASHBOARD
  Scenario: El panel principal muestra la navegacion lateral tras el acceso
    Given el usuario ha iniciado sesion en el portal
    When el usuario observa el panel principal
    Then el sistema muestra el panel de navegacion lateral con los modulos Admin, PIM, Leave y Time
