"""Closed native error handling; HTTP replies here are synthetic, not finality."""
import ast
import copy
import hashlib
import http.server
import json
import os
import stat
import tempfile
import types
from unittest import mock
import pathlib
import re
import threading
import unittest
import urllib.request


class OriginalReceiptIndexTest(unittest.TestCase):
    def test_original_receipt_index_is_pending_without_accepting_other_errors(self):
        source = pathlib.Path(__file__).with_name("owned_bsc_posa_v1.py")
        tree = ast.parse(source.read_text())
        functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                     and node.name in ("require", "rpc")]
        self.assertEqual([node.name for node in functions], ["require", "rpc"])
        context = {"json": json, "re": re, "urllib": urllib}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), context)
        reply = {"jsonrpc": "2.0", "id": 1, "error": {
            "code": -32000, "message": "transaction indexing is in progress",
            "data": "transaction indexing is in progress"}}
        requests = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                requests.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
                body = json.dumps(reply).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_):
                pass

        server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = "http://127.0.0.1:" + str(server.server_port)
            tx_hash = "0x" + "12" * 32
            rpc = context["rpc"]
            self.assertIsNone(rpc(url, "eth_getTransactionReceipt", [tx_hash]))
            for method, params in [("eth_sendRawTransaction", [tx_hash]),
                                   ("eth_getBlockByNumber", ["finalized", False]),
                                   ("eth_getTransactionReceipt", []),
                                   ("eth_getTransactionReceipt", ["caller-dto"])]:
                with self.assertRaisesRegex(RuntimeError, "^BSC_RPC_REJECTED$"):
                    rpc(url, method, params)
            for change in [lambda: reply.update(id=2),
                           lambda: reply["error"].update(code=-32603),
                           lambda: reply["error"].update(data="other")]:
                reply.update(id=1)
                reply["error"].update(code=-32000, data="transaction indexing is in progress")
                change()
                with self.assertRaisesRegex(RuntimeError, "^BSC_RPC_REJECTED$"):
                    rpc(url, "eth_getTransactionReceipt", [tx_hash])
            reply.clear()
            reply.update(jsonrpc="2.0", id=1, result={"status": "0x1", "blockNumber": "0x3"})
            self.assertEqual(rpc(url, "eth_getTransactionReceipt", [tx_hash]), reply["result"])
            self.assertEqual(len(requests), 9)
            self.assertEqual(sum(r["method"] == "eth_sendRawTransaction" for r in requests), 1)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


class OriginalNativeInitializationGenesisTest(unittest.TestCase):
    def test_native_initializer_reuses_original_votes_without_duplicate_storage(self):
        source = pathlib.Path(__file__).with_name("owned_bsc_posa_v1.py")
        tree = ast.parse(source.read_text())
        names = {"PINS", "PROFILE", "NATIVE_V1_EXTRA_LAYOUT_SHA256",
                 "NATIVE_V1_EXTRA_ARRAY_SLOT", "NATIVE_V1_EXTRA_VOTE_SLOTS"}
        nodes = [node for node in tree.body
                 if (isinstance(node, ast.FunctionDef) and node.name in
                     ("require", "digest", "native_init_genesis_v2")) or
                 (isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
                  and target.id in names for target in node.targets))]
        context = {"hashlib": hashlib, "json": json, "re": re}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), context)
        # The already prepared official fixture is read, never regenerated or
        # modified. These public lab keys are unrelated to application custody.
        repository = next(parent for parent in source.resolve().parents
                          if (parent / "package.json").is_file() and
                          (parent / ".local/dependencies/bsc-posav1/prepared/receipt.json").is_file())
        prepared = repository / ".local/dependencies/bsc-posav1/prepared"
        original = (prepared / "genesis.json").read_bytes()
        receipt = json.loads((prepared / "receipt.json").read_bytes())
        original_hash = hashlib.sha256(original).hexdigest()
        convert = context["native_init_genesis_v2"]
        transformed = convert(original, receipt)
        old = json.loads(original)
        expected = copy.deepcopy(old)
        contract = "0x" + "0" * 36 + "1000"
        self.assertEqual(len(expected["alloc"][contract]["storage"]), 10)
        del expected["alloc"][contract]["storage"]
        self.assertEqual(json.loads(transformed), expected)
        self.assertEqual((prepared / "genesis.json").read_bytes(), original)
        self.assertEqual(hashlib.sha256(original).hexdigest(), original_hash)
        self.assertEqual(sum(bool(row.get("code")) for row in expected["alloc"].values()), 17)
        self.assertEqual(convert(original, receipt), transformed)
        for tamper in ("foreign-slot", "different-original-vote"):
            changed = copy.deepcopy(old)
            slots = changed["alloc"][contract]["storage"]
            if tamper == "foreign-slot":
                slots["0x" + "00" * 31 + "ff"] = "0x" + "00" * 32
            else:
                slots[context["NATIVE_V1_EXTRA_VOTE_SLOTS"][0][1]] = "0x" + "00" * 32
            body = json.dumps(changed, sort_keys=True, separators=(",", ":")).encode()
            bound = copy.deepcopy(receipt)
            bound["genesisSHA256"] = hashlib.sha256(body).hexdigest()
            with self.assertRaisesRegex(RuntimeError, "^BSC_NATIVE_INIT_ORIGINAL_STORAGE_CHANGED$"):
                convert(body, bound)
        wrong_layout = copy.deepcopy(receipt)
        wrong_layout["nativeGenesis"]["layoutSHA256"] = "00" * 32
        with self.assertRaisesRegex(RuntimeError, "^BSC_NATIVE_INIT_LAYOUT_REQUIRED$"):
            convert(original, wrong_layout)


