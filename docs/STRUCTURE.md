# Estructura del proyecto

## Aplicación y servicios

```text
apps/
  mobile/                         Aplicación Android/iOS
services/
  api-server/
    src/
      entry.mjs                   Selección de perfil de API
      wallet-entry.mjs            Entrada de la API pública de wallet
      admission/                  HTTP de admisión
      authorization/              Autorizaciones y privacidad de sus registros
      storage/                    PostgreSQL y migraciones
      original/                   Puentes y recuperación de generaciones anteriores
    migrations/                   SQL versionado
    tests/                        Pruebas del servicio y de persistencia
  paeg-engine/
    src/
      entry.mjs                   Perfiles explícitos del motor local
      bootstrap/                  Preparación y reapertura de estados retenidos
      local/                      Arranques locales y del entorno remoto de preparación
      public/                     Operador de testnets, lectura y control de permisos
    tests/
```

La API publicada en Google Cloud se instala con la configuración de `infra/google-cloud/api-server`. El motor remoto tiene su instalación independiente en `infra/google-cloud/paeg-engine`. Que exista código de arranque no acredita que un servicio desplegado esté operativo.

El empaquetador del motor conserva una estructura de entrega estable (`candidate/` e `infra/`). La ubicación de un fichero en esa entrega no cambia su responsabilidad en el árbol de desarrollo: los módulos ejecutables del operador se mantienen en `services/paeg-engine/src`.

## Bibliotecas

| Paquete | Contenido |
|---|---|
| `backend` | Cuentas, APIs reutilizables, proveedores, conectores de redes, ejecución y DeFi. |
| `engine` | Reglas de operaciones, notas, dependencias, cierre, recuperación y SDK. |
| `proofs` | Procesos de prueba ZK, verificadores y control de los recursos criptográficos. |
| `crypto` | Claves, firmas, direcciones y codificación criptográfica. |
| `components` | Componentes de circuitos, codificación e integridad. |
| `custody` | Propiedad y transiciones de reclamaciones. |
| `mobile-protocol` | Mensajes, autorizaciones, tipos y modelos compartidos por clientes. |
| `environment` | Rutas y selección explícita de recursos. |
| `chains` | Driver nativo de Tron. |
| `protocol` | Compatibilidad de generaciones anteriores. Sus fuentes congeladas se verifican por inventario. |

Los proyectos de circuitos y sus herramientas están en `packages/proofs/programs`. Los circuitos de la generación anterior están junto a `packages/protocol`. Las mediciones de rendimiento están en `scripts/engine/diagnostics`, fuera de los programas del producto.

## Contratos, infraestructura y validación

- `contracts/engine`: contratos del motor y recorridos compatibles.
- `contracts/wallet`: custodia, ingresos, retiradas, DeFi y programas Solana.
- `contracts/protocol`: contratos de la generación anterior.
- `infra/google-cloud/api-server`: máquina y entrega de la API pública.
- `infra/google-cloud/paeg-engine`: máquina, entrega y herramientas de operación del motor.
- `infra/google-cloud/network`: configuración compartida de red.
- `scripts/development`: comando `./dev`, comprobaciones y mantenimiento del entorno.
- `scripts/development/profiles`: arranques de desarrollo para redes y recorridos específicos.
- `scripts/validation`: validaciones de ingresos, reclamaciones y SDK.
- `scripts/engine/demos`: simulaciones mantenidas y su pequeño cliente auxiliar.
- `tests/integration`: recorridos completos entre componentes.
- `packages/backend/tests/api/wallet`: cobertura HTTP y SDK conservada tras retirar la interfaz web local.

## Evidencia y recursos

`archive` y `experiments` ya no forman parte del árbol. El historial general está en Git.

`packages/proofs/evidence` contiene sólo material que aún consumen lectores o preparadores: fuentes originales autenticadas por hash, metadatos de compilación y evidencia necesaria para compatibilidad. Los archivos `.source` se leen como datos; no crean rutas alternativas para ejecutar código histórico.

Los nombres anteriores pueden seguir apareciendo como etiquetas dentro de manifiestos inmutables. Los lectores verifican sus bytes y resuelven su ubicación actual de forma explícita. Cambiar una etiqueta histórica no equivale a conservar su identidad.

- `.internal/dev`: herramientas, objetos públicos retenidos e informes de comprobación.
- `.internal/runtime`: recursos e instalación compatible requerida por algunos lectores.
- `.local`: estados privados, recuperación, redes de desarrollo, resultados y respaldos.
- `node_modules`: dependencias instaladas.
- `scripts/development/resources/public-resources.json`: inventario de recursos públicos que todavía necesita la preparación.

El editor oculta los directorios generados. `./dev resources status` permite inspeccionar su clasificación sin leer el contenido de la custodia. `./dev clean` utiliza rutas de caché explícitas; no considera prescindible todo un directorio por llamarse `.local`.
