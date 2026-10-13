# Lianum

Wallet omnichain privada en desarrollo. El proyecto reúne una wallet web,
un cliente móvil, backend compartido, contratos Solidity y circuitos Noir.

La [visión original](PROJECT-VISION.md) define el producto y
[EXCLUSIONS.md](EXCLUSIONS.md) delimita su alcance. Consulta
[STATUS.md](STATUS.md) para saber qué funciona y qué falta, y
[ROADMAP.md](ROADMAP.md) para el orden de trabajo.

## Estado publicado: 13 de octubre de 2026

La app Android incluye una cartera de ETH, BTC y SOL en redes públicas,
con claves y firma en el dispositivo. Su API HTTPS está desplegada en
`https://api.lianum.oryontechnology.com`; las direcciones, QR y consultas de
saldo se han comprobado en el teléfono. El primer envío real sigue pendiente.
MoonPay está implementado, pero desactivado hasta disponer de cuenta y credenciales.

PAEG, las cuentas privadas y DeFi conservan sus servicios y recorridos locales.
No están publicados en esa API ni conectados automáticamente al saldo de la
cartera pública. Las aceptaciones locales descritas abajo conservan ese alcance.

## Dónde trabajar

| Carpeta | Responsabilidad |
| --- | --- |
| `apps/wallet/` | Wallet web y servidor del laboratorio |
| `apps/mobile/` | Aplicación Expo/React Native y custodia del dispositivo |
| `apps/platform/` | API móvil, persistencia PostgreSQL y gateways locales |
| `packages/` | Backend, custodia, motor, protocolos y pruebas compartidos |
| `contracts/` | Contratos Solidity |
| `tests/` | Integración entre componentes |
| `scripts/` | Comandos de desarrollo y laboratorios |
| `infra/` | Despliegue de la wallet pública y perfiles anteriores de infraestructura |
| `docs/` | Guías de desarrollo y contratos entre componentes |
| `experiments/` | Implementaciones experimentales; algunas siguen en uso |
| `archive/` | Entregas originales y referencias históricas |

Abre `lianum.code-workspace` o esta carpeta en VS Code. El
[mapa del código](docs/STRUCTURE.md) explica los dominios y sus entradas.

## Comandos habituales

Desde la raíz del proyecto:

```sh
./dev start     # Wallet local; Ctrl+C para cerrar
./dev build     # Preparar dependencias; ejecutar directamente lo que editas
./dev status    # Ver herramientas y aplicaciones disponibles
./dev test      # Selección habitual de pruebas rápidas
./dev test --changed --plan  # Ver qué pruebas corresponden a tus cambios
./dev check     # Fronteras, análisis estático y pruebas de host acotadas
./dev help      # Todos los comandos
```

Para conectar la app Android con las tres redes locales, usa
`./dev platform paged-native-new`; para las tres redes y Uniswap en la misma
operación, usa `./dev platform paged-mixed-new`. Una relación DeFi independiente
se abre con `./dev platform defi-new`. Los asistentes generan su conexión pública para
importar desde el teléfono. Sigue los pasos y límites de
[apps/platform/README.md](apps/platform/README.md#usar-el-ordenador-con-la-app-android).

La wallet web local inicia desconectada. Arrancar una interfaz u operador no financia
notas ni acredita una operación. Los perfiles `paged-native-new` y
`paged-mixed-new` exigen un entorno nuevo y preservan el estado existente.

El recorrido actual está aceptado en el ordenador con custodia software y
cadenas locales: Uniswap y tres pagos nativos, veintiuna pruebas, cuatro
reaperturas completas, recuperación de respuesta perdida, cambio de 200 y
cuatro liquidaciones de 100 al proveedor. La cartera registrada verificó
600 → 400 → 0 unidades demo y conservó el cero tras reabrir, con el token
Uniswap separado. Los recursos originales cerraron. Las aceptaciones anteriores
se conservan en [STATUS.md](STATUS.md), junto a sus límites. Estos resultados
no acreditan el recorrido del APK nuevo en teléfono físico ni redes públicas.

La [guía de desarrollo](docs/DEVELOPMENT.md) explica el bootstrap de un clon
limpio y la selección de pruebas por carpeta.

[Comandos vigentes](docs/COMMANDS.md) · [Flujo por componente](docs/WORKFLOW.md) ·
[Interfaces de módulos](docs/MODULES.md).
`./dev workflows` muestra las entradas actuales, su alcance y sus comprobaciones.
Los laboratorios y workers que verifican originales históricos usan
compatibilidad explícita: `./dev build --legacy` y `./dev legacy test …`.
`./dev sources prepare` prepara una generación nueva y comprueba qué artefactos
se pueden reutilizar; conserva la publicación anterior y su procedencia.

## Entorno local y limpieza

Edita `apps/`, `packages/`, `contracts/`, `tests/` y `scripts/`.
`.internal/runtime/` conserva las rutas compatibles que todavía necesita parte
del código; `.internal/dev/` contiene herramientas y material de desarrollo.
`.local/` guarda estado, configuración y cachés propios de esta máquina.

```sh
./dev clean          # Ver selección y espacio; no modifica archivos
./dev clean --apply  # Limpiar material regenerable y compactar el historial
```

La limpieza conserva originales, custodia, estado económico, herramientas
activas, APK actual y trabajo pendiente. El historial compactado queda en
`.local/history/`. Consulta [el entorno local](docs/LOCAL-ENVIRONMENT.md) para
conocer el alcance y restaurar un respaldo.

[Móvil](apps/mobile/README.md) · [API y PostgreSQL](apps/platform/README.md) ·
[Infraestructura local](infra/google-cloud/README.md) ·
[Laboratorio EVM](docs/EVM-LAB.md)
