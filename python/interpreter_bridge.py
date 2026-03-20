"""Thin Python bridge between Electron and the local LLM + code executor.

Communicates via stdin/stdout using newline-delimited JSON.
Uses only stdlib (no pip dependencies) — urllib for HTTP, json for protocol.
"""

import json
import re
import sys
import urllib.request
import urllib.error
from executor import execute

# Configuration (set by 'configure' command)
port = 8080
model = "bitnet"
max_loops = 5  # max LLM->execute->LLM loops per user message

SYSTEM_PROMPT = """\
You are YUNISA Interpreter, an AI assistant that can execute code on the user's computer.

When the user asks you to do something that requires code, write the code in a fenced markdown code block with the language specified. For example:

```python
print("hello")
```

Supported languages: python, javascript, bash, powershell.

After you write code, it will be executed automatically and you will see the output. Use it to verify your work and continue if needed.

When you are done and no more code needs to run, respond in plain text without any code blocks.

Keep responses concise. Prefer Python for general tasks.\
"""


def emit(obj: dict):
    """Send a JSON line to stdout (Electron)."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def parse_code_blocks(text: str) -> list[dict]:
    """Extract fenced code blocks from markdown text."""
    pattern = r"```(\w*)\s*\n([\s\S]*?)```"
    blocks = []
    for match in re.finditer(pattern, text):
        lang = match.group(1) or "python"
        code = match.group(2).rstrip()
        blocks.append({"language": lang, "code": code})
    return blocks


def strip_code_blocks(text: str) -> str:
    """Return text with code blocks removed (just the prose)."""
    return re.sub(r"```\w*\s*\n[\s\S]*?```", "", text).strip()


def call_llm(messages: list[dict], session_id: str) -> str:
    """Call the local llama-server and stream the response back."""
    url = f"http://127.0.0.1:{port}/v1/chat/completions"
    payload = json.dumps({
        "messages": messages,
        "stream": True,
        "temperature": 0.7,
        "max_tokens": 1024,
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    full_response = ""

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    parsed = json.loads(data)
                    delta = parsed.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        full_response += delta
                        # Stream text chunks to the UI
                        emit({
                            "type": "text_delta",
                            "content": delta,
                            "session_id": session_id,
                        })
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue
    except urllib.error.URLError as e:
        emit({
            "type": "error",
            "content": f"Failed to reach AI engine: {e.reason}",
            "session_id": session_id,
        })
        return ""

    return full_response


def handle_message(content: str, session_id: str):
    """Process a user message: LLM call -> parse code -> execute -> loop."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]

    for loop_idx in range(max_loops):
        # Call LLM
        response_text = call_llm(messages, session_id)
        if not response_text:
            break

        # Parse code blocks
        code_blocks = parse_code_blocks(response_text)

        # If no code blocks, we're done
        if not code_blocks:
            emit({"type": "done", "session_id": session_id})
            return

        # Execute each code block
        messages.append({"role": "assistant", "content": response_text})

        for block in code_blocks:
            emit({
                "type": "code",
                "language": block["language"],
                "content": block["code"],
                "session_id": session_id,
            })
            emit({
                "type": "execution_start",
                "language": block["language"],
                "session_id": session_id,
            })

            result = execute(block["language"], block["code"])

            output = result["stdout"]
            if result["stderr"]:
                output += ("\n" if output else "") + result["stderr"]
            output = output.strip() or "(no output)"

            emit({
                "type": "execution_output",
                "content": output,
                "exit_code": result["exit_code"],
                "session_id": session_id,
            })

            # Feed output back to LLM for the next iteration
            messages.append({
                "role": "user",
                "content": f"Code execution result (exit code {result['exit_code']}):\n```\n{output}\n```",
            })

    emit({"type": "done", "session_id": session_id})


def main():
    """Main loop — read JSON commands from stdin."""
    global port, model

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            emit({"type": "error", "content": "Invalid JSON input"})
            continue

        cmd_type = cmd.get("type")

        if cmd_type == "configure":
            port = cmd.get("port", port)
            model = cmd.get("model", model)
            emit({"type": "configured", "port": port, "model": model})

        elif cmd_type == "message":
            content = cmd.get("content", "")
            session_id = cmd.get("session_id", "default")
            try:
                handle_message(content, session_id)
            except Exception as e:
                emit({
                    "type": "error",
                    "content": str(e),
                    "session_id": session_id,
                })

        elif cmd_type == "ping":
            emit({"type": "pong"})


if __name__ == "__main__":
    main()
