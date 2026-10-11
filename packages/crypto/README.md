# Criptografía Poseidon

`src/` contiene la implementación candidata; `circuits/` sus circuitos;
`lib/` las bibliotecas Noir; `test/` sus pruebas; y `vendor/` fuentes
externas. Las herramientas de este candidato están en `scripts/`.

`src/portable/poseidon2-bn254-v1.mjs` es la implementación BigInt compartida por
engine y móvil, exportada como `@lianum/crypto/portable-poseidon2`. Conserva sus
vectores oficiales y licencia. La entrada anterior de la app móvil la reexporta;
las modificaciones a esta primitiva se hacen aquí, no en la app. Su aritmética
BigInt no es constante en tiempo y no acredita por sí sola aceptación económica.

Es un componente criptográfico del proyecto, no una aplicación independiente.

Las entradas públicas de `@lianum/crypto` están en
[`package.json`](package.json). Consulta [Módulos y dependencias](../../docs/MODULES.md)
para consumirlas y comprobar los límites entre componentes.
