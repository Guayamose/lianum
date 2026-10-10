"""Translate relative ESM specifiers between workspace and runtime layouts.

Quoted imports, module mocks and literal source-resource URLs are translated.
Artifact/state paths retain their original meaning. Per-file spellings keep the
initial import transformation reversible; unchanged resource spellings are kept
byte-for-byte for consumers with frozen source hashes.
"""
import posixpath
import re
from pathlib import Path

SPECIFIER = re.compile(r"(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|\bmock\.module\(\s*)(['\"])((?:\.|@lianum/)[^'\"\r\n]+)\1")
RESOURCE = re.compile(r"\bnew\s+URL\(\s*(['\"])(\.[^'\"\r\n]+)\1\s*,\s*import\.meta\.url\s*\)")


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

    def replace(match, resource=False):
        specifier = match.group(2)
        if specifier.startswith('@lianum/'):
            if direction != 'runtime':
                return match.group(0)
            target = config.get('_workspaceExports', {}).get(specifier)
            if target is None:
                raise RuntimeError(f'Unknown public workspace import: {specifier}')
            mapped = map_path(target, config, direction)
            if mapped is None:
                raise RuntimeError(f'Public workspace import has no compatibility path: {specifier}')
            old = posixpath.relpath(target, posixpath.dirname(source))
            if not old.startswith('.'):
                old = './' + old
            converted = (original_spellings or {}).get(old)
            if converted is None:
                converted = posixpath.relpath(mapped, posixpath.dirname(destination))
                if not converted.startswith('.'):
                    converted = './' + converted
        elif not resource and direction == "runtime" and specifier in (original_spellings or {}):
            converted = original_spellings[specifier]
        else:
            target = posixpath.normpath(posixpath.join(posixpath.dirname(base), specifier))
            if resource and direction == 'runtime':
                # Only real source references are relocated. Artifact/state paths
                # are handled by their explicit resource configuration instead.
                known = target in path_indexes(config)['runtime']
                directory = config.get('_workspaceRoot')
                present = (directory and not target.startswith('../') and
                           (Path(directory) / target).exists())
                if not known and not present:
                    return match.group(0)
            mapped = map_path(target, config, direction)
            if mapped is None:
                return match.group(0)
            converted = posixpath.relpath(mapped, posixpath.dirname(destination))
            if not converted.startswith("."):
                converted = "./" + converted
        if resource:
            if posixpath.normpath(specifier) == posixpath.normpath(converted):
                converted = specifier
            elif specifier.endswith('/') and not converted.endswith('/'):
                converted += '/'
        if direction == "workspace" and not resource:
            if converted in spellings and spellings[converted] != specifier:
                raise RuntimeError(f"Non-reversible import spelling in {runtime}: {converted}")
            spellings[converted] = specifier
        start, end = match.span(2)
        return match.group(0)[:start - match.start()] + converted + match.group(0)[end - match.start():]

    result = SPECIFIER.sub(replace, text)
    return RESOURCE.sub(lambda match: replace(match, True), result), spellings
