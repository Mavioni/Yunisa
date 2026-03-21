import urllib.request
import json

def test_mizu():
    port = 8080
    base_url = f"http://127.0.0.1:{port}/v1/chat/completions"

    def send_prompt(messages):
        req_data = {
            "messages": messages,
            "stream": True,
            "max_tokens": 1024
        }
        req = urllib.request.Request(
            base_url,
            data=json.dumps(req_data).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Accept': 'text/event-stream'}
        )
        print(f"Sending prompt: {messages[-1]['content']}")
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                print("Response starts...")
                for line in response:
                    pass # just consume it to simulate the UI
        except Exception as e:
            print(f"Error: {e}")

    # Prompt 1
    msgs1 = [
        {"role": "system", "content": "You are YUNISA."},
        {"role": "user", "content": "Provide a simple definition of physics."}
    ]
    send_prompt(msgs1)

    # Prompt 2
    msgs2 = msgs1 + [
        {"role": "assistant", "content": "<thesis>physics is...</thesis>"},
        {"role": "user", "content": "test\\"}
    ]
    send_prompt(msgs2)

if __name__ == "__main__":
    test_mizu()
