# Lianum

Wallet omnichain privada en desarrollo: web en JavaScript ESM, móvil en
Expo/React Native, contratos Solidity y circuitos Noir. La base de desarrollo
está versionada; los recorridos de producto aún se están integrando.

```text
lianum-project/
├── apps/
│   ├── wallet/       Wallet web y servidor del laboratorio
│   ├── mobile/       Cliente nativo Android/iOS
│   └── platform/     API móvil, PostgreSQL y Docker local
├── packages/         Backend, custodia, pruebas y bibliotecas compartidas
├── contracts/        Contratos Solidity
├── tests/            Integración; unidades junto a su módulo
├── infra/            Infraestructura Google Cloud deshabilitada
├── scripts/          Comandos y herramientas
├── experiments/      Código heredado aún utilizado
├── docs/             Documentación
└── archive/          Entregas originales y restauración
```

Abre `lianum.code-workspace` o esta carpeta en VS Code. En esta máquina:

```sh
./dev start
./dev check
./dev test
```

El arranque imprime una dirección local y termina con Ctrl+C. La wallet inicia
desconectada. La selección habitual pasa: 244 resultados.
También existen `npm run dev`, `npm run check` y `npm test`.

Dentro de cada componente, `src/` contiene implementación, `tests/` pruebas y
`docs/` explicaciones. [El mapa](docs/STRUCTURE.md) señala entradas por dominio.
Los módulos heredados se preparan en `.internal/runtime/`; edita las carpetas
normales y reinicia la wallet para cargar cambios.

Para un clon limpio, el [bootstrap de host](docs/DEVELOPMENT.md) permite ejecutar
la selección habitual sin el laboratorio privado ni el paquete de restauración.
La [restauración completa](scripts/development/README.md) sí necesita materiales
públicos adicionales para releases y runtimes originales.

[Móvil](apps/mobile/README.md), [API/Docker](apps/platform/README.md) e
[infraestructura local](infra/google-cloud/README.md) tienen comandos propios.
La API aún no está conectada al motor económico: estado privado `null` y
readiness 503. No hay proyecto ni despliegue en Google Cloud.

[Estado y pendientes](STATUS.md) · [Orden de trabajo](ROADMAP.md) ·
[Visión](PROJECT-VISION.md) · [Laboratorio EVM](docs/EVM-LAB.md)
