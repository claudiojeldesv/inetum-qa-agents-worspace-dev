# Diseño Funcional — Portal de RRHH · Consulta de permisos

Documento de definición de pruebas. Registro corporativo: pasos simples, un verbo por línea,
la comprobación escrita como la espera el negocio.

---

## CP004 — Consulta del listado de permisos

**Objetivo**: verificar que un administrador puede consultar el listado de permisos del personal.

**Precondiciones**: usuario administrador dado de alta. Existe al menos una solicitud de permiso
registrada y aprobada.

### Pasos

1. Acceder al portal.
2. Introducir el usuario administrador.
3. Introducir la contraseña.
4. Pulsar el botón de acceso.
5. Entrar en el módulo de personal.
6. Abrir el listado de empleados.
7. Comprobar que se muestra el bloque **Datos del empleado**.
8. Entrar en el módulo de permisos.
9. Pulsar el botón de búsqueda.
10. Comprobar que se muestra el texto **Registros encontrados**.
11. Comprobar que se muestra el mensaje **Solicitud aprobada correctamente**.

### Resultado esperado

El listado de permisos se muestra con los registros del periodo consultado y el estado de cada
solicitud.

---

## Nota para quien ejecute la prueba

Este documento se escribió contra la especificación, no contra la aplicación. Es el caso normal en
un proyecto: el FD lo redacta funcional a partir del análisis, y la aplicación evoluciona por su
lado. Las discrepancias que encuentres son el material de trabajo, no un error del documento.

**Tres de las comprobaciones no se van a cumplir**, y cada una por un motivo distinto. Decidir cuál
de las tres es un defecto de la aplicación y cuál es un criterio mal escrito **es el ejercicio**.
