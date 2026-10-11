# Componentes de circuito

`src/` contiene framing, fixtures y herramientas de componentes.
`circuits/` contiene los circuitos Noir y `test/` sus pruebas.
Sus lanzadores están en `scripts/components/`.

`src/encoding/` es propietario de los contratos públicos de statements y
commitments. Solo codifica, valida y une datos: no crea custodia ni autoridad.
Custody, proofs y backend consumen sus APIs explícitas `encoding/statements`
y `encoding/commitments`. Las rutas antiguas del backend conservan reexports
de los mismos objetos para los consumidores existentes.

Las entradas públicas de `@lianum/components` están en
[`package.json`](package.json). Consulta [Módulos y dependencias](../../docs/MODULES.md)
para consumirlas y comprobar los límites entre componentes.
