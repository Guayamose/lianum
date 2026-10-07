"""Translate relative ESM specifiers between workspace and runtime layouts.

Only quoted relative import/export specifiers are translated. Filesystem paths,
source-pinning data and executable statements retain their original meaning in
the runtime. Per-file spellings keep the initial transformation reversible.
"""
import posixpath
import re

SPECIFIER = re.compile(r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['\"])(\.[^'\"\r\n]+)\1")


def path_indexes(config):
    if "_pathIndexes" not in config:
        config["_pathIndexes"] = {
            "workspace": {row["path"]: row["source"] for row in config["files"]},
            "runtime": {row["source"]: row["path"] for row in config["files"]},
        }
    return config["_pathIndexes"]


def map_path(path, config, direction):
    # Several domain folders can correspond to one formerly flat directory.
    # Resolve known files exactly before using directory rules for new files.
    suffix_match = re.search(r"[?#].*$", path)
    suffix = suffix_match.group(0) if suffix_match else ""
    path = path[:-len(suffix)] if suffix else path
    exact = path_indexes(config)[direction].get(path)
    if exact is not None:
        return exact + suffix
    incoming, outgoing = ("runtime", "source") if direction == "workspace" else ("source", "runtime")
    for rule in sorted(config["rules"], key=lambda row: len(row[incoming]), reverse=True):
        prefix = rule[incoming].rstrip("/")
        if path == prefix or (rule[incoming].endswith("/") and path.startswith(prefix + "/")):
            return rule[outgoing].rstrip("/") + path[len(prefix):] + suffix
    return None


def translate(text, source, runtime, config, direction, original_spellings=None):
    base = runtime if direction == "workspace" else source
    destination = source if direction == "workspace" else runtime
    spellings = {}

    def replace(match):
        specifier = match.group(2)
        if direction == "runtime" and specifier in (original_spellings or {}):
            converted = original_spellings[specifier]
        else:
            target = posixpath.normpath(posixpath.join(posixpath.dirname(base), specifier))
            mapped = map_path(target, config, direction)
            if mapped is None:
                return match.group(0)
            converted = posixpath.relpath(mapped, posixpath.dirname(destination))
            if not converted.startswith("."):
                converted = "./" + converted
        if direction == "workspace":
            if converted in spellings and spellings[converted] != specifier:
                raise RuntimeError(f"Non-reversible import spelling in {runtime}: {converted}")
            spellings[converted] = specifier
        start, end = match.span(2)
        return match.group(0)[:start - match.start()] + converted + match.group(0)[end - match.start():]

    return SPECIFIER.sub(replace, text), spellings
