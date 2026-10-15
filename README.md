# Lianum

Wallet móvil y motor PAEG para preparar, autorizar, ejecutar y recuperar operaciones entre redes. El código de los servicios, las bibliotecas y los contratos se mantiene en este repositorio.

## Dónde trabajar

| Carpeta | Responsabilidad |
|---|---|
| `apps/mobile` | Aplicación Android/iOS, custodia personal y revisión de operaciones. |
| `services/api-server` | Entradas de la API pública y perfiles de admisión con persistencia. |
| `services/paeg-engine` | Arranque, reapertura y ejecución del motor, local o remoto. |
| `packages` | Lógica compartida: backend, motor, pruebas ZK, criptografía y protocolo del móvil. |
| `contracts` | Contratos EVM y programas Solana. |
| `infra/google-cloud` | Instalación y despliegue de API, motor y red privada. |
| `scripts` | Preparación, diagnóstico, validación y mantenimiento. |
| `tests/integration` | Recorridos que utilizan varios componentes. |

El mapa detallado está en [docs/STRUCTURE.md](docs/STRUCTURE.md). Los comandos salen de un único catálogo: `./dev help` y [docs/COMMANDS.md](docs/COMMANDS.md).

## Preparación

```sh
./dev prepare host
./dev build
./dev prepare mobile
./dev prepare api-server
```

`./dev build` prepara las dependencias de los paquetes. Las herramientas nativas, programas compilados y parámetros ZK se verifican por separado; no se descargan ni regeneran todos al instalar npm.

## Ejecutar y comprobar

```sh
./dev status
./dev doctor
./dev boundaries
./dev static
./dev test --component api-server --plan
./dev block-check --plan
```

La API pública requiere una configuración privada del servidor:

```sh
LIANUM_PUBLIC_WALLET_CONFIG=/ruta/a/public-wallet.json ./dev api
```

El ejemplo de configuración está en `infra/google-cloud/api-server/config.example.json`. El arranque del motor utiliza perfiles explícitos y su estado retenido; consulta `services/paeg-engine/src/entry.mjs` y `./dev workflows` antes de abrir o reabrir una operación.

## Recursos locales

`.internal` conserva herramientas y recursos verificados. `.local` contiene datos de desarrollo, custodia de pruebas, recuperación e informes. Los programas de pruebas ZK también pueden tener artefactos retenidos en sus directorios `.local`.

```sh
./dev resources status
./dev clean --help
```

La limpieza automática se limita a rutas regenerables declaradas. Las evidencias mínimas usadas por los lectores criptográficos están en `packages/proofs/evidence`: sus hashes conservan la identidad de los programas y verificadores originales.

La interfaz web local se ha retirado. Los pequeños clientes de simulación que aún comprueban recorridos anteriores están bajo `scripts/engine/demos`; no son una segunda aplicación del producto.
