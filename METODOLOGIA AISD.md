Del Diseño Funcional
al Primer MVP
Metodología paso a paso para equipos de desarrollo
Inetum  ·  IA4D  ·  2025
Las 10 Fases del Proceso
01 Recepción y Comprensión del Documento Funcional
03 Definición del Alcance del MVP
05 Configuración del Entorno de Desarrollo
07 Testing
09 Despliegue en Entorno de Pruebas
02 Análisis Técnico
04 Diseño Técnico y Arquitectura
06 Desarrollo Iterativo
08 Revisión y Validación Funcional
10 Entrega del MVP
A continuación, el detalle de cada fase →
01 Recepción y Comprensión del Documento 
Funcional
Fase 01 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Lectura completa del documento
Leer el DF de principio a fin sin saltar secciones. Anotar dudas y puntos críticos. 1 Análisis automático del DF
ia4d-doc-generatorprocesa el documento y extrae entidades, flujos y reglas de 
negocio.
2 Sesión de aclaración
Reunión con el cliente para resolver ambigüedades y puntos oscuros del 
documento.
2 DF estructurado generado
Diseño Funcional validable generado automáticamente. El cliente aprueba antes 
de codificar.
3 Glosario de negocio
Identificar términos de dominio, acrónimos y reglas de negocio clave del 
sistema.
3 Glosario autogenerado
Términos, acrónimos y reglas extraídos automáticamente como subproducto 
del análisis.
4 Mapa de actores y flujos
Documentar roles, usuarios y flujos principales del sistema a construir. 4 Mapa de actores automático
Roles y flujos documentados por el agente sin reuniones adicionales de 
aclaración.
02 Análisis Técnico
Fase 02 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Requisitos no funcionales
Rendimiento, escalabilidad, seguridad, disponibilidad y restricciones 
tecnológicas.
1 RNF detectados automáticamente
ia4d-modernization-orchestratordetecta RNF del DF y propone umbrales 
técnicos.
2 Selección de stack
Definir lenguaje, frameworks, base de datos y servicios cloud necesarios. 2 Stack recomendado por IA
Stack óptimo sugerido por el agente según DF, volumen y restricciones 
detectadas.
3 Integraciones externas
Mapear APIs de terceros, sistemas legacy y servicios que deben conectarse. 3 Integraciones mapeadas automáticamente
APIs y servicios externos identificados y documentados desde el DF sin 
intervención manual.
4 Modelo de datos inicial
Diseñar el esquema de BD a partir de las entidades del documento funcional. 4 Modelo de datos generado
Esquema de BD generado automáticamente a partir de entidades y relaciones 
del DF.
03 Definición del Alcance del MVP
Fase 03 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Priorización MoSCoW
Clasificar funcionalidades en Must have, Should have, Could have y Won't have. 1 Priorización automática desde el DF
AISD propone prioridad MoSCoW basada en dependencias y complejidad del DF 
analizado.
2 Historias de usuario
Redactar historias del MVP con criterios de aceptación claros y verificables. 2 Historias generadas automáticamente
Historias con criterios de aceptación generadas desde el DF aprobado por el 
cliente.
3 Scope freeze
Acordar formalmente qué entra y qué no, con firma del cliente o PO. 3 Scope sobre documentación verificable
El cliente aprobó el DF en Fase 02. El scope se cierra sobre artefactos 
documentados.
4 Estimación inicial
Story points o T-shirt sizing para una primera previsión de esfuerzo. 4 Estimaciones —ia4d-estimation-core
Esfuerzo calculado automáticamente por el agente según complejidad y agentes 
disponibles.
04 Diseño Técnico y Arquitectura
Fase 04 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Diagramas de arquitectura
C4, componentes, despliegue y comunicación entre servicios del sistema. 1 Diagramas C4 autogenerados
ia4d-architect-reviewgenera diagramas de contexto, contenedor y 
componentes.
2 Contratos de API
Definir endpoints, payloads, códigos de error y autenticación 
(OpenAPI/Swagger).
2 OpenAPI generado automáticamente
Contratos de API completos (endpoints, schemas, auth) generados y validados 
por el agente.
3 Patrones de diseño
Seleccionar patrones: hexagonal, CQRS, microservicios, monolito modular, etc. 3 Patrones recomendados por IA
Arquitectura sugerida (hexagonal/DDD/CQRS) basada en el DT y volumen del 
sistema.
4 Decisiones técnicas (ADR)
Documentar decisiones arquitectónicas con justificación y alternativas 
descartadas.
4 ADRs generados automáticamente
Decision Records con justificación y alternativas generados por ia4d-architect
review.
05 Configuración del Entorno de Desarrollo
Fase 05 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Repositorio y branching
Crear repo, definir estrategia de ramas (GitFlow / trunk-based) y protecciones. 1 Repo con GitFlow preconfigurado
ia4d-devops-expertcrea el repo con ramas, protecciones y README inicial 
automáticamente.
2 Pipeline CI/CD
Configurar build, lint, tests automáticos y despliegue continuo básico. 2 CI/CD generado completamente
GitHub Actions / GitLab CI con build, lint, tests y despliegue generados en 
minutos.
3 Entornos
Preparar local, dev, staging con variables de entorno y secretos. 3 docker-compose multi-entorno
Configuración dev, staging y prod generada con variables y secretos 
preconfigurados.
4 Herramientas del equipo
Configurar IDE, linters, formatters, pre-commit hooks y contenedores Docker. 4 Docker + linters + hooks generados
Dockerfile, .eslintrc y pre-commit hooks generados y listos para usar por el 
equipo.
06 Desarrollo Iterativo
Fase 06 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Sprints / Iteraciones
Dividir el trabajo en ciclos cortos (1-2 semanas) con objetivos claros y medibles. 1 Plan de sprints desde el DF/DT
ia4d-project-conductorgenera plan de sprints con módulos, dependencias y 
criterios de aceptación.
2 Commits atómicos
Cada commit resuelve una sola cosa, con mensaje descriptivo y trazable. 2 Código con arquitectura limpia
Agentes especializados (backend/frontend/DB) generan código hexagonal/DDD 
en horas.
3 Code reviews
Pull requests obligatorias con al menos un revisor antes de mergear a main. 3 ia4d-pr-reviewerautomatiza reviews
Code review arquitectónico y de calidad ejecutado automáticamente en cada 
PR.
4 Dailies y tracking
Stand-ups diarios y actualización del board (Jira, Linear, Azure DevOps, etc.). 4 Tracking automático en JIRA/Azure
ia4d-project-bridgesincroniza el progreso en el board sin intervención manual.
07 Testing
Fase 07 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Tests unitarios
Cobertura mínima del 80% en lógica de negocio y capa de servicios. 1 Tests unitarios autogenerados
ia4d-testing-coregenera tests unitarios con cobertura 80%+ automáticamente.
2 Tests de integración
Validar comunicación entre componentes, APIs y base de datos del sistema. 2 Tests de integración automáticos
Tests para APIs, repositorios y BD generados como subproducto del código 
generado.
3 Tests E2E
Flujos críticos automatizados con Cypress, Playwright o herramienta similar. 3 Tests E2E con Playwright
Flujos críticos automatizados con Playwright generados por ia4d-testing-core.
4 Cobertura y calidad
Configurar SonarQube o equivalente para métricas de calidad continua. 4 Pipeline de calidad preconfigurado
SonarQube, cobertura y métricas integradas en el CI/CD generado en Fase 05.
08 Revisión y Validación Funcional
Fase 08 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Checklist funcional
Contrastar cada requisito del documento original contra lo implementado. 1 Checklist generado desde el DF
ia4d-doc-generatorgenera el checklist directamente del DF original aprobado.
2 Demo interna
Presentación al equipo para detectar gaps antes de mostrar al cliente. 2 Auditoría arquitectónica automática
ia4d-architect-reviewdetecta gaps, deuda técnica e inconsistencias antes de la 
demo.
3 UAT con cliente
Sesión de pruebas de aceptación con el cliente o analista funcional. 3 UAT sobre contrato ya validado
El cliente validó el DF en Fase 02. El UAT confirma que la implementación 
cumple el contrato.
4 Registro de defectos
Documentar bugs encontrados con prioridad y asignar responsable de 
resolución.
4 Defectos en el pipeline CI/CD
ia4d-pr-reviewerreporta defectos arquitectónicos y de calidad en cada PR 
automáticamente.
09 Despliegue en Entorno de Pruebas
Fase 09 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Deploy a staging
Subir la versión candidata a un entorno accesible para validación del cliente. 1 Deploy automatizado —CI/CD Fase 05
El pipeline ya generado despliega automáticamente a staging con cada push al 
repo.
2 Smoke testing
Verificar que la aplicación arranca, se conecta a BBDD y responde 
correctamente.
2 Smoke tests en el pipeline
Smoke tests ejecutados automáticamente en cada despliegue como parte del 
CI/CD.
3 Datos de prueba
Cargar un set de datos representativo para pruebas realistas y completas. 3 Fixtures generados con el código
Seeds y datos de prueba generados por ia4d-backend-expertjunto al código de 
la app.
4 Monitorización básica
Logs, health checks y alertas mínimas configuradas antes de la validación. 4 Observabilidad preconfigurada
Logs, health checks y alertas configurados por ia4d-devops-experten Fase 05.
10 Entrega del MVP
Fase 10 de 10
MÉTODO TRADICIONAL MÉTODO AISD  ·  IA4D
1 Demo al cliente
Presentación formal del MVP con recorrido guiado por los flujos principales. 1 Demo sobre MVP auditado
El MVP llega con tests, docs y auditoría completa. La demo valida el DF de Fase 
02.
2 Recopilación de feedback
Documentar impresiones, cambios solicitados y puntos de mejora identificados. 2 Feedback al backlog AISD
Feedback del cliente estructurado automáticamente para el siguiente sprint 
AISD.
3 Documentación mínima
README, guía de despliegue, endpoints documentados y decisiones técnicas. 3 Docs HTML navegables automáticas
ia4d-doc-generatorgenera README, APIs, arquitectura y guía de operaciones 
completa.
4 Roadmap de iteraciones
Plan de las siguientes fases con las funcionalidades aplazadas del MVP. 4 Roadmap desde el backlog AISD
Funcionalidades pendientes del DF + feedback del cliente → roadmap priorizado