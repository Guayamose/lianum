# Objetivo de Lianum

Lianum busca ofrecer una wallet privada con una experiencia coherente entre
Ethereum, Base, Arbitrum, BNB, Solana, Tron y Bitcoin. El usuario debe gestionar
activos y operaciones desde una cuenta común, con custodia, consentimiento y
recuperación definidos explícitamente.

El núcleo organiza operaciones mediante PAEG, un grafo privado de acciones con
límites explícitos. Noir y Solidity validan partes del protocolo. Recuperar
estado privado debe respetar las entregas ya confirmadas en cadenas externas.

La arquitectura incluye custodia móvil, backend modular y workers separados
para pruebas. Ya existen un cliente nativo en `apps/mobile`, una frontera HTTP
duradera en `apps/platform` y preparación GCP en `infra/google-cloud`. Conectarlos
a cuentas, keeper y workers reales sigue pendiente. `packages/custody` contiene
también los procesos originales del laboratorio; éstos no demuestran custodia
en dispositivo ni operadores independientes.

La preparación Cloud actual es local, con recursos deshabilitados. La privacidad
por defecto y el rendimiento son criterios de diseño y aceptación:
[fronteras y requisitos](docs/PRIVACY-AND-OPERATIONS.md). La criptografía parcial
no permite afirmar privacidad del sistema completo.

El agente autónomo personal de Rafa queda fuera de este repositorio y podrá
consumir las APIs y permisos del producto.

[Visión original completa](archive/delivery/PROJECT-VISION.md) ·
[Estado ejecutable](STATUS.md) · [Trabajo restante](ROADMAP.md)
