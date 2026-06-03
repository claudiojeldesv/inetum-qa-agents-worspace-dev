# Ejemplos

Dos targets públicos ya permitidos en `config/allowed-targets.yaml`, listos para practicar.
Solo traen **inputs** — los tests los genera el agente cuando ejecutas el command. Así
practicas el flujo real, no copias un resultado.

| Ejemplo | Modo(s) | Qué demuestra |
|---|---|---|
| [saucedemo/](saucedemo/) | S2, S3, S4 | Las tres puertas sobre e-commerce limpio: 3 casos (login, login bloqueado, checkout), todo verde, sin auth ni drift. |
| [parabank/](parabank/) | S2, S3, S4 | Las tres puertas sobre banca demo: auth + estado de sesión + drift bidireccional + ambigüedad deliberada. El alcance completo. |

Empieza por SauceDemo si es tu primera vez: las mismas tres puertas sin la complejidad de auth ni
drift. ParaBank añade sesión persistente, detección de drift y refinamiento de ambigüedad.

Para apuntar a **tu propia web**: añade su patrón URL (entorno NO productivo) a
`config/allowed-targets.yaml` y lanza `/qa-automator:autonomous --url=<tu-url>`. No hay más setup.
