import sys
import os
import argparse
import subprocess
import time
import json
import socket
import signal
import platform
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import typing
import collections
from pathlib import Path


def find_free_port(start_port: int) -> int:
    for port in range(start_port, start_port + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port


def has_nvidia_gpu() -> bool:
    """Detect NVIDIA GPU availability via nvidia-smi."""
    try:
        subprocess.run(['nvidia-smi'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


class MizuServer:
    def __init__(self, model_path: str, mizu_port: int, binaries_dir: str,
                 ctx_size: str = '16384', cpu_threads: str = 'auto') -> None:
        self.model_path = model_path
        self.mizu_port = mizu_port
        self.binaries_dir = binaries_dir
        self.ctx_size = ctx_size
        self.cpu_threads = cpu_threads
        self.llama_port = find_free_port(self.mizu_port + 1)
        self.llama_proc: subprocess.Popen | None = None
        self.llama_log: typing.Any = None

    def start_llama(self) -> bool:
        # Cross-platform binary resolution
        exe_name = 'llama-server.exe' if platform.system() == 'Windows' else 'llama-server'
        server_path = Path(self.binaries_dir) / exe_name

        if not server_path.is_file():
            print(f"[MIZU] ERROR: Llama binary not found at {server_path}")
            return False

        cmd = [
            str(server_path),
            "--model", self.model_path,
            "--ctx-size", self.ctx_size,
            "--port", str(self.llama_port),
            "--host", "127.0.0.1",
        ]

        # GPU detection
        if has_nvidia_gpu():
            print("[MIZU] NVIDIA RTX Acceleration Enabled.")
            cmd += ["--n-gpu-layers", "99"]
        else:
            print("[MIZU] No NVIDIA GPU detected. Running pure CPU inference.")

        # Thread configuration
        if self.cpu_threads not in ('auto', 'max', ''):
            cmd += ["--threads", self.cpu_threads]

        print(f"[MIZU] Starting Llama Server on port {self.llama_port}...")
        log_path = Path(self.binaries_dir) / "llama_server.log"
        try:
            self.llama_log = open(log_path, "w", encoding="utf-8")
            self.llama_proc = subprocess.Popen(
                cmd,
                stdout=self.llama_log,
                stderr=subprocess.STDOUT,
                cwd=self.binaries_dir,
            )
        except OSError as e:
            # WinError 4551 = Windows Smart App Control blocked the binary.
            # Do NOT retry — each attempt triggers a new Security popup.
            if platform.system() == 'Windows' and getattr(e, 'winerror', None) == 4551:
                print("[MIZU] Windows Smart App Control blocked llama-server.exe. Skipping to next tier.")
            else:
                print(f"[MIZU] Failed to spawn Llama server: {e}")
            return False

        # Wait for health with better diagnostics
        proc = self.llama_proc
        assert proc is not None  # guaranteed by successful Popen above
        for attempt in range(60):
            # Check if process died early
            if proc.poll() is not None:
                rc = proc.returncode
                # On Windows, exit code 1 from a fresh start = SAC block (no popup retry)
                if platform.system() == 'Windows' and rc == 1:
                    print("[MIZU] llama-server.exe exited immediately (code 1) — likely Windows App Control block. Skipping.")
                    return False
                print(f"[MIZU] Llama server exited prematurely (code {rc})")
                try:
                    with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                        last_lines = collections.deque(f, maxlen=20)
                        stderr_out = "".join(last_lines)
                        if stderr_out:
                            print(f"[MIZU] Last logs: \n{stderr_out}")
                except Exception:
                    pass
                return False

            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.llama_port}/health", timeout=1)
                print("[MIZU] Llama server health OK.")
                return True
            except Exception:
                time.sleep(1)

        print("[MIZU] Llama server failed to become healthy within 60 seconds.")
        self.stop_llama()
        return False

    def stop_llama(self) -> None:
        proc = self.llama_proc
        if proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            except Exception:
                pass
            self.llama_proc = None

        if self.llama_log is not None:
            try:
                self.llama_log.close()
            except Exception:
                pass
            self.llama_log = None
def run_mizu_proxy(mizu_server: MizuServer) -> None:
    llama_base = f"http://127.0.0.1:{mizu_server.llama_port}"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            """Suppress default logging noise."""
            pass

        def _send_cors_headers(self) -> None:
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')

        def do_GET(self) -> None:
            if self.path == '/health':
                self.send_response(200)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(b'OK')
            else:
                self.send_response(404)
                self.end_headers()

        def do_OPTIONS(self) -> None:
            self.send_response(200)
            self._send_cors_headers()
            self.end_headers()

        def do_POST(self) -> None:
            if self.path == '/v1/chat/completions':
                self._handle_chat_completions()
            else:
                self.send_response(404)
                self.end_headers()

        def _handle_chat_completions(self) -> None:
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)

            try:
                req_data = json.loads(post_body)
            except json.JSONDecodeError:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Invalid JSON"}')
                return

            messages = req_data.get('messages', [])

            if not messages:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "No messages provided"}')
                return

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'close')
            self._send_cors_headers()
            self.end_headers()
            self.close_connection = True

            def emit_chunk(content: str) -> None:
                chunk = {
                    "id": "chatcmpl-mizu",
                    "object": "chat.completion.chunk",
                    "choices": [{"delta": {"content": content}}]
                }
                try:
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode('utf-8'))
                    self.wfile.flush()
                except BrokenPipeError:
                    pass

            def call_llama(prompt_override: str, stream_prefix: str | None = None,
                           stream_suffix: str | None = None) -> str:
                payload = req_data.copy()
                # Only keep the system prompt for DTIA passes — the DTIA prompts
                # are self-contained (they embed the query + previous stages), so
                # full conversation history is redundant and overflows the context.
                system_msgs = [m for m in messages if m.get('role') == 'system']
                payload['messages'] = system_msgs + [{"role": "user", "content": prompt_override}]
                payload['stream'] = True

                req = urllib.request.Request(
                    f"{llama_base}/v1/chat/completions",
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )

                if stream_prefix:
                    emit_chunk(stream_prefix)

                parts: list[str] = []
                try:
                    with urllib.request.urlopen(req, timeout=120) as response:
                        for raw_line in response:
                            text_line = raw_line.decode('utf-8').strip()
                            if text_line.startswith("data: ") and text_line != "data: [DONE]":
                                try:
                                    data = json.loads(text_line[6:])
                                    delta = str(data['choices'][0]['delta'].get('content', ''))
                                    if delta:
                                        parts.append(delta)
                                        emit_chunk(delta)
                                except (json.JSONDecodeError, KeyError, IndexError):
                                    continue
                except Exception as e:
                    print(f"[MIZU] Error calling llama: {e}")
                    emit_chunk(f"\n[MIZU ERROR] {e}")

                if stream_suffix:
                    emit_chunk(stream_suffix)

                return ''.join(parts)

            original_query = messages[-1].get('content', '') if messages else ""

            # Max chars from previous DTIA passes to embed in subsequent prompts.
            # 2048 tokens ≈ 8192 chars; system prompt + DTIA template ≈ 500 chars;
            # leave room for generation → keep each embedded pass under 1500 chars.
            MAX_PASS_CHARS = 1500

            # Pre-flight: verify llama-server is reachable; auto-restart if dead
            def ensure_llama_alive() -> bool:
                try:
                    urllib.request.urlopen(f"{llama_base}/health", timeout=5)
                    return True
                except Exception as health_err:
                    print(f"[MIZU] Health check failed: {health_err}. Attempting auto-restart...")
                    emit_chunk("\n*Reconnecting to engine...*\n")
                    mizu_server.stop_llama()
                    time.sleep(1)
                    if mizu_server.start_llama():
                        print("[MIZU] Llama-server restarted successfully.")
                        return True
                    else:
                        print("[MIZU] Llama-server restart failed.")
                        emit_chunk("**Engine unavailable** — could not restart the inference server. Please restart YUNISA.")
                        return False

            if not ensure_llama_alive():
                try:
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                except BrokenPipeError:
                    pass
                return

            try:
                # DTIA Pass 1: Thesis
                thesis_prompt = f"Provide a direct, affirmative answer to the following query based on prevailing knowledge. Query: {original_query}"
                thesis = call_llama(thesis_prompt, stream_prefix="<thesis>\n", stream_suffix="\n</thesis>\n\n")
                print(f"[MIZU] Thesis: {len(thesis)} chars")

                # DTIA Pass 2: Antithesis (truncate thesis to fit context)
                thesis_short = thesis[:MAX_PASS_CHARS] + ('...' if len(thesis) > MAX_PASS_CHARS else '')  # type: ignore[index]
                anti_prompt = f"Given the query: '{original_query}' and the prevailing thesis: '{thesis_short}', provide the strongest counter-argument. What is the thesis missing? Be rigorous."
                antithesis = call_llama(anti_prompt, stream_prefix="<antithesis>\n", stream_suffix="\n</antithesis>\n\n")
                print(f"[MIZU] Antithesis: {len(antithesis)} chars")

                # DTIA Pass 3: Synthesis (truncate both to fit context)
                anti_short = antithesis[:MAX_PASS_CHARS] + ('...' if len(antithesis) > MAX_PASS_CHARS else '')  # type: ignore[index]
                syn_prompt = (
                    f"Query: '{original_query}'. \n"
                    f"Thesis: '{thesis_short}'. \n"
                    f"Antithesis: '{anti_short}'. \n"
                    f"Synthesize these opposing views into a higher-order resolution. "
                    f"Conclude with a single sentence titled 'Dialectical Residue:' stating the remaining unresolved tension."
                )
                synthesis = call_llama(syn_prompt, stream_prefix="<synthesis>\n", stream_suffix="\n</synthesis>\n")
                print(f"[MIZU] Synthesis: {len(synthesis)} chars")
                if not thesis and not antithesis and not synthesis:
                    emit_chunk("\n**[Engine returned empty response]** — the model may have run out of context. Try a shorter message or restart the engine.")
            except BrokenPipeError:
                print("[MIZU] Client disconnected during DTIA pipeline.")

            try:
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except BrokenPipeError:
                pass

    httpd = HTTPServer(('127.0.0.1', mizu_server.mizu_port), Handler)
    print(f"[MIZU] MIZU Server listening on port {mizu_server.mizu_port}...")

    # Graceful shutdown on SIGINT/SIGTERM
    def shutdown_handler(signum: int, frame: object) -> None:
        print("\n[MIZU] Shutting down...")
        httpd.shutdown()

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='MIZU DTIA Inference Server')
    parser.add_argument('--model', required=True, help='Path to GGUF model file')
    parser.add_argument('--port', type=int, required=True, help='Port for the MIZU proxy server')
    parser.add_argument('--binaries', required=True, help='Path to llama.cpp binaries directory')
    parser.add_argument('--ctx-size', type=str, default='16384', help='Context window size')
    parser.add_argument('--threads', type=str, default='auto', help='CPU thread count')
    args = parser.parse_args()

    server = MizuServer(args.model, args.port, args.binaries, args.ctx_size, args.threads)
    if server.start_llama():
        try:
            run_mizu_proxy(server)
        finally:
            server.stop_llama()
    else:
        print("[MIZU] Failed to start underlying Llama engine.")
        sys.exit(1)
