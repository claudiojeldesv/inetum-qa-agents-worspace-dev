# Guía 04 — S2: el Gherkin y la URL

**Qué vas a ver**: la misma aplicación entrando por la puerta de los requisitos. Le das un `.feature`
maduro —escenarios escritos, con su Then— y la URL, y el agente genera los tests **respetando la
numeración de tus requisitos** y detectando lo que el `.feature` pide y la aplicación no da.

**La diferencia con S3**: el FD es prosa libre y hay que interpretarlo; un Gherkin maduro ya está
estructurado. Por eso aquí **el parser es determinista**: cada `Scenario` es un criterio, y no hay
interpretación de por medio.

## El material

[`../reservas.feature`](../reservas.feature): cuatro escenarios sacados de casos del FD, con la etiqueta
`@TC-CPxxx` apuntando al caso de origen. Uno de ellos es un **Scenario Outline** con su tabla de
ejemplos, para que veas la parameterización.

**Fíjate en las etiquetas.** El mismo `CP004` que la guía 03 saca del FD aparece aquí como
`@TC-CP004`. Ésa es la trazabilidad cruzando las puertas: el mismo caso de negocio, dos entradas
distintas, y en los dos sitios se puede seguir el hilo hasta el documento original.

## El comando

```
/ia4d-qa-automator:req-driven --gherkin=examples/06-restful-booker/reservas.feature --url=https://automationintesting.online/ --style=config/style-contracts/restful-booker.yaml
```

**Es `--gherkin=`, no `--feature=`.** Con `--feature` el resolutor de módulo no reconoce la entrada y
cae a S4 sin avisarte de nada: acabarías en la puerta autónoma creyendo estar en la de requisitos.
Comprobado el 2026-09-04:

```
--gherkin=... → { "module": "S2", "next_action": "proceed with S2 (req-driven, Gherkin)" }
--feature=... → { "module": "S4", "next_action": "proceed with S4 (autonomous)" }
```

## Lo que hace el parser, antes de tocar el navegador

Cada `Scenario` se convierte en un criterio `RF-NNN` correlativo, conservando **tu** identificador en la
referencia de origen. Del `.feature` del lab sale esto (verificado el 2026-09-04):

```
RF-001 | contacto-envio          | reservas.feature:14 (TC-CP004)
RF-002 | contacto-validaciones   | reservas.feature:22 (TC-CP005)   + tabla de ejemplos
RF-003 | acceso-admin            | reservas.feature:34 (TC-CP006)
RF-004 | reserva-individual      | reservas.feature:40 (TC-CP001)
```

Dos cosas que merecen atención:

- **`reservas.feature:14`**: el criterio sabe de qué línea salió, igual que en S3 sabía de qué línea del
  FD. La trazabilidad no depende de la puerta.
- **`(TC-CP004)`**: tu identificador sobrevive. El agente numera para su uso interno, pero **no borra
  el tuyo** — si tu gestor de pruebas habla de CP004, los tests siguen hablando de CP004.

El Scenario Outline de `RF-002` conserva su tabla como bloque de ejemplos, para que el test se
parameterice en vez de duplicarse tres veces.

## Al terminar

Los tests en `tests/e2e/restful-booker/`, cada uno citando su `RF-NNN`, más el informe de drift: los
requisitos que el `.feature` declara y la aplicación no cumple.

**Mira el `RF-004`** (la reserva individual). Depende de que exista la tarjeta de una habitación
concreta en la portada, y esta demo es compartida: el catálogo lo cambia cualquiera. Si ese test sale
rojo, antes de tocarlo comprueba si la habitación está. **Distinguir un test roto de un dato que falta
es trabajo de QA**, y este lab te da la ocasión de practicarlo con un caso real.

## Compáralo con la guía 03

Mismo `CP004`, dos puertas:

| | S3 (guía 03) | S2 (esta) |
|---|---|---|
| Entrada | prosa libre del FD | escenarios ya estructurados |
| Extracción | conversor determinista del markdown | parser determinista del Gherkin |
| Lo que no está claro | sale como **pregunta de refinamiento** | no aplica: el Gherkin ya lo declara |
| Identificador | `CP004` con su línea del FD | `RF-001` **y** tu `TC-CP004` |

**Si tu equipo ya escribe Gherkin maduro, ésta es tu puerta.** Si lo que tienes es un documento
funcional en prosa, la 03. Si no tienes ninguna de las dos cosas, la 02.

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| El módulo resuelto es **S2**, no S4 | usaste `--feature` en vez de `--gherkin` |
| Cada criterio conserva tu `TC-CPxxx` | si sólo hay `RF-NNN`, perdiste el hilo con tu gestor de pruebas |
| El Scenario Outline sale **parameterizado**, no triplicado | si se triplica, la tabla de ejemplos no se está usando |
| Hay informe de drift | sin él no sabes qué requisitos no cubre la aplicación |
