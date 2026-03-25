import urllib.request
import urllib.error
import json
import socket
import sys

def test_mizu():
    # Attempt to connect to the MIZU server (usually 8080 or nearby)
    port = 8080
    req_data = {
        "messages": [
            {"role": "system", "content": "You are YUNISA."},
            {"role": "user", "content": "Explain quantum physics."},
            {"role": "assistant", "content": "Quantum check pass"},
            {"role": "user", "content": "test\\"}
        ],
        "stream": True,
        "max_tokens": 1024
    }

    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/chat/completions",
        data=json.dumps(req_data).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream'}
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            print("Response status:", response.status)
            for line in response:
                print("CHUNK:", line.decode('utf-8').strip())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Connection Exception: {e}")

if __name__ == "__main__":
    test_mizu()
