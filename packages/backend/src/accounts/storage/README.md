# Persistencia de cuentas

`durable-generic-account-keeper.mjs` compone el coordinador genérico del motor con
el registro padre cifrado, la sesión SOURCE y el registro de vida wrapped. Es el
único propietario de la marca privada de un keeper durable.

El motor recibe tres operaciones de persistencia: estado inicial (`opening`),
retención de checkpoints (`retain`) y cierre (`close`). No recibe verificadores
de sesión ni callbacks capaces de otorgar pertenencia durable. Conserva el mismo
objeto keeper, su bloqueo de operaciones, el proceso hijo y la marca genérica de
cuenta. El backend conserva sus propias comprobaciones de objeto original antes
de enlazar o consultar una sesión.

Flujo de checkpoint SOURCE:

1. Comprobar sesión y keeper originales y publicar el candidato.
2. Actualizar el registro padre mediante CAS y verificar su lectura.
3. Confirmar el checkpoint y comprobar el proceso hijo original.
4. Actualizar el registro de vida, cuando exista.

Cualquier fallo bloquea el coordinador. Copiar un objeto, implementar el puerto
o crear un keeper genérico no lo convierte en un keeper durable. La captura
sigue cerrando el proceso hijo; la reapertura exige el checkpoint retenido y
conserva el marcador de admisión de un solo uso.

La API se importa desde `@lianum/backend/accounts/durable-keeper`. Para un
coordinador sin integración SOURCE/wrapped, usar `@lianum/engine/accounts/keeper`.
No hay un segundo registro ni una copia de la implementación en engine.
