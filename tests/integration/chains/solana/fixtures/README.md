# Original Memo program

`spl_memo-3.0.0.so` is Agave's public artifact, not a new compilation. It is kept here so that the host tests do not depend on a historical private directory of the compiler.

- Source: https://raw.githubusercontent.com/anza-xyz/agave/5466f4592b1983adb13ba0a5d53f41ea2de69fba/program-test/src/programs/spl_memo-3.0.0.so
- Bytes: 74800.
- SHA256: `f520eaf096361abbb9639ea4dc3e5388a87b9330e121f476607b87c46ef67954`.

The test rechecks the hash against `MEMO_PROGRAM.codeSHA256` before you use the bytes. Host RPC responses remain synthetic; the artifact does not convert a host test into native acceptance.
