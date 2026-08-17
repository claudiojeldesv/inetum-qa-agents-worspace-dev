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

1. Escribe el fichero.
2. Ejecuta la validación determinística: `npx tsx src/scripts/check-contract.ts` o, si no existe
   ese atajo, `/ia4d-qa-automator:config --style=<proyecto>.yaml`. **La validación no es
   opcional**: es lo que impide emitir un contract con un campo mal escrito que luego se ignora
   en silencio.
3. Si la validación devuelve avisos, **corrígelos con el QA, no por tu cuenta** — cada aviso es
   una decisión suya que quedó incoherente.
4. Resume en cinco líneas: módulo, papel del walker, presupuesto de rescate, gates encendidos, y
   qué has puesto por defecto sin preguntar.
5. Di cuál es el siguiente comando según el módulo (`spec-refiner`, `req-driven` o `autonomous`).

## Límites

- No toca el navegador ni invoca subagents. Solo conversa y escribe un fichero.
- No inventa credenciales, URLs ni convenciones. Lo que no se ha dicho, se marca DEFAULT.
- No decide el papel del walker: lo deriva del módulo y lo declara.
- Un contract ya existente **no se sobrescribe sin `--revisar`**; sin esa bandera, avisa y para.
