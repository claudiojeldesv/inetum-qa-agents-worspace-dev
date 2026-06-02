# Ejemplos

Dos targets públicos ya permitidos en `config/allowed-targets.yaml`, listos para practicar.
Solo traen **inputs** — los tests los genera el agente cuando ejecutas el command. Así
practicas el flujo real, no copias un resultado.

| Ejemplo | Modo(s) | Qué demuestra |
|---|---|---|
| [saucedemo/](saucedemo/) | S4 (autónomo) | Generación desde solo-URL. El "hola mundo". |
| [parabank/](parabank/) | S2, S3, S4 | Las tres puertas al mismo motor: Gherkin (S2), FD en prosa (S3), solo-URL (S4). Auth + estado + drift. |

Empieza por SauceDemo si es tu primera vez. ParaBank muestra el alcance completo.

Para apuntar a **tu propia web**: añade su patrón URL (entorno NO productivo) a
`config/allowed-targets.yaml` y lanza `/qa-automator:autonomous --url=<tu-url>`. No hay más setup.
