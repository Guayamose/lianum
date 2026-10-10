# Pruebas criptográficas

| Carpeta | Contenido |
| --- | --- |
| `src/catalog.mjs` | Catálogo de perfiles disponibles |
| `src/jobs/` | Cliente, procesos, workers y límites de jobs compartidos |
| `src/tooling/` | Herramientas de compilación y generación |
| `src/verification/` | Verificación ligada a pines |
| `src/native-value/`, `src/native-ingress/`, `src/wrapped-claims/` | Recorridos específicos, separados en runtime, tooling y metadata |
| `circuits/` | Circuitos Noir actuales |
| `shared/`, `vendor/` | Bibliotecas compartidas y fuentes externas |
| `tests/` | Pruebas de los componentes de jobs |

Los circuitos experimentales todavía utilizados están en `experiments/`.

Las entradas públicas de `@lianum/proofs` están en
[`package.json`](package.json). Consulta [Módulos y dependencias](../../docs/MODULES.md)
para consumirlas y comprobar los límites entre componentes.
