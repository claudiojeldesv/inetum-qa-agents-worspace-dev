---
description: Entrevista al Ingeniero QA sobre el proyecto y emite su Style Contract. Una vez por proyecto — después, cada run lo lee y no pregunta nada. Reabrible con --revisar.
---

# /ia4d-qa-automator:setup

> **Pre-check (workspace).** Este comando corre DENTRO de un workspace desplegado del agente. Antes de continuar, verifica que en el directorio actual existen `config/allowed-targets.yaml` y `playwright.config.ts`. Si falta alguno, NO sigas: indica al usuario que ejecute `/ia4d-qa-automator:init <carpeta>` y detente.

Convierte una conversación de cinco minutos en el **Style Contract** del proyecto: el fichero
que declara cómo trabaja este cliente y que todos los runs posteriores leen sin volver a
preguntar.

## Por qué existe

El Style Contract es la voz del cliente en el sistema, y hasta ahora se escribía a mano
copiando el de otro proyecto. Eso tiene dos consecuencias medidas: se heredan decisiones que no
son de este cliente, y se declaran cosas que nadie verifica (cuatro proyectos declararon
`getByPlaceholder` y la escalera lo ignoraba en silencio hasta K0.39).

**Y una regla de ritmo**: se entrevista **una vez por proyecto**, no una vez por ejecución. Una
regresión nocturna no puede entrevistar a nadie, y un peaje de preguntas en cada run acaba
contestándose a lo loco. Lo que decidas aquí queda declarado, auditable y reutilizado.

## Uso

```
/ia4d-qa-automator:setup                    # entrevista y emite el contract
/ia4d-qa-automator:setup --revisar          # reabre la entrevista sobre el contract existente
/ia4d-qa-automator:setup --proyecto=<slug>  # nombre del contract (por defecto, se pregunta)
```

## Paso 0 — MIRA QUÉ HAY ANTES DE PREGUNTAR NADA

Antes de la primera pregunta, una llamada:

```
node node_modules/tsx/dist/cli.mjs src/scripts/estado-del-proyecto.ts
```

Devuelve, como hecho y no como impresión: si hay **contract tuyo** (los siete de ejemplo que trae
el workspace NO cuentan — se distinguen por la marca que este mismo command deja al emitir),
qué **material has traído** frente al de los labs, y qué **módulo** sugiere `resolveMode` con eso.

Y actúas según lo que diga:

| `contracts.propios` | Qué haces |
|---|---|
| **vacío** | la entrevista completa. Es el camino normal |
| **uno o más**, y NO viene `--revisar` | **no entrevistas y no te paras en seco**: enséñale lo que ya tiene —proyecto, módulo, gates— y pregúntale **qué quiere hacer**. Si quiere cambiar el contract, `--revisar`. Si quiere trabajar, salta al Cierre y ofrécele lanzar |
| **uno o más**, y SÍ viene `--revisar` | la entrevista, partiendo de lo que ya está declarado |

**Por qué esta tabla y no «existe → para»**: un workspace recién desplegado trae siete contracts de
ejemplo, así que «¿hay contract?» siempre da que sí; y un QA que vuelve al día siguiente no quiere
que le cierren la puerta, quiere que le lleven a lo suyo. Detectar sin encaminar es un callejón.

**No uses el JSON para adivinar la URL ni el nombre del proyecto**: no están ahí, se preguntan.
Y si hay **varios** documentos o Gherkin tuyos, el script deja el comando en `null` a propósito —
**pregunta cuál**, no elijas el primero.

**Y si el workspace trae labs** (`material.de_ejemplo` no vacío), dilo en una línea al empezar: hay
material para aprender y **cada parada tiene su guía escrita**. No obligues al QA a descubrirlas por su
cuenta — medido en el estreno: el QA lanzó el setup y su primera pregunta fue «¿qué guía sigo?».

## Protocolo de la entrevista

**Todas las preguntas son funcionales.** Ninguna pide al QA que sepa qué es un locator, un rol
ARIA o un peldaño. Si una respuesta no permite decidir, se pregunta de nuevo en lenguaje de
negocio; **nunca se rellena por defecto sin decirlo**.

