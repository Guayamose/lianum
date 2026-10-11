# Ubicaciones y ejecución desde fuentes

`sourcePath` y `sourceURL` localizan las fuentes activas. `resourceRoot(family)`
y `resourcePath(family, relative)` localizan recursos separados de esas fuentes.
Las familias son `engine`, `wallet`, `crypto`, `components` y `protocol`.
`legacyDataRoot` conserva su API y delega en `resourceRoot`.

En el checkout habitual los recursos conservan su ubicación histórica. En un
candidato generado por `scripts/development/source_bundle.py`, el descriptor
`runtime-resources.json` los sitúa bajo `resources/`, sin recurrir a
`.internal/runtime`. El descriptor viaja con las fuentes y funciona también
cuando un worker elimina las variables del entorno heredado.

El empaquetador conserva los bytes de las fuentes, sigue sus imports literales,
resuelve exports de los workspaces y crea un único enlace por paquete. Los
módulos cargados mediante expresiones o enumeración de directorios deben
declararse con `--include-source`. No transforma rutas ni pins de una generación
histórica. El manifiesto resultante registra exactamente ese alcance.

## Recursos externos

El manifiesto de entrada tiene este formato. Cada SHA-256 debe proceder del
recurso público seleccionado y revisado; el empaquetador comprueba que los bytes
disponibles coinciden antes de publicar el directorio candidato.

```json
{
  "schema": "LIANUM_EXTERNAL_RESOURCES_V1",
  "files": [
    {
      "source": "node/bin/node",
      "path": "tools/node",
      "scope": "resources",
      "kind": "toolchain",
      "sha256": "<SHA-256 esperado del ejecutable>",
      "mode": "0755"
    }
  ]
}
```

`source` es relativo al directorio externo pasado al comando. `path` es relativo
a `resources/` cuando `scope` es `resources`. Para dependencias npm normales,
`scope: "dependency"` exige `kind: "npm-package"` y un `path` que empiece por
`node_modules/`; se declara y comprueba cada archivo, incluidas dependencias
transitivas. Las librerías oficiales que los validadores existentes buscan en
una familia histórica se declaran con `scope: "resources"` y su ruta exacta
dentro de esa familia.

Los tipos admitidos son `toolchain`, `public-parameter`, `public-artifact`,
`historical-source` y `npm-package`. El comando no busca ni copia directorios
privados, credenciales, journals, witnesses o sesiones. El manifiesto debe
enumerar solamente recursos públicos. Se rechazan enlaces simbólicos de entrada
y destinos duplicados. No se descargan recursos ni se recompilan pruebas o keys;
una ausencia o un hash distinto cancela la creación y conserva el original.

## Construcción y ejecución

```sh
python3 scripts/development/source_bundle.py build \
  --entry packages/proofs/src/jobs/role-process.mjs \
  --include-source packages/proofs/src \
  --resources /ruta/publica/worker-resources.json \
  --resource-root /ruta/publica/recursos \
  --node-resource tools/node \
  --cwd-family wallet \
  --output /ruta/candidatos/worker-v1

python3 /ruta/candidatos/worker-v1/run-source-bundle.py verify
python3 /ruta/candidatos/worker-v1/run-source-bundle.py run \
  --expected-sha256 HASH_DEL_MANIFIESTO_CANDIDATO -- authorization
```

El destino debe ser nuevo. `--state-directory` permite declarar directorios
relativos a `resources/` donde un worker escribirá su estado; nunca pueden
contener recursos fijados por el manifiesto. El launcher vuelve a comprobar
fuentes, recursos, permisos y enlaces antes de ejecutar directamente el Node
incluido. Mantiene los argumentos del worker y entrega únicamente `LANG` y
`PATH`, sin introducir un módulo envolvente ni argumentos adicionales de Node.
Python y las librerías del sistema requeridas por el ejecutable son prerrequisitos
del host; Node y las dependencias del programa son recursos explícitos.

Una creación correcta produce un **candidato**, con `financialAcceptance: false`.
Los controles originales de supervisor, capacidades, pins, custodia y release
siguen activos: un rol que exige un supervisor no se puede ejecutar aisladamente,
y una generación que exige rutas o hashes históricos puede rechazar este candidato.
La lista de fuentes y recursos de cada worker requiere una revisión de sus cargas
dinámicas; la presencia del bundle no afirma haber ejecutado todos sus recorridos.

La prueba offline `test_source_bundle.py` ejecuta un worker desde un checkout
mínimo sin `.internal`, tras trasladar el candidato y eliminar el checkout. También
verifica identidad única de módulos, reproducibilidad del manifiesto, recursos
ausentes o alterados, archivos adicionales, enlaces modificados y estado declarado.
