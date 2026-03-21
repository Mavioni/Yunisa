import sys
import argparse
import subprocess
import time
import json
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.error

def find_free_port(start_port):
    for port in range(start_port, start_port + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return start_port

class MizuServer:
    def __init__(self, model_path, mizu_port, binaries_dir):
        self.model_path = model_path
        self.mizu_port = mizu_port
        self.binaries_dir = binaries_dir
        self.llama_port = find_free_port(self.mizu_port + 1)
        self.llama_proc = None

    def start_llama(self):
        cmd = [
            f"{self.binaries_dir}/llama-server.exe",
            "--model", self.model_path,
            "--ctx-size", "16384",
            "--port", str(self.llama_port),
            "--host", "127.0.0.1",
            "--n-gpu-layers", "99"
        ]
        print(f"[MIZU] Starting Llama Server on port {self.llama_port}...")
        self.llama_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Wait for health
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{self.llama_port}/health", timeout=1)
                print("[MIZU] Llama server health OK.")
                return True
            except:
                time.sleep(1)
        return False

    def stop_llama(self):
        if self.llama_proc:
            self.llama_proc.terminate()
            self.llama_proc.wait()

def run_mizu_proxy(mizu_server):
    llama_base = f"http://127.0.0.1:{mizu_server.llama_port}"
    
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
            else:
                self.send_response(404)
                self.end_headers()

        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.end_headers()

        def do_POST(self):
            if self.path == '/v1/chat/completions':
                content_len = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_len)
                req_data = json.loads(post_body)
                
                messages = req_data.get('messages', [])
                stream = req_data.get('stream', False)
                
                # Check if it's a simple query or complex. For now, treat all as complex to demonstrate DTIA.
                # If doing 3 passes, we will emit streaming JSON chunks.
                
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('Connection', 'keep-alive')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                def emit_chunk(content):
                    chunk = {
                        "id": "chatcmpl-mizu",
                        "object": "chat.completion.chunk",
                        "choices": [{"delta": {"content": content}}]
                    }
                    self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode('utf-8'))
                    self.wfile.flush()

                def call_llama(prompt_override, stream_prefix=None, stream_suffix=None):
                    payload = req_data.copy()
                    payload['messages'] = messages[:-1] + [{"role": "user", "content": prompt_override}]
                    payload['stream'] = True
                    
                    req = urllib.request.Request(f"{llama_base}/v1/chat/completions", data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
                    
                    if stream_prefix:
                        emit_chunk(stream_prefix)
                        
                    full_content = ""
                    try:
                        with urllib.request.urlopen(req) as response:
                            for line in response:
                                line = line.decode('utf-8').strip()
                                if line.startswith("data: ") and line != "data: [DONE]":
                                    data = json.loads(line[6:])
                                    content = data['choices'][0]['delta'].get('content', '')
                                    if content:
                                        full_content += content
                                        emit_chunk(content)
                    except Exception as e:
                        print(f"[MIZU] Error calling llama: {e}")
                    
                    if stream_suffix:
                        emit_chunk(stream_suffix)
                        
                    return full_content

                original_query = messages[-1]['content'] if messages else ""
                
                # DTIA Pass 1: Thesis
                thesis_prompt = f"Provide a direct, affirmative answer to the following query based on prevailing knowledge. Query: {original_query}"
                thesis = call_llama(thesis_prompt, stream_prefix="<thesis>\n", stream_suffix="\n</thesis>\n\n")
                
                # DTIA Pass 2: Antithesis
                anti_prompt = f"Given the query: '{original_query}' and the prevailing thesis: '{thesis}', provide the strongest counter-argument. What is the thesis missing? Be rigorous."
                antithesis = call_llama(anti_prompt, stream_prefix="<antithesis>\n", stream_suffix="\n</antithesis>\n\n")
                
                # DTIA Pass 3: Synthesis
                syn_prompt = f"Query: '{original_query}'. \nThesis: '{thesis}'. \nAntithesis: '{antithesis}'. \nSynthesize these opposing views into a higher-order resolution. Conclude with a single sentence titled 'Dialectical Residue:' stating the remaining unresolved tension."
                call_llama(syn_prompt, stream_prefix="<synthesis>\n", stream_suffix="\n</synthesis>\n")
                
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            else:
                self.send_response(404)
                self.end_headers()

    httpd = HTTPServer(('127.0.0.1', mizu_server.mizu_port), Handler)
    print(f"[MIZU] MIZU Server listening on port {mizu_server.mizu_port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--binaries', required=True)
    args = parser.parse_args()

    server = MizuServer(args.model, args.port, args.binaries)
    if server.start_llama():
        try:
            run_mizu_proxy(server)
        finally:
            server.stop_llama()
    else:
        print("[MIZU] Failed to start underlying Llama engine.")
        sys.exit(1)