Usa la herramienta de preguntas del harness (opciones cerradas, con recomendación marcada), en
bloques pequeños. Entre bloque y bloque, **resume en una línea lo que has entendido**.

### Bloque 1 — qué hay de entrada

1. *¿Qué tienes para empezar?* — un documento funcional en markdown/Word · un `.feature` Gherkin ·
   solo la URL de la aplicación · el repositorio del frontend.
2. *¿Cuál es la URL del entorno de pruebas?*

Con esto queda determinado el **módulo** (S3 / S2 / S4 / S1) y, de ahí, el papel del walker.
**No preguntes por el papel del walker**: se deriva, no se elige. Dilo en el resumen:

- Con documento funcional o Gherkin hay un guion que ejecutar → **el walker es el motor**, y el
  LLM solo entra si la escalera se planta.
- Con solo la URL no hay nada que ejecutar → **descubre el LLM y el walker verifica después**.
- Con el repositorio → S1 no está implementado; dilo y ofrece seguir por otro módulo.

### Bloque 2 — cuánta ayuda se autoriza

3. *Si el walker no encuentra un elemento, ¿qué prefieres?* — que se pare y te lo pregunte a ti
   (gratis) · que intente resolverlo solo con ayuda de IA, con un presupuesto · las dos cosas,
   primero tú y la IA como último recurso.
4. *¿Va a haber alguien delante mientras corre?* — sí, es una sesión de trabajo · no, esto corre
   desatendido en integración continua.

La cuarta decide `walker.assist`: **en desatendido el panel no puede abrirse**, porque nadie va a
señalar nada con el ratón y el run se quedaría esperando a que expire.

### Bloque 3 — el sector y sus obligaciones

5. *¿En qué sector opera esta aplicación?* — banca · seguros · sector público · otro.
6. *¿Hay que dejar evidencia de accesibilidad?* — sí, y debe bloquear si falla · sí, pero solo
   informar · no aplica.

Si el sector es banca, seguros o público, **dilo explícitamente**: el gate de accesibilidad y la
evidencia completa dejan de ser opcionales en la práctica (EAA 2025), y conviene que la decisión
sea consciente y no un default heredado.

### Bloque 4 — datos y acceso

7. *¿La aplicación pide login?* Si sí: *¿tienes credenciales de prueba que puedas darme?*
8. Recuérdale, sin preguntar, que **solo entran datos sintéticos**: nunca un usuario real, nunca
   un DNI o un IBAN de producción. Si el QA ofrece datos que parecen reales, **párate y dilo**.

### Bloque 5 — convenciones del cliente

9. *¿Los tests los va a leer alguien de negocio?* → decide `naming.language` y el patrón de
   títulos.
10. *¿El equipo ya tiene una convención de nombres para los ficheros de test?* Si la tiene, que
    la pegue tal cual; si no, se propone la del agente y **se deja anotado que es del agente**.

## Qué emites

Un fichero en `config/style-contracts/<proyecto>.yaml` con **solo lo que se ha decidido en la
entrevista**. Nada de bloques copiados «por si acaso»: un contract con opciones que nadie
eligió es exactamente el problema que este comando viene a resolver.

Cada valor que no salga de una respuesta directa lleva un comentario diciendo de dónde sale:

```yaml
# Emitido por /ia4d-qa-automator:setup el <fecha>, a partir de la entrevista con el QA.
# Las líneas marcadas DEFAULT no se preguntaron: son el criterio del agente y se pueden cambiar.
version: 1
project: <slug>

walker:
  enabled: true
  rescue_budget: 0      # el QA prefiere que se pare y preguntar él
  assist: true          # hay alguien delante

locators:
  priority:             # DEFAULT — vocabulario del kernel, sin conocimiento aún de este stack
    - getByTestId
    - getByRole
    - getByLabel
    - getByPlaceholder
    - getByText
```

**Deliberadamente NO se pregunta por el bloque `settle`** (las señales de «ocupado» del stack).
Eso no lo sabe un QA funcional el primer día, y declararlo a ciegas sesga la primera medición:
se descubre corriendo, y se añade después con dato. Dilo así en el resumen final.

