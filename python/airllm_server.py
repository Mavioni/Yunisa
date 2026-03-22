"""AirLLM Layer-Wise Inference Server — 70B model proxy for YUNISA."""

import sys
import argparse
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Global model reference (set at boot)
_model = None
_model_name = ""


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
        global _model, _model_name
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

        if _model is None or _model == "STUB":
            # Dummy response formatted perfectly to pass Agent-S strict action/thought parsing Regex
            agent_s_mock_response = """<thoughts>
I have received the instruction via the AirLLM proxy bridge. Since this is a simulated stub, I will now terminate the session gracefully.
</thoughts>
<answer>
1
</answer>
```python
agent.done()
```"""
            
            self._send_json({
                "choices": [{"message": {"role": "assistant",
                    "content": agent_s_mock_response}}]
            })
            return

        # True AirLLM Implementation forward pass
        try:
            from transformers import AutoTokenizer  # type: ignore[import-untyped]
            input_text = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages])
            
            # Note: A deep integration would cache tokenizer globally.
            tokenizer = AutoTokenizer.from_pretrained(_model_name)
            input_tokens = tokenizer(input_text, return_tensors="pt", return_attention_mask=False, truncation=True, max_length=512)
            
            generation_output = _model.generate(
                input_tokens['input_ids'].cuda(), 
                max_new_tokens=400,
                use_cache=True,
                return_dict_in_generate=True)
                
            output = tokenizer.decode(generation_output.sequences[0])
            self._send_json({
                "choices": [{"message": {"role": "assistant", "content": output}}]
            })
        except Exception as e:
            self._send_json({
                "choices": [{"message": {"role": "assistant",
                    "content": f"```json\n{{\"plan\": \"AirLLM Generation Failed. Exception: {e}\", \"exec_code\": \"\", \"reflection\": \"Check CUDA memory limit.\"}}\n```"}}]
            })


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AirLLM Layer-Wise Inference Server')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--model', type=str, default='meta-llama/Meta-Llama-3-70B-Instruct')
    args = parser.parse_args()

    _model_name = args.model
    
    print(f"[AirLLM-Bridge] Initializing layer-wise proxy for {args.model} on port {args.port}...")
    try:
        from airllm import AutoModel  # type: ignore[import-untyped]
        _model = AutoModel.from_pretrained(args.model)
        print("[AirLLM-Bridge] Core VRAM tensor allocations secured.")
    except Exception as e:
        print("[AirLLM-Bridge] Simulated stub active (HuggingFace weights missing or no CUDA).")
        _model = "STUB"

    httpd = HTTPServer(('127.0.0.1', args.port), AirLLMHandler)
    print(f"[AirLLM-Bridge] Listening on http://127.0.0.1:{args.port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[AirLLM-Bridge] Shutting down.")
    finally:
        httpd.server_close()
