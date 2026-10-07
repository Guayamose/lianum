# Archivo del proyecto

| Carpeta | Contenido |
| --- | --- |
| `delivery/` | Documentos, manifiestos y copia exacta de los 1.684 archivos de la entrega original |
| `reference/` | Entrega anterior y fuentes adicionales que no sustituyen la aplicación actual |
| `reviewed-packets/` | Paquetes revisados que no se han incorporado automáticamente |
| `drafts/` | Propuestas sin terminar |
| `restoration/` | Recetas, dependencias públicas, informes y evidencias de restauración |
| `legacy-client/` | Interfaz anterior, conservada para los consumidores heredados |
| `legacy-engine/` | Package y lock originales del motor anterior |
| `source-evidence/` | Manifiestos y recibos públicos incluidos en la fuente congelada |

`delivery/original-paths.json` permite encontrar cada archivo del manifiesto
original en su ubicación actual. `./dev check` verifica los 2.649 archivos de
esa entrega y que la copia de ejecución corresponde al código editable.

Las carpetas `legacy-client`, `legacy-engine` y `source-evidence` forman parte
del mapa de compatibilidad; algunos consumidores heredados siguen usándolas.
El resto se consulta como referencia o respaldo. Las fuentes de trabajo están
en `apps/`, `packages/`, `contracts/`, `tests/`, `scripts/` y `experiments/`.
