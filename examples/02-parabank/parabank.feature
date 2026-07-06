@entry:/parabank/index.htm
Feature: Banca online ParaBank
  Casos de aceptacion del area de cliente de ParaBank, escritos en Gherkin maduro
  (cada Scenario declara su Then). Entrada del modulo S2 (Req-driven) de ia4d-qa-automator.
  Los pasos describen INTENCION del usuario; el DOM real lo aporta el planner en el Acto Mapear.

  @flow:login @REQ-LOGIN
  Scenario: Inicio de sesion con credenciales validas
    Given un cliente registrado no ha iniciado sesion
    When el cliente introduce su usuario y contrasena correctos
    And confirma el acceso
    Then el sistema autentica al cliente y muestra el resumen de cuentas

  @flow:transfer-funds @REQ-TRANSFER
  Scenario Outline: Transferencia de fondos entre cuentas propias
    Given el cliente ha iniciado sesion y dispone de al menos dos cuentas
    When el cliente transfiere <amount> de una cuenta de origen a una cuenta de destino
    And confirma la transferencia
    Then el sistema ejecuta la transferencia y muestra la confirmacion con el importe

    Examples:
      | amount |
      | 1      |
      | 2      |

  @flow:logout @REQ-LOGOUT
  Scenario: Cierre de sesion
    Given el cliente tiene una sesion activa
    When el cliente ejecuta el cierre de sesion
    Then el sistema termina la sesion y devuelve a la pantalla de acceso

  @flow:close-account @REQ-CLOSE @drift-risk:high
  Scenario: Cierre de una cuenta del cliente
    Given el cliente ha iniciado sesion y dispone de una cuenta
    When el cliente solicita el cierre de una de sus cuentas
    Then el sistema cierra la cuenta y deja de mostrarla en el resumen de cuentas
