# Custodia del propietario

`src/` contiene el código y `tests/` las pruebas, separados por función.

| Función | Contenido |
| --- | --- |
| `signing/` | Custodia y envelopes autorizados |
| `processes/` | Procesos del propietario y sus variantes |
| `preparation/` | Preparación, bindings y consentimiento |
| `observers/` | Observaciones del propietario y de reclamaciones |
| `claims/` | Transiciones y entregas entrantes |
| `lifecycle/`, `portfolio/` en tests | Escenarios de sesión, autoridad y cartera |

Entrada: [flat-owner-process.mjs](src/processes/flat-owner-process.mjs).
Este paquete contiene lógica de custodia; no es una aplicación móvil nativa.
