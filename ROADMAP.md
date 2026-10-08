# Trabajo hasta una base integrada

Actualizado el 8 de octubre de 2026. Conserva los seis pasos solicitados. Cada
aceptación se registra con su alcance en [STATUS.md](STATUS.md); una prueba
aislada no cierra un punto entero del producto.

## 1. Base fiable — implementada

La importación está dividida por componentes y los cambios funcionales tienen
commits separados con motivo y validación. La selección habitual pasa: 244
resultados. Los originales ausentes de encoding están inventariados;
no se omiten sus pruebas ni se fabrican originales.

El bootstrap y los comandos CI se comprueban en una copia con sólo archivos
versionados y paquetes públicos. CI reconoce las 933 referencias públicas
excluidas y comprueba el resto. No hay remoto ni ejecución remota de CI.

## 2. Reconciliación nativa — implementada

`native-value-execution-v2.mjs` reconoce la recuperación terminal conservada
antes de esperar al adaptador. Las regresiones incluyen un adaptador que nunca
responde y terminales inválidos. Se conservan identidad, transacción, inclusión
canónica, respaldo y estado; la incertidumbre no autoriza otro envío.

La demostración económica con prueba F real pertenece también al siguiente paso.

## 3. Completar el recorrido EVM — en curso

Usar [el laboratorio nuevo](docs/EVM-LAB.md): financiación, consentimiento,
reserva, prueba real, ejecución y actualización de estado. Conservar el mismo ID
y journal ante respuesta HTTP perdida y reinicio.

El harness usa SDK, HTTP y el modelo de revisión compartido de la wallet. Debe
declarar ese alcance; no demuestra interacción visual en navegador. Completar
recuperación F real con entrega parcial, ejecución original incierta y ausencia
del owner, sin segundo envío o crédito. Publicar deltas privados, respaldo,
entrega nativa y pérdida/obligación del solver por separado.

Después comprobar la interfaz visible y conectarla a la misma sesión/cuenta.

## 4. Redes y operaciones combinadas — parcial

- Solana: ingreso y solver aceptados en Agave nuevo. Completar payout con
  autoridad original, cuenta privada, reinicio y recuperación.
- Bitcoin: ingreso y solver aceptados en Core nuevo. Completar controlador original de
  claims, gasto, backing, reorganizaciones y recuperación.
- Tron: el parche offline conserva `assertOffline` y el candidato ya produce
  consenso y un único broadcast. Diagnosticar finalidad pending y cierre SIGABRT. Mantener
  el gate canónico cerrado hasta esa aceptación.
- Base, Arbitrum y BNB: aceptar stacks y finalidad propios. Otro chainId en Anvil
  no acredita OP Stack, Nitro ni BSC.
- Componer rutas con el mismo PAEG, estado y journal, verificando entregas
  parciales y asignación económica del fallo.

CI51 V3 y CO42 ya tienen un build y manifiesto nuevos revisados, con las VK
originales. Aceptar el round trip privado con ocho pruebas genuinas antes de
extenderlo a grafos y pérdida de procesos. No presentar
reconstrucciones como los recibos históricos ausentes.

## 5. Completar DeFi — parcial

Ya se comprueban swap oficial Uniswap V3, depósito/redención oficial MetaMorpho
y controles atómicos de mínimo, plazo y replay. El puente exige retiro privado,
cuenta, capability y backing originales.

MetaMorpho ya acepta nota privada en shares, EXIT y redención oficial con dos
pruebas reales en estado nuevo. La fuente de shares de ese perfil es un depósito
público explícito. Completar la entrada privada desde Uniswap/MetaMorpho, acción,
posición y recuperación con las autoridades originales. Reabrir tras pérdida de keeper/nodo conservando el primer envío. Ampliar
después Aave, Morpho y Jupiter; una posición pública no crea saldo privado.

## 6. Móvil y operación — fundamentos implementados

Existen cliente nativo, protocolo compartido, API, PostgreSQL, Docker y
Terraform. Google Cloud se prepara sólo localmente: todavía no hay proyecto.
La infraestructura y los jobs permanecen apagados.

Conectar permiso móvil a identidad, cuenta, keeper y worker originales; mostrar
estado privado autenticado y resolver UNKNOWN sin repetir efectos. Completar
recuperación de custodia/outbox, build instalable, biometría y aceptación física.
Exportar bundles no acredita hardware ni una wallet financiada.

Cerrar migraciones SQL versionadas, permisos/retención, límites duraderos de
admisión, transporte privado de jobs y observabilidad. Verificar imágenes y
contratos reales antes de habilitar workers. Un despliegue GCP con proyecto,
cuenta y costes concretos sigue siendo una acción futura separada.

Reducir por componentes `.internal/runtime/`, extraer recursos/dependencias
compartidas y consolidar variantes en los recorridos aceptados.

## Criterios durante todos los pasos

[Privacidad y operación](docs/PRIVACY-AND-OPERATIONS.md) describe observadores,
autoridades e información visible. Verificar colusión y correlación por importe,
tiempo y RPC. Procesos separados en un host no prueban operadores independientes.
Requiere revisión criptográfica externa.

Medir frío/caliente, hardware, carga y percentiles. Objetivos originales en
caliente: sobrecoste propio <30 s, pruebas <20 s y coordinación/liquidación <5 s,
sin esperas artificiales y con finalidad nativa separada. Conservar las
validaciones al medir y optimizar.
