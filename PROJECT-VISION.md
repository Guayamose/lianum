# Objetivo de Lianum

Lianum busca ofrecer una wallet privada con una experiencia coherente entre
Ethereum, Base, Arbitrum, BNB, Solana, Tron y Bitcoin. La intención es que el
usuario gestione activos y operaciones desde una cuenta común, con custodia,
consentimiento y recuperación definidos explícitamente.

El núcleo organiza operaciones mediante PAEG, un grafo privado de acciones
con límites explícitos. Los circuitos Noir y los contratos Solidity validan
partes de ese protocolo. La recuperación debe respetar las operaciones que ya
se hayan confirmado en cadenas externas.

La arquitectura objetivo incluye custodia móvil, backend modular y workers
separados para las pruebas criptográficas. La carpeta `packages/custody/`
contiene lógica de custodia; todavía no constituye una aplicación nativa
Android o iOS. Los módulos existentes no equivalen a un despliegue terminado
de esa arquitectura.

El agente autónomo personal de Rafa queda fuera de este repositorio y podría
consumir APIs del producto en el futuro.

[La visión original completa](archive/delivery/PROJECT-VISION.md) conserva los
requisitos y decisiones de origen. [STATUS.md](STATUS.md) describe lo que se
puede ejecutar hoy.
