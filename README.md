# Lianum

Wallet omnichain privada en desarrollo. La aplicación web y su backend actual
están escritos en JavaScript ESM; los contratos usan Solidity y los circuitos,
Noir.

```text
lianum-project/
├── apps/wallet/       Aplicación web y servidor HTTP
├── packages/          Backend, custodia, pruebas y motores compartidos
├── contracts/         Contratos Solidity
├── tests/             Integración; unidades junto a su módulo
├── scripts/           Comandos y herramientas
├── experiments/       Circuitos y experimentos heredados aún utilizados
├── docs/              Documentación
└── archive/           Entregas, propuestas y restauración
```

Abre `lianum.code-workspace` en VS Code o abre esta carpeta directamente.
Desde aquí:

```bash
npm run dev
npm run check
npm test
```

También puedes usar `./dev start`, `./dev check` y `./dev test`. El arranque
imprime una dirección local; abre esa dirección y termina con Ctrl+C. La
wallet arranca desconectada. Los tests conservan dos fallos previos conocidos.

Dentro de cada componente, `src/` contiene código, `tests/` pruebas y `docs/`
las explicaciones. Edita `apps/wallet/src/client/` para la interfaz y
`packages/backend/src/` para la
lógica de servidor. [El mapa de carpetas](docs/STRUCTURE.md) indica dónde están
custodia, contratos y pruebas.

Una copia generada en `.internal/` conserva las rutas exigidas por el código
heredado. Los comandos la preparan desde los archivos editables; reinicia la
wallet después de cambiar código. La eliminación de esa compatibilidad queda
pendiente. El entorno restaurado de esta máquina permite estos comandos; una
copia nueva requiere reconstruir sus dependencias públicas.

[Estado actual](STATUS.md) · [Siguiente trabajo](ROADMAP.md) ·
[Objetivo del producto](PROJECT-VISION.md) · [Entorno](scripts/development/README.md)
