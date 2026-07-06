@entry:/
Feature: Tienda online SauceDemo (cobertura ampliada)
  Casos de aceptacion del e-commerce de practica SauceDemo, escritos en Gherkin maduro
  (cada Scenario declara su Then). Espejo 1:1 del FD specs/saucedemo-fd-25casos.md: 25
  Scenarios en el mismo orden (acceso, catalogo, ordenacion, carrito, pago, sesion).
  Entrada del modulo S2 (Req-driven) de ia4d-qa-automator. Los pasos describen INTENCION
  del usuario; el DOM real lo aporta el planner en el Acto Mapear. Credenciales publicas
  no-PII declaradas en config/allowed-targets.yaml y en synthetic_fixtures del style-contract.

  # --- Acceso a la tienda ---

  @flow:login @REQ-001
  Scenario: Inicio de sesion con credenciales validas
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario standard_user y la contrasena secret_sauce
    And confirma el acceso
    Then el sistema autentica al usuario y muestra el listado de productos

  @flow:login-locked @REQ-002
  Scenario: Inicio de sesion rechazado para un usuario bloqueado
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario locked_out_user y la contrasena secret_sauce
    And confirma el acceso
    Then el sistema rechaza el acceso y muestra el mensaje de error de usuario bloqueado

  @flow:login-invalid @REQ-003
  Scenario: Inicio de sesion rechazado para credenciales inexistentes
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario invalid_user y la contrasena wrong_password
    And confirma el acceso
    Then el sistema rechaza el acceso y muestra el mensaje de error de credenciales que no coinciden

  @flow:login-missing-user @REQ-004
  Scenario: Inicio de sesion sin nombre de usuario
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario deja vacio el nombre de usuario e introduce la contrasena secret_sauce
    And confirma el acceso
    Then el sistema impide el acceso y muestra el mensaje de error de nombre de usuario obligatorio

  @flow:login-missing-password @REQ-005
  Scenario: Inicio de sesion sin contrasena
    Given un usuario no ha iniciado sesion en la tienda
    When el usuario introduce el usuario standard_user y deja vacia la contrasena
    And confirma el acceso
    Then el sistema impide el acceso y muestra el mensaje de error de contrasena obligatoria

  # --- Catalogo de productos ---

  @flow:catalogo @REQ-006
  Scenario: El listado muestra el catalogo completo
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario observa el listado
    Then el sistema muestra los seis productos del catalogo

  @flow:catalogo @REQ-007
  Scenario: Cada producto presenta sus datos basicos
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario observa un producto del listado
    Then el sistema muestra el nombre, el precio y la imagen de ese producto

  @flow:detalle-producto @REQ-008
  Scenario: Apertura de la ficha de detalle de un producto
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario selecciona el nombre de un producto
    Then el sistema muestra la ficha de detalle con la descripcion y el precio del producto

  @flow:detalle-producto @REQ-009
  Scenario: Retorno al listado desde la ficha de detalle
    Given el usuario esta en la ficha de detalle de un producto
    When el usuario elige volver al catalogo
    Then el sistema muestra de nuevo el listado de productos

  # --- Ordenacion del listado ---

  @flow:ordenacion @REQ-010
  Scenario: Ordenacion por nombre de la A a la Z
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario selecciona la ordenacion por nombre de la A a la Z
    Then el sistema presenta los productos ordenados alfabeticamente de forma ascendente

  @flow:ordenacion @REQ-011
  Scenario: Ordenacion por nombre de la Z a la A
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario selecciona la ordenacion por nombre de la Z a la A
    Then el sistema presenta los productos ordenados alfabeticamente de forma descendente

  @flow:ordenacion @REQ-012
  Scenario: Ordenacion por precio de menor a mayor
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario selecciona la ordenacion por precio de menor a mayor
    Then el sistema presenta los productos ordenados por precio de forma ascendente

  @flow:ordenacion @REQ-013
  Scenario: Ordenacion por precio de mayor a menor
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario selecciona la ordenacion por precio de mayor a menor
    Then el sistema presenta los productos ordenados por precio de forma descendente

  # --- Gestion del carrito ---

  @flow:carrito @REQ-014
  Scenario: Anadir un producto al carrito
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario anade un producto al carrito desde el listado
    Then el indicador del carrito refleja una unidad

  @flow:carrito @REQ-015
  Scenario: Anadir varios productos al carrito
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario anade dos productos distintos al carrito desde el listado
    Then el indicador del carrito refleja el numero total de productos anadidos

  @flow:carrito @REQ-016
  Scenario: El boton de un producto anadido ofrece quitarlo
    Given el usuario ha iniciado sesion y esta en el listado de productos
    When el usuario anade un producto al carrito desde el listado
    Then el boton de ese producto cambia para ofrecer la accion de quitarlo del carrito

  @flow:carrito @REQ-017
  Scenario: Quitar un producto del carrito desde el listado
    Given el usuario ha anadido un producto al carrito desde el listado
    When el usuario quita ese producto desde el listado
    Then el indicador del carrito decrementa en consecuencia

  @flow:carrito @REQ-018
  Scenario: El carrito muestra los productos anadidos
    Given el usuario ha anadido un producto al carrito
    When el usuario abre el carrito
    Then el sistema muestra la relacion de los productos anadidos

  @flow:carrito @REQ-019
  Scenario: Seguir comprando desde el carrito
    Given el usuario esta en el carrito
    When el usuario elige seguir comprando
    Then el sistema devuelve al usuario al listado de productos

  @flow:carrito @REQ-020
  Scenario: El contenido del carrito persiste al navegar
    Given el usuario ha anadido un producto al carrito
    When el usuario navega del listado al carrito y de vuelta al listado
    Then el contenido del carrito se mantiene durante la sesion

  # --- Proceso de pago ---

  @flow:checkout @REQ-021
  Scenario: Avance al resumen del pedido con datos validos
    Given el usuario ha anadido un producto y esta en el carrito
    When el usuario inicia el pago e introduce nombre, apellido y codigo postal validos
    And continua el pago
    Then el sistema avanza a la pantalla de revision del pedido

  @flow:checkout-invalid @REQ-022
  Scenario: Pago rechazado sin el nombre
    Given el usuario ha anadido un producto y ha iniciado el pago
    When el usuario continua el pago sin introducir el nombre
    Then el sistema impide el avance y muestra el mensaje de error de nombre obligatorio

  @flow:checkout @REQ-023
  Scenario: La revision muestra el resumen economico del pedido
    Given el usuario ha introducido sus datos de envio y esta en la revision del pedido
    When el usuario observa la pantalla de revision
    Then el sistema muestra el resumen de productos, el subtotal, el impuesto y el total

  @flow:checkout @REQ-024
  Scenario: Confirmacion del pedido
    Given el usuario esta en la pantalla de revision del pedido
    When el usuario confirma el pedido
    Then el sistema completa la compra y muestra la confirmacion de pedido realizado

  # --- Cierre de sesion ---

  @flow:logout @REQ-025
  Scenario: Cierre de sesion desde el menu
    Given el usuario ha iniciado sesion en la tienda
    When el usuario cierra la sesion desde el menu de la aplicacion
    Then el sistema devuelve al usuario a la pantalla de inicio de sesion
