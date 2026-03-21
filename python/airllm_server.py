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

        # Dummy response to prove system loop with perfectly structured Agent-S JSON
        agent_s_mock = {
            "plan": "Acknowledged. I have initialized the NemoClaw Sandbox via the AirLLM 70B proxy bridge. The system is secure and ready.",
            "exec_code": "print('NemoClaw 70B Sandbox Connection Established.')",
            "reflection": "The subsystem routing works perfectly."
        }
        
        self._send_json({
            "choices": [{"message": {"role": "assistant",
                "content": json.dumps(agent_s_mock)}}]
        })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AirLLM Layer-Wise Inference Server')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--model', type=str, default='meta-llama/Meta-Llama-3-70B-Instruct')
    args = parser.parse_args()

    print(f"[AirLLM-Bridge] Initializing layer-wise proxy for {args.model} on port {args.port}...")
    print("[AirLLM-Bridge] Core VRAM tensor allocations simulated (Stub Mode Active).")
    _model = "STUB"

    httpd = HTTPServer(('127.0.0.1', args.port), AirLLMHandler)
    print(f"[AirLLM-Bridge] Listening on http://127.0.0.1:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AirLLM-Bridge] Shutting down.")
    finally:
        httpd.server_close()
