# Lianum

Wallet omnichain privada en desarrollo. El proyecto reúne una wallet web,
un cliente móvil, backend compartido, contratos Solidity y circuitos Noir.

La [visión original](PROJECT-VISION.md) define el producto y
[EXCLUSIONS.md](EXCLUSIONS.md) delimita su alcance. Consulta
[STATUS.md](STATUS.md) para saber qué funciona y qué falta, y
[ROADMAP.md](ROADMAP.md) para el orden de trabajo.

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
| `infra/` | Infraestructura Google Cloud preparada para validación local |
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
./dev check     # Revisar contratos entre módulos y pruebas de host
./dev help      # Todos los comandos
```

La wallet inicia desconectada. Los laboratorios económicos se ejecutan con
comandos propios; arrancar la interfaz no acredita fondos ni una operación.
La [guía de desarrollo](docs/DEVELOPMENT.md) explica el bootstrap de un clon
limpio y la selección de pruebas por carpeta.

[Flujo por componente](docs/WORKFLOW.md) · [Interfaces de módulos](docs/MODULES.md).
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
