# Guía 01 — el setup: la entrevista que emite tu Style Contract

**Qué vas a ver**: el agente te entrevista sobre el proyecto —cómo llamáis a los tests, qué locators
preferís, si hay login, qué datos sintéticos usáis— y con tus respuestas **emite un fichero**: el Style
Contract. A partir de ahí, cada run lo lee y **no vuelve a preguntar nada**.

**Por qué es la primera guía**: todo lo demás lo usa. El autónomo, el refiner, el req-driven y el walker
leen ese contrato para saber cómo escribir y qué exigir.

## El contrato ya está aquí, y ése es el truco de esta guía

El lab trae `config/style-contracts/restful-booker.yaml` ya escrito. Vas a **hacer la entrevista de
todos modos** y comparar tu resultado con él. Comparar es donde se aprende: ver por qué alguien
respondió lo que respondió.

## Paso 1 — mira el contrato que viene hecho

```powershell
cd C:\Users\USUARIO\qa\rbp-lab
```

```powershell
npx.cmd tsx src/contract-validator.ts config/style-contracts/restful-booker.yaml
```

Debe imprimir esto (verificado el 2026-09-04):

```
═══ Contract: restful-booker.yaml — OK ═══
  ✓ sin problemas: campos, enums, tipos y coherencia correctos

─── Estado efectivo de la sesión ───
  [env]       gate: PII scanner: off  — QA_ENABLE_PII
  [env]       gate: Judge: off  — QA_ENABLE_JUDGE
  [contract]  gate: a11y (fail_on_violations): off (warning)
  [default]   healing (post-proceso): off (reporta rojos y termina)
  [default]   settle (ventana de quietud): 400 ms de quietud, tope 10000 ms
  [default]   evidence.level: steps
  [contract]  auth: enabled (setup project + storageState)
  [contract]  locators (primera prioridad): getByRole
```

**Lee la segunda mitad con atención**: no es el contrato, es **la configuración efectiva de tu sesión**.
Dice qué gates están encendidos y **de dónde sale cada decisión** — `[env]`, `[contract]` o `[default]`.
Cuando alguien pregunte «¿por qué no me falla el gate de accesibilidad?», la respuesta está en esta
lista, no en el código.

## Paso 2 — haz la entrevista tú

En Claude Code, dentro del workspace:

```
/ia4d-qa-automator:setup
```

Te preguntará por las convenciones de tu proyecto: nombres, patrón de objetos de página, prioridad de
locators, autenticación, datos sintéticos, nivel de evidencia. Responde **como si fuera tu proyecto**,
no intentando adivinar lo que dice el fichero de arriba.

Al terminar emite tu contrato y lo pasa por el mismo validador. Si algo no cuadra, te lo dice **antes**
de darlo por bueno: esa validación es determinística, no una opinión del modelo.

**Y no acaba ahí.** Con el contrato escrito, el setup sabe qué puerta te toca —lo dedujo de tu primera
respuesta— y **se ofrece a lanzarla**, con los argumentos ya rellenos. Di que sí y estarás dentro del
run sin haber copiado ni un comando. Ésa es la diferencia entre una puerta y un formulario.

**Si vuelves mañana**, el setup lo primero que hace es mirar: detecta que ese contrato es tuyo —lo
distingue de los siete de ejemplo que trae el workspace por una marca que él mismo dejó— y en vez de
repetirte la entrevista te pregunta qué quieres hacer.

## Paso 3 — compara

Abre los dos y mira las diferencias. Las que importan:

- **prioridad de locators**: el del lab pone `getByRole` primero, pero deja
  `getByPlaceholder` alto **a propósito** — los formularios públicos de este sitio no tienen etiquetas,
  sólo textos de ayuda. Es un ejemplo de contrato que se ajusta a la aplicación real y no al ideal.
- **auth**: este sitio tiene cara pública sin login y panel de administración con login, así que el
  contrato declara autenticación con estado guardado. Si tu proyecto no la tiene, el tuyo dirá otra cosa.
- **gates**: casi todos vienen apagados. No es dejadez, es la regla del producto — las piezas están
  completas y se encienden cuando el cliente las necesita.

**Las diferencias son de preferencia, no de esquema.** Si el tuyo valida, es correcto aunque no se
parezca al del lab.

## Si quieres cambiar algo después

```
/ia4d-qa-automator:setup --revisar
```

Reabre la entrevista sobre el contrato existente en vez de empezar de cero.

## Qué mirar con lupa

| Señal | Qué significa si falla |
|---|---|
| El validador dice **OK** y lista el estado efectivo | si sólo dice OK, no estás viendo de dónde sale cada gate |
| Cada línea del estado lleva su **origen** (`[env]`/`[contract]`/`[default]`) | sin origen no puedes explicar por qué un gate está como está |
| Tu contrato **valida** al terminar la entrevista | si el agente lo da por bueno sin validarlo, la regla #5 no se está aplicando |
