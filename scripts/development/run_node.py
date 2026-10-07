"""Run workspace entrypoints through the generated compatibility layout."""
import os
from pathlib import Path
import sys

from workspace import ROOT, RUNTIME, DEV, build, runtime_relative


def main():
    build(quiet=True)
    arguments = []
    testing = "--test" in sys.argv[1:]
    for argument in sys.argv[1:]:
        candidate = Path(argument)
        if not argument.startswith("-") and candidate.exists():
            absolute = candidate.absolute()
            if absolute.is_relative_to(ROOT):
                if testing and absolute.is_dir():
                    selected = sorted(absolute.rglob("*.test.mjs"))
                    if not selected:
                        raise SystemExit(f"No test files in {argument}")
                    for test in selected:
                        mapped = runtime_relative(str(test.relative_to(ROOT)))
                        if mapped is None:
                            raise SystemExit(f"Test file is outside the runtime map: {test}")
                        arguments.append(str(RUNTIME / mapped))
                    continue
                mapped = runtime_relative(str(absolute.relative_to(ROOT)))
                if mapped is not None:
                    argument = str(RUNTIME / mapped)
        arguments.append(argument)
    node = DEV / "toolchains/node-v24.19.0-linux-x64/bin/node"
    os.execv(node, [str(node), *arguments])


if __name__ == "__main__":
    main()
