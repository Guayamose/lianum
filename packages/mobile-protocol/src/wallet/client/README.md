# Cliente compartido de la wallet

Este código sirve al navegador y al SDK local. No posee claves, autoridad económica ni almacenamiento persistente. Las revisiones de la interfaz describen los términos originales; el backend conserva la decisión de autorización y ejecución.

| Carpeta / archivo | Responsabilidad | Dónde cambiar algo |
| --- | --- | --- |
| `validation/` | Comprobar payloads de lectura, identidad, diario, grafos, transferencias y respuestas de acciones | Añadir o corregir una comprobación de contrato |
| `actions/catalog.mjs` | Catálogo fijo de rutas y acciones | Declarar una acción ya implementada por el servidor |
| `actions/account-context.mjs` | Vincular la revisión al activo, generación y solicitud originales | Modificar la selección de un activo o solicitud |
| `actions/rules.mjs` | Construir el cuerpo exacto y decidir si se puede solicitar una acción | Cambiar disponibilidad o campos permitidos |
| `presentation/` | Proyectar lecturas y redactar revisiones, sin efectos | Cambiar etiquetas, unidades o representación de estados |
| `transport/http.mjs` | Una petición HTTP con cancelación, sin caché, cookies ni reintentos | Cambiar el transporte conservando sus garantías |
| `session.mjs` | Mantener revisión, grants, tokens, estado leído y resultado incierto de una sesión | Cambiar el ciclo leer → revisar → confirmar |
| `view-model.mjs` | Entrada compatible que reexporta exactamente la API anterior | Solo compatibilidad; implementar en la responsabilidad correspondiente |

Las dependencias fluyen desde la sesión hacia reglas, presentación, validación y transporte. Las reglas y validadores no importan la sesión ni HTTP; el transporte desconoce las acciones. El grafo interno no admite ciclos. Cada módulo importa sus dependencias concretas y no recibe un contexto compartido.

Para código nuevo, utiliza la entrada pública específica de `@lianum/mobile-protocol/wallet/…`: `action-catalog`, `account-context`, `action-rules`, `state-validation`, `projection`, `native-identity`, `values` o `session`. `wallet/client` conserva la compatibilidad para integraciones existentes.

Las pruebas de `apps/wallet/tests/client/ui.test.mjs` comprueban revisiones inmutables, respuesta perdida, cancelación del cuerpo HTTP, conciliación de la solicitud original y ausencia de reintentos. `packages/mobile-protocol/tests/wallet-client-architecture.test.mjs` conserva las identidades exportadas y rechaza ciclos o dependencias que inviertan estas responsabilidades.

Los módulos del navegador se sirven mediante la lista explícita de `apps/wallet/src/server/server.mjs`. Al añadir uno, registra ese recurso; nunca publiques la carpeta entera.
