# Componentes del producto

| Paquete | Función |
| --- | --- |
| [backend](backend/) | API, cuentas, cadenas, reclamaciones, ejecución y DeFi |
| [custody](custody/) | Custodia, firmas, consentimiento y procesos del propietario |
| [mobile-protocol](mobile-protocol/) | Contratos compartidos de autorización y revisión móvil |
| [proofs](proofs/) | Workers y circuitos de pruebas criptográficas |
| [crypto](crypto/) | Implementación candidata Poseidon |
| [engine](engine/) | Motor compartido del que aún depende la aplicación |
| [protocol](protocol/) | Generación anterior del protocolo conservada como soporte |
| [components](components/) | Framing y herramientas de componentes de circuito |
| [chains](chains/) | Driver Java de Tron |

Cada paquete tiene un README breve. `src/` contiene implementación y
`tests/` escenarios de prueba cuando existen. Los comandos se ejecutan
desde la raíz del proyecto.

Las entradas públicas están declaradas en el `package.json` de cada paquete
JavaScript. Los consumidores nuevos usan `@lianum/<paquete>/<entrada>`.
[Módulos y dependencias](../docs/MODULES.md) explica las entradas disponibles,
las comprobaciones y los ciclos heredados que todavía se conservan.
