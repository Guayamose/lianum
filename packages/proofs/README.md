# Pruebas criptográficas

Este paquete posee clientes, workers, herramientas y verificación de pruebas.
Consume engine, custody y contratos compartidos; la composición de operaciones
que necesitan cuentas, redes y recuperación pertenece a backend.

| Carpeta | Contenido |
| --- | --- |
| `src/catalog.mjs` | Catálogo de perfiles y ubicaciones de recursos |
| `src/jobs/` | Clientes, workers y límites de jobs compartidos |
| `src/execution/` | Procesos y workers de prueba, recursos y ejecución de notas |
| `src/host/` | Archivos, identidad de procesos, RSS y límites de ejecución |
| `src/toolchain/` | Provers wallet/assembly, cliente y worker paginados, lectura de artefactos y recursos |
| `src/tooling/` | Herramientas de compilación y generación |
| `src/verification/` | Validadores de claves y fuentes ligados a sus pines |
| `src/native-value/`, `src/native-ingress/`, `src/wrapped-claims/` | Perfiles y metadatos de esos recorridos |
| `circuits/` | Circuitos Noir actuales |
| `shared/`, `vendor/` | Bibliotecas compartidas y fuentes externas |
| `tests/` | Pruebas de jobs, toolchain y sus contratos |

La integración económica de esos recorridos se edita en
`packages/backend/src/proving/`. La herramienta criptográfica compartida se
edita aquí. Los anteriores módulos ejecutables de experimentos y helpers de
tests reexportan las implementaciones operativas cuando necesitan conservar
una entrada compatible.

Los recursos retenidos incluyen circuitos, claves, bibliotecas y herramientas
con identidades fijadas. Sus verificaciones no desaparecen al mover el módulo.
Los consumidores importan los validadores de `@lianum/components/resources/`;
la ubicación de datos se obtiene de
`@lianum/environment`. Los inventarios fijan los cuerpos actuales de esos
módulos, además de los registros históricos. Importar el catálogo
o preparar un bundle no genera una prueba ni acredita una release.

El gateway paginado importa los módulos activos de `toolchain/` y conserva una
única identidad de Graph y cliente, también desde la copia de compatibilidad.
El lector conserva los hashes y las verificaciones de fuente de la generación
original; una divergencia sigue bloqueando su uso y requiere una nueva
generación revisada. Los originales experimentales fijados se leen como
evidencia, sin convertirlos en otra implementación activa.

Los candidatos trasladables y la compatibilidad histórica se preparan de forma
explícita; consulta [COMMANDS.md](../../docs/COMMANDS.md) y
[STRUCTURE.md](../../docs/STRUCTURE.md). Las APIs públicas están en
[package.json](package.json); `./dev boundaries` y
[MODULES.md](../../docs/MODULES.md) describen sus dependencias y la deuda interna
pendiente del conjunto.
