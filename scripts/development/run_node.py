"""Run editable sources directly; --legacy explicitly selects the compatibility layout."""
import os
from pathlib import Path
import sys

from workspace import ROOT, RUNTIME, DEV, build, runtime_relative
from source_runtime import prepare


def main():
    incoming = sys.argv[1:]
    legacy = bool(incoming and incoming[0] == '--legacy')
    if legacy:
        incoming = incoming[1:]
        build(quiet=True)
    else:
        prepare(quiet=True)
    arguments = []
    testing = "--test" in incoming
    for argument in incoming:
        candidate = Path(argument)
        if not argument.startswith("-") and candidate.exists():
            absolute = candidate.absolute()
            if absolute.is_relative_to(ROOT):
                if testing and absolute.is_dir():
                    selected = sorted(absolute.rglob("*.test.mjs"))
                    if not selected:
                        raise SystemExit(f"No test files in {argument}")
                    for test in selected:
                        if not legacy:
                            arguments.append(str(test))
                            continue
                        mapped = runtime_relative(str(test.relative_to(ROOT)))
                        if mapped is None:
                            raise SystemExit(f"Test file is outside the runtime map: {test}")
                        arguments.append(str(RUNTIME / mapped))
                    continue
                mapped = runtime_relative(str(absolute.relative_to(ROOT))) if legacy else None
                if mapped is not None:
                    argument = str(RUNTIME / mapped)
                elif not legacy:
                    argument = str(absolute)
        arguments.append(argument)
    node = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
    os.chdir(ROOT)
    os.execv(node, [str(node), *arguments])


if __name__ == "__main__":
    main()
