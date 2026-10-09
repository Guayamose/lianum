"""Closed native error handling; HTTP replies here are synthetic, not finality."""
import ast
import copy
import hashlib
import http.server
import json
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


if __name__ == "__main__":
    unittest.main()
