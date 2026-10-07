# Privacidad, custodia y operación

Estos criterios forman parte del producto y de sus aceptaciones. La presencia
de pruebas ZK, claves distintas o cifrado en reposo no demuestra por sí sola
privacidad de sistema ni operadores independientes.

## Fronteras actuales

| Componente | Información o autoridad que recibe hoy | Límite de la aceptación |
| --- | --- | --- |
| Wallet web local | Vista privada del owner y permisos manuales originales del laboratorio | No acredita custodia nativa en un teléfono |
| Wallet móvil | Clave secp256k1 protegida por el sistema operativo; permisos revisados y operación pendiente | La clave entra temporalmente en memoria JavaScript; aislamiento y recuperación en dispositivo pendientes |
| API móvil | Clave pública estable, origen, acción, red, activo, importe, destino, comisión, ID y caducidad | Puede correlacionar propietario y operaciones; no recibe la clave privada |
| PostgreSQL de platform | Challenges, términos y resultados de admisión, con consumo único duradero | `ADMITTED` no acredita reserva, ejecución ni liquidación |
| Workers locales originales | Testigos privados y statements del job acotado por rol mediante IPC | El worker y su host ven el testigo; la separación de procesos no oculta esa información al operador |
| Adaptadores y RPC nativos | Transacciones públicas, importes, destinos, tiempos, conexiones y finalidad | Sus observaciones requieren comprobar identidad y cadena canónica; una respuesta ausente no equivale a cero |
| Operadores y ejecutor del laboratorio | Autoridades originales separadas y liquidez sintética del solver | Un único host sigue siendo un supuesto de confianza común |

La API de platform se inicia con su executor económico sin conectar. La
disponibilidad real requiere persistencia sana y un adaptador original comprobado.
El contrato público publica `privatePortfolio: null` mientras falta la vista
privada autenticada. No debe exponerse una vista de owner mediante un endpoint
de disponibilidad pública.

## Qué debe conservar cada integración

1. La custodia autoriza límites explícitos sobre el ID original. Un challenge
   móvil no sustituye la firma de un frame Noir ni habilita una capability del
   laboratorio. El puente económico debe verificar ambas fronteras.
2. El journal registra el intento antes del primer efecto externo. Tras un crash
   o respuesta perdida, se observa el original. No se crea otro nonce,
   transacción o pago para resolver un resultado desconocido.
3. Confirmar exige transacción, términos, inclusión canónica, respaldo y deltas
   propios del protocolo. Nunca se inventa un saldo disponible a partir de un
   log, una cotización o una posición pública.
4. Una recuperación respeta las entregas nativas que ya finalizaron. El informe
   debe mostrar reserva devuelta, cambios, entrega externa y pérdida/obligación
   del solver por separado; recuperar una nota no deshace una transferencia.
5. Las claves raíz y los testigos privados no pertenecen al Terraform, imagen
   pública, log HTTP, traceback público ni variables `EXPO_PUBLIC_*`. Un trabajo
   de prueba en Cloud requiere un contrato de entrega/caducidad y borrado del
   testigo; ese transporte Cloud aún no está implementado.

## Aceptación de privacidad pendiente

Definir y comprobar observadores separados: operador de API, worker, RPC,
cadena pública, servicio de almacenamiento, red y dispositivo. Incluir colusión
y relacionar financiación, autorización, ejecución, salida y recuperación por
importe, tiempo, identidad pública y patrón de consultas. Las cantidades y
claves públicas del contrato móvil actual son visibles para la API.

El transporte y las credenciales del futuro estado privado requieren permisos
por rol y separación de acceso. Eliminar cantidades de logs limita exposición,
pero no evita que el servicio vea los mensajes que necesita procesar. No se
atribuye anonimato al cliente actual ni a un worker centralizado.

Se necesita revisión criptográfica independiente de circuitos, verificadores,
framing, fuentes fijadas y manejo de testigos. Los tests internos y los
laboratorios sintéticos no sustituyen esa revisión.

## Rendimiento y disponibilidad

La aceptación integrada debe publicar hardware, versiones, carga y medidas
separadas de inicialización, testigo, prueba, verificación, coordinación,
observación y finalidad nativa. Conservar resultados en frío y en caliente,
mediana, percentil 95 y máximo. El número de pruebas correctas no mide latencia.

Los objetivos originales en caliente son sobrecoste propio total menor de 30 s,
pruebas menor de 20 s y coordinación/liquidación menor de 5 s, con finalidad
nativa separada y sin esperas artificiales. Los diagnósticos de compilación o
las transferencias sin ZK no demuestran esos objetivos.

La preparación EVM actual inicia Barretenberg para generar/verificar la VK; su
tiempo de arranque no debe ocultarse como rendimiento en caliente. Reutilizar un
worker requiere conservar la asociación exacta de job, rol, statement y VK, y
eliminar testigos entre trabajos. No se reducirán comprobaciones para mejorar
la cifra.

La operación Cloud se prepara localmente. Todavía no hay proyecto GCP ni
despliegue. Las imágenes, permisos, secretos, persistencia, backups, límites y
readiness requieren validación del servicio real antes de habilitar fondos.
Los proof jobs permanecen deshabilitados hasta disponer de esa integración.

Fuentes de requisitos: [visión original](../archive/delivery/PROJECT-VISION.md).
Las aceptaciones actuales se registran en [STATUS.md](../STATUS.md),
[laboratorio EVM](EVM-LAB.md) y
[redes/DeFi](../packages/backend/docs/LOCAL-ACCEPTANCE.md).
