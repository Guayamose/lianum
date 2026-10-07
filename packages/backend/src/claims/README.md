# Reclamaciones nativas

`authorization/` reúne admisiones, permisos y autoridades;
`controller/` compone llamadas y estado del controlador;
`ingress/` trata la entrada y el registro;
`payouts/` controla pagos y quorum;
`storage/` conserva registros y sesiones de vault;
`operations/` agrupa operadores, auditoría y vistas de cartera;
y `protocol/` define ABI, framing y datos de entrada.

`wrapped/` contiene las variantes wrapped con la misma separación funcional,
incluida su recuperación. Pruebas en `packages/backend/tests/claims/`.
