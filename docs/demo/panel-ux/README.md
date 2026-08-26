# Maquetas del panel de asistencia QA

Siete ficheros HTML **autocontenidos**: doble clic y se abren. Sin servidor, sin build, sin
dependencia de claude.ai.

**Por qué están aquí.** Se diseñaron como Artifacts en claude.ai y el repo solo guardaba sus URLs.
Un enlace no es una copia: si el Artifact desaparece, queda una URL muerta y nadie sabe qué enseñaba
esa pantalla. Ahora la fuente vive en el repo y las URLs quedan como referencia viva.

## Las pantallas

| Fichero | Qué enseña |
|---|---|
| [`01-grabando.html`](01-grabando.html) | El panel mientras señalas un elemento en la aplicación. Lo grabado sobrevive (D10/D23) y se sella en disco en cada gesto |
| [`02-caso-completo.html`](02-caso-completo.html) | Postura desplegada: los 12 pasos del caso, con resultado esperado **solo en los 6 que llevan un `expect_*`** |
| [`03-discrepancia.html`](03-discrepancia.html) | «El plan dice X · no aparece» + **candidatos acotados** de esa pantalla, y la salida «lo señalo yo» |
| [`04-aprobacion.html`](04-aprobacion.html) | Cambios agrupados **por peso**: recorrido en bloque, resultado esperado uno a uno. Grado de evidencia |
| [`05-posturas.html`](05-posturas.html) | Compacta, fantasma y desplegada, lado a lado |
| [`06-recorrido-guiado.html`](06-recorrido-guiado.html) | Recorrido interactivo, con la muerte y recuperación del panel en vivo. El único con JS |
| [`panel-ux.html`](panel-ux.html) | La primera maqueta clicable, más simple. Anterior a la auditoría |

## Antes de implementar interfaz, lee la auditoría

[`docs/findings/auditoria-maquetas-panel.md`](../../findings/auditoria-maquetas-panel.md) dice **qué
de estas pantallas es viable y qué se retiró por inventado**. Cuatro elementos se cayeron al
comprobarlos contra el código: «Aparece esto» como respuesta (`findVisibleText` devuelve `null`: sabe
que falta, no qué hay en su sitio), el halo verde sobre el botón que el walker busca (pregunta
precisamente porque no lo encuentra), «Añadir paso a mano» (un paso de acción necesita un locator) y
«debería aparecer» en los doce pasos.

Y el plan que las consume: [`docs/tasks/plan-panel-y-acta.md`](../../tasks/plan-panel-y-acta.md),
cuyo §1 son diez decisiones ya cerradas con el QA.

## Nota de alcance

El **marco** del panel está en castellano cableado, sin traducción. El **contenido** es dinámico y su
idioma lo manda la aplicación bajo prueba: un literal no se traduce nunca, porque el test lo va a
buscar tal cual. Un panel en castellano mostrando literales en inglés es correcto.

## Cómo se extrajeron

Fuente autorada, sacada de cada Artifact y envuelta en un esqueleto mínimo (`<!doctype html>` +
`<head>` con charset y viewport). Se descartó el runtime que la plataforma inyecta: ~12 KB de
preámbulo por fichero que aquí no hace nada. Comprobado en los siete: cero residuo de runtime,
doctype válido, cierre correcto.

Única petición externa: la hoja de Google Fonts (IBM Plex Sans). Sin red, el fallback del stack las
deja legibles igual.

## Los Artifacts originales

Siguen vivos y son los mismos:

1. Grabando — https://claude.ai/code/artifact/123dacb3-68c4-4119-bdb9-999b1ded216a
2. Caso completo — https://claude.ai/code/artifact/267e9b32-fe2c-48d2-b05e-88cc2ac3ce0b
3. Discrepancia — https://claude.ai/code/artifact/6e370136-efdc-4f21-9507-19a4ea69b034
4. Aprobación — https://claude.ai/code/artifact/3e8e3836-d9cc-4344-8a2a-1fe493559342
5. Posturas — https://claude.ai/code/artifact/5ab90e14-396c-4f3f-9bef-8f83781dfcb2
6. Recorrido guiado — https://claude.ai/code/artifact/01722b21-89eb-4089-91e9-323dfd3d5708

**Si tocas una maqueta**, decide cuál manda: el fichero de aquí o el Artifact. Hoy el Artifact es el
original y esto es la copia versionada. Editar los dos por separado los hace divergir en silencio —
la familia D2 aplicada a las maquetas.
