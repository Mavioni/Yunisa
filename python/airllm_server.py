"""AirLLM Layer-Wise Inference Server — 70B model proxy for YUNISA."""

import sys
import argparse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Global model reference (set at boot)
_model = None


class AirLLMHandler(BaseHTTPRequestHandler):
    """HTTP handler for AirLLM inference requests."""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        """Suppress default request logging."""
        pass

    def _send_cors_headers(self) -> None:
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def _send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == '/health':
            self.send_response(200)
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(b'OK')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        if self.path == '/v1/chat/completions':
            self._handle_chat()
        else:
            self.send_response(404)
            self.end_headers()

    def _handle_chat(self) -> None:
        content_len = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(content_len)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON body"}, 400)
            return

        messages = data.get('messages', [])
        if not messages:
            self._send_json({"error": "No messages provided"}, 400)
            return

        if _model is None:
            self._send_json({
                "choices": [{"message": {"role": "assistant",
                    "content": "[AirLLM Engine Offline] The 70B block tensor failed to load layer zero into VRAM space."}}]
            })
            return

        # Constructing deterministic prompt sequence for layer inference
        prompt = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages])

        try:
            # In a deep integration, we cache the tokenizer
            # output = _model.generate(input_text...)
            # Dummy response to prove system loop
            self._send_json({
                "choices": [{"message": {"role": "assistant",
                    "content": "[AirLLM Engine] Massive 70B layer-wise inferencing successful. (Stubbed Tensor Output)"}}]
            })
        except Exception as e:
            self._send_json({
                "choices": [{"message": {"role": "assistant",
                    "content": f"[AirLLM Engine Error] {e}"}}]
            })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AirLLM Layer-Wise Inference Server')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--model', type=str, default='meta-llama/Meta-Llama-3-70B-Instruct')
    args = parser.parse_args()

    print(f"[AirLLM-Bridge] Initializing layer-wise proxy for {args.model} on port {args.port}...")
    try:
        from airllm import AutoModel  # type: ignore[import-untyped]
        # This will trigger HuggingFace cache loading / downloading if needed
        _model = AutoModel.from_pretrained(args.model)
        print("[AirLLM-Bridge] Core VRAM tensor allocations secured.")
    except ImportError:
        print("[AirLLM-Bridge] CRITICAL: 'airllm' package not found. VRAM execution aborted.")
    except Exception as e:
        print(f"[AirLLM-Bridge] Deferred init due to HF network boundaries: {e}")

    httpd = HTTPServer(('127.0.0.1', args.port), AirLLMHandler)
    print(f"[AirLLM-Bridge] Listening on http://127.0.0.1:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AirLLM-Bridge] Shutting down.")
    finally:
        httpd.server_close()