class OriginalNativeGenesisDiffTest(unittest.TestCase):
    def test_original_genesis_allocation_forms_preserve_accounts_and_deny_alias(self):
        source = pathlib.Path(__file__).with_name('bsc_original_genesis_v3.py')
        tree = ast.parse(source.read_text())
        nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
                 and node.name in {'need', 'normalize_allocation'}]
        class OriginalGuard:
            @staticmethod
            def require(value, code):
                if not value:
                    raise RuntimeError(code)
        context = {'copy': copy, 're': re, 'bsc': OriginalGuard}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), context)
        root = next(parent for parent in source.resolve().parents
                    if (parent / 'scripts/layout.json').is_file() and (parent / 'package.json').is_file())
        # The physically retained original V2 genesis is input only. This test
        # creates no process, trace, registration, funded account or finality.
        original = json.loads((root / '.local/dependencies/bsc-posav1/prepared-native-init-v2/genesis.json').read_text())['alloc']
        self.assertEqual(sum(bool(re.fullmatch(r'[0-9a-fA-F]{40}', key)) for key in original), 3)
        normalized = context['normalize_allocation'](original)
        self.assertEqual(len(normalized), len(original))
        for key, row in original.items():
            target = '0x' + key.removeprefix('0x').lower()
            self.assertEqual(normalized[target], row)
            self.assertIsNot(normalized[target], row)
        self.assertEqual(sum(bool(row.get('code')) for row in normalized.values()), 17)
        fixture_key = next(key for key in original if re.fullmatch(r'[0-9a-fA-F]{40}', key))
        alias = copy.deepcopy(original)
        alias['0x' + fixture_key] = copy.deepcopy(original[fixture_key])
        with self.assertRaisesRegex(RuntimeError, '^BSC_GENESIS_ORIGINAL_ALLOCATION_ALIAS$'):
            context['normalize_allocation'](alias)
        with self.assertRaisesRegex(RuntimeError, '^BSC_GENESIS_ORIGINAL_ALLOCATION$'):
            context['normalize_allocation']({'0x01': {}})

    def test_original_fixture_copy_creates_private_root_before_first_file(self):
        # Real private filesystem + the actual copy/write guards; fixture bytes
        # are explicitly inert. No native process, validator or trace is born.
        source = pathlib.Path(__file__).with_name('bsc_original_genesis_v3.py')
        tree = ast.parse(source.read_text())
        produce = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
                       and node.name == 'produce')
        index = next(i for i, node in enumerate(produce.body)
                     if isinstance(node, ast.For) and isinstance(node.iter, ast.Call)
                     and isinstance(node.iter.func, ast.Attribute)
                     and node.iter.func.attr == 'rglob')
        copy_body = produce.body[index - 2:index + 1]
        self.assertEqual(len(copy_body), 3)
        recipe = source.with_name('owned_bsc_posa_v1.py')
        helpers = [node for node in ast.parse(recipe.read_text()).body
                   if isinstance(node, ast.FunctionDef) and node.name in
                   {'require', 'private_file', 'write', 'directory', 'private_directory'}]
        ports = {'os': os, 'stat': stat, 'pathlib': pathlib}
        exec(compile(ast.Module(body=helpers, type_ignores=[]), str(recipe), 'exec'), ports)
        original = types.SimpleNamespace(**ports)
        with tempfile.TemporaryDirectory() as temporary:
            base = pathlib.Path(temporary)
            prepared, work = base / 'prepared', base / 'work'
            original.directory(prepared)
            original.directory(work)
            original.directory(prepared / 'keys')
            original.write(prepared / 'keys' / 'inert-first', b'original-file-first')
            original.directory(prepared / 'keys' / 'nested')
            original.write(prepared / 'keys' / 'nested' / 'inert-second', b'original-nested-file')
            retained = list((prepared / 'keys').rglob('*'))
            # Native rglob has no root/ordering guarantee: exercise file-first.
            first = next(path for path in retained if path.is_file()
                         and path.parent == prepared / 'keys')
            retained = [first] + [path for path in retained if path != first]
            self.assertTrue(retained[0].is_file())
            context = {'bsc': original, 'prepared': prepared, 'work': work}
            program = compile(ast.Module(body=copy_body, type_ignores=[]), str(source), 'exec')
            with mock.patch.object(pathlib.Path, 'rglob', return_value=retained):
                exec(program, context)
            for path in retained:
                target = work / path.relative_to(prepared)
                self.assertEqual(target.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)
                if path.is_file():
                    self.assertEqual(target.read_bytes(), path.read_bytes())
            self.assertEqual((work / 'keys').stat().st_mode & 0o777, 0o700)
            with self.assertRaises(FileExistsError):
                exec(program, context)
            # A caller-created symlink is rejected before target creation.
            other = base / 'foreign'
            original.directory(other)
            (other / 'keys').symlink_to(prepared / 'keys', target_is_directory=True)
            second = base / 'second'
            original.directory(second)
            with self.assertRaisesRegex(RuntimeError, '^BSC_PRIVATE_DIRECTORY$'):
                exec(program, {'bsc': original, 'prepared': other, 'work': second})
            self.assertFalse((second / 'keys').exists())

    def test_original_diff_keeps_unchanged_fields_and_rejects_foreign_seed(self):
        # Tracer replies here are explicitly synthetic. This case checks the
        # source fold/guards, and does not establish native BLS or finality.
        source = pathlib.Path(__file__).with_name("bsc_original_genesis_v3.py")
        tree = ast.parse(source.read_text())
        names = {"need", "sha", "fold_diff", "validate_seed"}
        nodes = [node for node in tree.body if
                 (isinstance(node, ast.FunctionDef) and node.name in names) or
                 (isinstance(node, ast.Assign) and any(isinstance(target, ast.Name)
                  and target.id in {"HEX", "ADDRESS"} for target in node.targets))]
        class OriginalGuard:
            @staticmethod
            def require(value, code):
                if not value:
                    raise RuntimeError(code)
        context = {"copy": copy, "re": re, "hashlib": hashlib, "bsc": OriginalGuard}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), context)
        account = "0x" + "12" * 20
        slot1, slot2 = "0x" + "11" * 32, "0x" + "22" * 32
        old_word, new_word = "0x" + "00" * 31 + "01", "0x" + "00" * 31 + "02"
        state = {account: {"balance": "0x20", "nonce": 1, "code": "0x6000",
                           "storage": {slot1: old_word, slot2: old_word}}}
        diff = {"pre": {account: {"balance": "0x20", "nonce": 1, "code": "0x6000",
                                   "storage": {slot1: old_word, slot2: old_word}}},
                "post": {account: {"nonce": 2, "storage": {slot1: new_word}}}}
        result = context["fold_diff"](state, diff)
        self.assertEqual(result[account], {"balance": "0x20", "nonce": 2, "code": "0x6000",
                                           "storage": {slot1: new_word}})
        self.assertEqual(state[account]["storage"][slot2], old_word)
        foreign = copy.deepcopy(diff)
        foreign["pre"][account]["storage"][slot1] = new_word
        with self.assertRaisesRegex(RuntimeError, "^BSC_GENESIS_DIFF_PRESTATE_CHANGED$"):
            context["fold_diff"](state, foreign)
        destroyed = copy.deepcopy(diff)
        destroyed["post"].clear()
        with self.assertRaisesRegex(RuntimeError, "^BSC_GENESIS_ORIGINAL_ACCOUNT_DESTROYED$"):
            context["fold_diff"](state, destroyed)
        original = {"timestamp": "0x01", "config": {"chainId": 714}, "alloc": {}}
        for index in range(17):
            original["alloc"]["0x" + format(0x1000 + index, "040x")] = {"balance": "0x00", "code": "0x6000"}
        original["alloc"][account] = {"balance": "0x30"}
        codes = {key: context["sha"](bytes.fromhex(row["code"][2:])) for key, row in original["alloc"].items() if row.get("code")}
        seeded = copy.deepcopy(original)
        credits = {"0x" + format(0x9000 + i, "040x"): "0x6001" for i in range(3)}
        seeded["alloc"][account]["balance"] = "0x00"
        seeded["alloc"].update({key: {"code": code, "balance": "0x10"} for key, code in credits.items()})
        context["validate_seed"](original, seeded, codes, credits)
        for field, code in [("timestamp", "BSC_GENESIS_GENESIS_TERMS_CHANGED"),
                            ("value", "BSC_GENESIS_GENESIS_NATIVE_VALUE_CREATED"),
                            ("system", "BSC_GENESIS_ORIGINAL_SYSTEM_CODE_CHANGED")]:
            changed = copy.deepcopy(seeded)
            if field == "timestamp":
                changed["timestamp"] = "0x02"
            elif field == "value":
                changed["alloc"][account]["balance"] = "0x01"
            else:
                changed["alloc"][next(iter(codes))]["code"] = "0x6002"
            with self.assertRaisesRegex(RuntimeError, "^" + code + "$"):
                context["validate_seed"](original, changed, codes, credits)


if __name__ == "__main__":
    unittest.main()
