# Infraestructura Google Cloud preparada localmente

Este directorio define la infraestructura futura. **No crea un proyecto** y
no se ha ejecutado `apply`, plan contra Google, login ni despliegue. El usuario
todavía no tiene proyecto. Todas las capacidades de despliegue están apagadas
por defecto; la validación local y las pruebas simuladas no usan credenciales.

## Validar desde un clon limpio

Python 3.12+ en Linux/WSL amd64. El helper instala Terraform 1.16.5 en `.internal`
verificando el SHA256 fijado y la lista oficial de HashiCorp. No instala gcloud,
autentica cuentas ni aplica infraestructura. El proveedor Google 8.6.0 y sus
checksums están fijados en `.terraform.lock.hcl`; `init` valida su firma.

```sh
python3 infra/google-cloud/scripts/prepare-tools.py
.internal/dev/toolchains/terraform-1.16.5-linux-amd64/terraform -chdir=infra/google-cloud init -backend=false -input=false
.internal/dev/toolchains/terraform-1.16.5-linux-amd64/terraform -chdir=infra/google-cloud fmt -check -recursive
.internal/dev/toolchains/terraform-1.16.5-linux-amd64/terraform -chdir=infra/google-cloud validate
.internal/dev/toolchains/terraform-1.16.5-linux-amd64/terraform -chdir=infra/google-cloud test
```

Resultado local: validate PASS y 6/6 pruebas de gates con proveedor simulado.
Las pruebas validan recursos y permisos declarados, no conectividad ni capacidad
real de Google. La réplica Docker y PostgreSQL real se prueban separadamente en
`apps/platform`.

## Recursos y condiciones de habilitación

| Control | Recurso | Condición |
| --- | --- | --- |
| `enable_foundation=false` | APIs, Artifact Registry, cuentas API/proof, SQL y metadatos del secreto | Proyecto existente elegido y futuro plan revisado |
| `enable_api=false` | Cloud Run API | Foundation, imagen por digest revisada, bridge económico probado, origen HTTPS y versiones numéricas de secretos SQL y privacidad existentes |
| `allow_public_api=false` | Invocación allUsers | API habilitada y revisión de admisión/abuso; la autenticación IAM móvil no está implementada |
| `enable_proof_jobs=false` | Cloud Run Jobs independientes | Map de imágenes reales por digest, comandos/args y recursos verificados; no hay imagen inventada por defecto |

La API usa puerto 8080, una CPU, 512 MiB, máximo dos instancias y concurrencia
8. El pool del bootstrap está limitado a 5 conexiones por instancia. Los probes
usan liveness/startup `/health/live` y readiness `/health/ready`; cada POST
comprueba readiness otra vez antes de admitir permisos. Con el bootstrap
actual, el adaptador económico está ausente y readiness devuelve 503. No sirve
habilitar el recurso con esta imagen para fingir una wallet completa.

Cloud SQL usa PostgreSQL 17, backup/PITR y protección frente a borrado. Se ha
definido un perfil zonal de preparación, sin afirmar disponibilidad de
producción. El tamaño y límites son explícitos. La IP pública sólo sirve como
transporte del conector autenticado Cloud SQL: no hay CIDR público autorizado.
Cloud Run monta su socket `/cloudsql/PROJECT:REGION:INSTANCE`; el conector
cifra el trayecto remoto. Para una topología de IP privada hace falta definir
VPC/egress por separado; esta configuración no pretende hacerlo ya.

La cuenta API tiene `roles/cloudsql.client` y acceso únicamente a los secretos
DATABASE_URL y `LIANUM_PLATFORM_PRIVACY_KEY`, en versiones numéricas fijadas.
El segundo es una clave HMAC de infraestructura para registros privados del
intake; no es una clave raíz móvil. Se conserva por separado junto a los
respaldos SQL; cambiarlo sin migración cierra el servicio y no resuelve UNKNOWN. La cuenta proof es distinta y no recibe esos secretos ni
claves de usuarios. Los jobs tienen una tarea, paralelismo uno, timeout acotado
y `max_retries=0`. No tienen scheduler, token de ejecución automática ni caller
con jobs.run. Los contratos de entradas/salidas privadas del worker y su IAM
requieren revisión con la imagen real antes de habilitarlos.

## Antes de un futuro despliegue

1. Elegir un proyecto existente, región, facturación y cuenta autorizada. Este
   módulo no crea proyecto ni activa facturación.
2. Seleccionar un backend remoto de estado con acceso limitado, revisando el
   plan de foundation. Por ahora el estado local, tfvars y planes se ignoran.
3. Aplicar foundation sólo cuando se autorice expresamente trabajar en Cloud.
   SQL y otros recursos generan costes; todos siguen apagados hoy.
4. Crear fuera de Terraform el usuario SQL de aplicación y sus permisos para
   el esquema, una versión del secreto DATABASE_URL y otra del secreto separado
   de privacidad (32 bytes aleatorios como 64 caracteres hexadecimales). El módulo sólo crea
   metadatos vacíos: no incluye contraseñas, claves, secret_version ni sql_user.
   Fijar `database_secret_version` y `privacy_secret_version`; guardar el mismo
   secreto de privacidad con los respaldos de intake y nunca regenerarlo para
   recuperar una autorización consumida.
   Para `pg`, el URL puede expresar el socket como parámetro `host` URL-encoded;
   codifica también usuario/contraseña. No guardes ese valor en tfvars/estado.
   Preparar por separado el comando de migración revisado de `apps/platform`
   antes de arrancar la API: el proceso normal verifica versión/checksums y
   nunca crea tablas. La ejecución local de ese comando no configura un job
   ni aplica cambios en Cloud.
5. Integrar y probar el bridge móvil → cuenta/keeper → backend → workers, con
   respuesta perdida/reinicio, estado final y privacidad real. Construir,
   verificar y publicar las imágenes reales por digest. Los flags `verified`
   son declaraciones del operador; validate no puede sustituir esas pruebas.
6. Configurar origen HTTPS y routing/certificado que coincidan exactamente con
   el origen firmado. Si se elige invocación pública, cerrar primero cuotas,
   abuso y retención. IAM privado permanece por defecto.
7. Revisar un plan con tfvars privados y recursos habilitados. Sólo entonces
   ejecutar el apply aprobado y comprobar readiness, secretos y recuperación.

Los comandos de un futuro plan/apply con proyecto y cuenta reales **no se han
ejecutado**. `example.tfvars` documenta defaults apagados y no contiene secretos.
No hay una fecha ni coste calculado de despliegue porque faltan esos inputs.

## Fuentes oficiales

- [HashiCorp: Terraform 1.16.5 y checksums](https://releases.hashicorp.com/terraform/1.16.5/).
- [Terraform: tests con provider mocking](https://developer.hashicorp.com/terraform/language/tests/mocking).
- [Google: Cloud Run conectado a PostgreSQL con socket/IAM](https://docs.cloud.google.com/sql/docs/postgres/connect-run).
- [Google: probes de startup, liveness y readiness](https://docs.cloud.google.com/run/docs/configuring/healthchecks).
- [Proveedor Google: esquema de recursos](https://registry.terraform.io/providers/hashicorp/google/8.6.0/docs).

El esquema instalado del proveedor se inspeccionó para validar los campos de
servicio, job, SQL, secretos y probes. Sólo la validación en un proyecto real
podrá confirmar la topología remota, organización/IAM y políticas de esa cuenta.
