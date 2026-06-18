# Documento Funcional — Portal HR OrangeHRM

**Proyecto**: OrangeHRM OS — portal de gestión de recursos humanos (instancia demo)
**Versión**: 1.0
**Entorno de pruebas**: https://opensource-demo.orangehrmlive.com/

> Fixture de validación del módulo S3 (Spec-refiner). FD redactado en prosa libre, sin
> identificadores RF-NNN explícitos — el refiner debe estructurarlo él. Entorno demo compartido
> y reseteable periódicamente: los criterios afirman presencia estructural de la UI, nunca valores
> dinámicos exactos (número de empleados, nombres, contadores).

## 1. Introducción y alcance

OrangeHRM es un portal de gestión de personal. Este documento describe el acceso al portal y el
panel principal (dashboard) que el usuario ve tras autenticarse. Quedan fuera de alcance los
módulos funcionales internos (PIM, Leave, Time, Recruitment) más allá de su presencia en la
navegación.

## 2. Acceso al portal

El portal es de acceso restringido. Un usuario debe poder iniciar sesión introduciendo su nombre
de usuario y su contraseña. Tras una autenticación correcta con un usuario válido (Admin /
admin123), el sistema redirige al panel principal y muestra el encabezado "Dashboard".

Cuando el usuario introduce credenciales incorrectas, el sistema debe rechazar el acceso, permanecer
en la pantalla de login y mostrar una alerta de credenciales inválidas. Si el usuario envía el
formulario sin rellenar los campos, el sistema debe mostrar un mensaje de obligatoriedad bajo cada
campo vacío y no redirigir.

## 3. Panel principal

Un usuario autenticado accede a un panel principal. El panel presenta una barra superior con el
encabezado del módulo activo, un panel de navegación lateral con los módulos disponibles del portal
(entre ellos Admin, PIM, Leave y Time), y un área de contenido con widgets de resumen. Desde la barra
superior, el usuario puede abrir un menú de su perfil con las opciones de la cuenta, incluido el
cierre de sesión.
