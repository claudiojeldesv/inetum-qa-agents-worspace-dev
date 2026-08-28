# Diseño Funcional — Portal de RRHH · Consulta del listado de personal

Documento de definición de pruebas. Registro corporativo: pasos simples, un verbo por línea, la
comprobación escrita como la espera el negocio.

---

## CP005 — Consulta del listado de personal

**Objetivo**: verificar que un administrador puede consultar el listado de empleados y lanzar una
búsqueda sobre él.

**Precondiciones**: usuario administrador dado de alta. Existe al menos un empleado registrado.

### Pasos

1. Acceder al portal.
2. Introducir el usuario administrador.
3. Introducir la contraseña.
4. Pulsar el botón de acceso.
5. Entrar en el módulo de personal.
6. Abrir el listado de empleados.
7. Comprobar que se muestra el bloque **Datos del empleado**.
8. Pulsar el botón **Buscar**.
9. Comprobar que se muestra el texto **Registros encontrados**.

### Resultado esperado

El listado de empleados se muestra con los registros que cumplen el filtro, y el sistema indica
cuántos ha encontrado.

---

## Nota para quien ejecute la prueba

Este documento se escribió contra la especificación, no contra la aplicación. Es el caso normal en
un proyecto: funcional lo redacta a partir del análisis, la aplicación evoluciona por su lado, y
nadie sincroniza los dos.

**Tres de las comprobaciones no se van a cumplir, y cada una es de un tipo distinto**:

- Una porque el elemento **existe pero se llama de otra forma** — es un problema de localización, no
  de negocio, y se resuelve señalándolo.
- Dos porque el **resultado que el documento describe no es el que la aplicación muestra** — ahí no
  hay nada que señalar: hay que decidir quién tiene razón.

Distinguir unas de otras, y dejar constancia de por qué, es el ejercicio.
