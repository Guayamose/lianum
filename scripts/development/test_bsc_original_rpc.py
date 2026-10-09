"""Closed native error handling; HTTP replies here are synthetic, not finality."""
import ast
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


if __name__ == "__main__":
    unittest.main()
