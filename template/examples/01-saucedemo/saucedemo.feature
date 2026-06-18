@entry:/
Feature: Tienda online SauceDemo
  Casos de aceptacion del e-commerce de practica SauceDemo, escritos en Gherkin maduro
  (cada Scenario declara su Then, incluido el caso negativo). Entrada del modulo S2
  (Req-driven) de ia4d-qa-automator. Los pasos describen INTENCION del usuario; el DOM
  real lo aporta el planner en el Acto Mapear. Credenciales publicas no-PII declaradas en
  config/allowed-targets.yaml y en synthetic_fixtures del style-contract.

  @flow:login @REQ-LOGIN
  Scenario: Inicio de sesion con credenciales validas
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario standard_user y la contrasena secret_sauce
    And confirma el acceso
    Then el sistema autentica al usuario y muestra el listado de productos

  @flow:login-locked @REQ-LOGIN-LOCKED
  Scenario: Inicio de sesion rechazado para un usuario bloqueado
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario locked_out_user y la contrasena secret_sauce
    And confirma el acceso
    Then el sistema rechaza el acceso y muestra el mensaje de error de usuario bloqueado

  @flow:checkout @REQ-CHECKOUT
  Scenario: Compra de un producto hasta la confirmacion del pedido
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario anade un producto al carrito
    And abre el carrito y continua al checkout
    And introduce sus datos de envio y confirma la compra
    Then el sistema completa el pedido y muestra la confirmacion de pedido realizado
