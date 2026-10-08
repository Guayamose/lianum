# Lianum

Wallet omnichain privada en desarrollo: web en JavaScript ESM, móvil en
Expo/React Native, contratos Solidity y circuitos Noir. La base de desarrollo
está versionada; los recorridos de producto aún se están integrando.

La pestaña móvil «Cuenta vinculada» consulta o reconcilia una petición original
admitida con consentimientos firmados. Su SDK completó un recorrido económico
con dos pruebas genuinas y propietarios originales en Linux, con saldo privado
500→0. Falta cerrar ese recorrido desde la custodia raíz React Native y un
dispositivo. La custodia raíz, backup/restauración y firmas locales D26/D27
están implementados, con trece checks móviles y tipos correctos; Poseidon2
BigInt pasó seis vectores contra BB oficial. Las notas preparadas siguen
UNISSUED: financiación/PAEG desde esa custodia y comprobación física pendientes.
[Protocolo y límites V2](docs/ORIGINAL-ACCOUNT-V2.md).

El APK Android autónomo actualizado está **aceptado** sin Metro, con
JavaScript/Hermes y firma Android Debug: 42.169.935 bytes y pico RSS de grupo
2.339.147.776 bytes bajo el mismo límite de 3 GiB, con doce joins originales del
source map. Incluye raíz local, notas, backup y firmas D26/D27; financiación/PAEG
móvil y comprobación física quedan pendientes.
[Artefacto y comandos móviles](apps/mobile/README.md).

Los siete objetivos y seis requisitos de [la visión](PROJECT-VISION.md)
siguen vigentes. Uniswap tiene aceptación local genuina desde reserva privada
con PAEG, swap, liquidación, EXIT y repetición sin pago duplicado. MetaMorpho
conserva sus rechazos del driver pese a completar pruebas y redención real;
F DeFi y los demás protocolos siguen pendientes. Tron V5 quedó rechazado con
financiación y cinco pruebas genuinas, sin entrega nativa. U8 midió prove
28,520 s bajo el guard de 3 GiB; todavía supera el objetivo de pruebas <20 s.
[Estado funcional y pendientes](STATUS.md).

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
desconectada. La selección habitual comprueba el núcleo sin iniciar las campañas
financieras.
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
La API arranca con su adaptador económico desconectado: estado privado `null`
y readiness 503. La cuenta vinculada usa una integración original acotada. No
hay proyecto ni despliegue en Google Cloud.

[Estado y pendientes](STATUS.md) · [Orden de trabajo](ROADMAP.md) ·
[Visión](PROJECT-VISION.md) · [Laboratorio EVM](docs/EVM-LAB.md)