## Cierre

1. Escribe el fichero, **con esta primera línea**:

   ```yaml
   # emitido por ia4d-qa-automator:setup el AAAA-MM-DD
   ```

   Es un comentario, así que no toca el schema ni lo ve el validador. Sirve para que el Paso 0 de
   la próxima vez sepa que este contract es del QA y no uno de los de ejemplo. **Sin esa línea, la
   puerta no te reconocerá mañana.**

2. Ejecuta la validación determinística:

   ```
   node node_modules/tsx/dist/cli.mjs src/contract-validator.ts config/style-contracts/<proyecto>.yaml
   ```

   **No es opcional**: es lo que impide emitir un contract con un campo mal escrito que luego se
   ignora en silencio. Además imprime el **estado efectivo de la sesión** —qué gates están on/off y
   de dónde sale cada decisión—; enséñaselo, es la mitad del valor.

3. Si la validación devuelve avisos, **corrígelos con el QA, no por tu cuenta** — cada aviso es
   una decisión suya que quedó incoherente.

4. Resume en cinco líneas: módulo, papel del walker, presupuesto de rescate, gates encendidos, y
   qué has puesto por defecto sin preguntar.

5. **OFRÉCETE A LANZARLO.** No termines nombrando un comando para que lo copie: dile cuál toca
   según el módulo y **pregúntale si lo lanzas ahora**, con los argumentos ya rellenos con lo que
   acaba de contarte.

   | Módulo | Lo que ofreces |
   |---|---|
   | S3 | `/ia4d-qa-automator:spec-refiner --fd=<su documento> --url=<su URL> --style=<su contract>` |
   | S2 | `/ia4d-qa-automator:req-driven --gherkin=<su .feature> --url=<su URL> --style=<su contract>` |
   | S4 | `/ia4d-qa-automator:autonomous --url=<su URL> --flows=<los módulos que nombró> --style=<su contract>` |
   | S1 | no está implementado: dilo y ofrece otra puerta |

   Si dice que sí, **invócalo**. Si dice que no, deja el comando escrito y termina.

6. **DI QUÉ LEER EN ESA PARADA.** Junto al comando, nombra la guía del lab que la explica — con su ruta
   completa, para que se pueda abrir sin buscar. Si el workspace no trae labs, di que no hay guía y
   sáltate este paso; **nunca inventes una ruta**.

   | Módulo o parada | Guía |
   |---|---|
   | la propia entrevista | `examples/06-restful-booker/guias/01-setup.md` |
   | S4 autónomo | `examples/06-restful-booker/guias/02-autonomous.md` |
   | S3 spec-refiner | `examples/06-restful-booker/guias/03-spec-refiner.md` |
   | S2 req-driven | `examples/06-restful-booker/guias/04-req-driven.md` |
   | regresión con panel (la resuelve el QA) | `examples/06-restful-booker/guias/05-panel.md` |
   | regresión con rescate de IA | `examples/06-restful-booker/guias/06-rescate.md` |

   Y ofrécete a leerla y conducirla tú, que es más útil que dejarle un fichero abierto: el QA no tiene
   por qué leerse una guía para que la herramienta funcione.

   **Esto es lo que convierte el setup en una puerta y no en un formulario.** Lo que falta para
   trabajar después de la entrevista es una sola pregunta, y hacerla cuesta menos que obligar al QA
   a leerse la ayuda para saber qué escribir.

## Límites

- No toca el navegador ni invoca subagents. Solo conversa y escribe un fichero.
- No inventa credenciales, URLs ni convenciones. Lo que no se ha dicho, se marca DEFAULT.
- No decide el papel del walker: lo deriva del módulo y lo declara.
- Un contract ya existente **no se sobrescribe sin `--revisar`**. Sin esa bandera NO se para en seco:
  se enseña lo que hay y se pregunta qué quiere hacer (Paso 0).
- Ofrecer lanzar el comando siguiente SÍ entra; **entrevistar en cada run, no**. La entrevista es una
  vez por proyecto: una regresión nocturna no puede contestar preguntas.
