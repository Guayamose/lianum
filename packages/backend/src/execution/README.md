# Ejecución de operaciones

PAEG es el protocolo que organiza el grafo privado de acciones.
`account/` contiene el recorrido de cuenta flat; `native-value/` y
`wrapped/` contienen sus recorridos específicos.

Cada recorrido separa `preparation/` —admisión y dependencias—,
`execution/` —ejecución— y `reconciliation/` —estado, resultados y
recuperación— cuando corresponda. `encoding/` contiene formatos, compromisos
y codecs compartidos.

Pruebas en `packages/backend/tests/execution/`.
