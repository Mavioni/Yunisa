"""YUNISA Agent Bridge — connects Electron to local LLM + code execution + web search.

Communicates via stdin/stdout using newline-delimited JSON.
Uses only stdlib (no pip dependencies).
"""

import json
import re
import sys
import traceback
import urllib.request
import urllib.error
from executor import execute
from web_search import search, fetch_page
from computer_use import run_tool as computer_tool, TOOLS as COMPUTER_TOOLS

# Configuration (set by 'configure' command)
port = 8080
model = "bitnet"
max_loops = 8  # max agent iterations per user message

SYSTEM_PROMPT = """\
You are YUNISA, an AI agent running locally on the user's Windows computer.
You can execute code, search the web, AND control the computer's GUI.

## Available Actions

### 1. Execute Code
Write code in a fenced markdown block with the language tag:

```python
print("hello world")
```

Supported: python, javascript, bash, powershell
Code runs automatically. You will see the output.

### 2. Web Search
To search the web for current information:

```search
your search query here
```

### 3. Read Web Page
To read the full text of a URL:

```fetch
https://example.com/page
```

### 4. Computer Control (GUI Agent)
To interact with the screen, use JSON inside a `tool` block:

```tool
{"name": "screenshot"}
```
Captures the screen and returns OCR text of everything visible.

```tool
{"name": "click", "args": {"x": 500, "y": 300}}
```
Clicks at screen coordinates. Options: button ("left"/"right"), clicks (1/2).

```tool
{"name": "type", "args": {"text": "hello world"}}
```
Types text at the current cursor position.

```tool
{"name": "hotkey", "args": {"keys": ["ctrl", "c"]}}
```
Presses a keyboard shortcut.

```tool
{"name": "press", "args": {"key": "enter"}}
```
Presses a single key (enter, tab, escape, backspace, etc).

```tool
{"name": "scroll", "args": {"clicks": -3}}
```
Scrolls the mouse wheel. Negative = down, positive = up.

```tool
{"name": "list_windows"}
```
Lists all open windows with titles.

```tool
{"name": "focus_window", "args": {"title": "Notepad"}}
```
Brings a window to the foreground by partial title match.

```tool
{"name": "screen_size"}
```
Returns the screen resolution.

```tool
{"name": "mouse_position"}
```
Returns the current mouse cursor position.

## Agent Workflow for GUI Tasks
1. Take a screenshot to see what's on screen
2. Read the OCR text to understand the current state
3. Decide what action to take (click, type, etc.)
4. Take another screenshot to verify the result
5. Repeat until the task is complete

## Guidelines
- For current events, news, prices, weather: ALWAYS search first.
- For file/system tasks: prefer code over GUI.
- For app interaction (browsers, editors, etc.): use GUI tools.
- Do NOT import pyautogui or PIL directly — use the tool blocks above instead.
- Keep responses concise. When done, reply in plain text without code blocks.
"""


def emit(obj: dict):
    """Send a JSON line to stdout (Electron)."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def parse_actions(text: str) -> list[dict]:
    """Extract all action blocks (code, search, fetch, tool) from markdown."""
    pattern = r"```(\w+)\s*\n([\s\S]*?)```"
    actions = []
    for match in re.finditer(pattern, text):
        tag = match.group(1).lower()
        content = match.group(2).rstrip()
        if tag == "search":
            actions.append({"type": "search", "query": content})
        elif tag == "fetch":
            actions.append({"type": "fetch", "url": content.strip()})
        elif tag == "tool":
            try:
                tool_data = json.loads(content)
                actions.append({
                    "type": "tool",
                    "name": tool_data.get("name", ""),
                    "args": tool_data.get("args", {}),
                })
            except json.JSONDecodeError:
                actions.append({"type": "code", "language": "json", "code": content})
        else:
            actions.append({"type": "code", "language": tag, "code": content})
    return actions


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
                    delta = (
                        parsed.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content")
                    )
                    if delta:
                        full_response += delta
                        emit({
                            "type": "text_delta",
                            "content": delta,
                            "session_id": session_id,
                        })
                except (json.JSONDecodeError, IndexError, KeyError):
                    continue
    except urllib.error.URLError as e:
        reason = str(getattr(e, "reason", e))
        emit({
            "type": "error",
            "content": f"Failed to reach AI engine: {reason}",
            "session_id": session_id,
        })
        return ""
    except Exception as e:
        emit({
            "type": "error",
            "content": f"LLM connection error: {e}",
            "session_id": session_id,
        })
        return ""

    return full_response


def handle_search(query: str, session_id: str) -> str:
    """Run a web search and return formatted results."""
    emit({
        "type": "search_start",
        "query": query,
        "session_id": session_id,
    })

    results = search(query, max_results=5)

    if not results:
        output = "No search results found."
    else:
        lines = []
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **{r['title']}**")
            lines.append(f"   URL: {r['url']}")
            if r["snippet"]:
                lines.append(f"   {r['snippet'][:200]}")
            lines.append("")
        output = "\n".join(lines)

    emit({
        "type": "search_results",
        "content": output,
        "count": len(results),
        "session_id": session_id,
    })

    return output


def handle_fetch(url: str, session_id: str) -> str:
    """Fetch a web page and return its text content."""
    emit({
        "type": "fetch_start",
        "url": url,
        "session_id": session_id,
    })

    content = fetch_page(url, max_chars=6000)

    emit({
        "type": "fetch_result",
        "content": content[:500] + ("..." if len(content) > 500 else ""),
        "url": url,
        "session_id": session_id,
    })

    return content


def handle_message(content: str, session_id: str):
    """Agent loop: LLM call -> parse actions -> execute -> feed back -> repeat."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": content},
    ]

    for loop_idx in range(max_loops):
        # Call LLM
        response_text = call_llm(messages, session_id)
        if not response_text:
            break

        # Parse actions from the response
        actions = parse_actions(response_text)

        # If no actions, the agent is done
        if not actions:
            emit({"type": "done", "session_id": session_id})
            return

        messages.append({"role": "assistant", "content": response_text})

        # Execute each action
        for action in actions:
            if action["type"] == "search":
                result_text = handle_search(action["query"], session_id)
                messages.append({
                    "role": "user",
                    "content": f"Search results for \"{action['query']}\":\n{result_text}",
                })

            elif action["type"] == "fetch":
                result_text = handle_fetch(action["url"], session_id)
                messages.append({
                    "role": "user",
                    "content": f"Page content from {action['url']}:\n{result_text[:4000]}",
                })

            elif action["type"] == "tool":
                tool_name = action["name"]
                tool_args = action.get("args", {})

                # Handle hotkey args (list → positional)
                if tool_name == "hotkey" and "keys" in tool_args:
                    keys = tool_args.pop("keys")
                    tool_args = {}  # clear, pass keys positionally below
                    from computer_use import keyboard_hotkey
                    result_data = keyboard_hotkey(*keys)
                else:
                    result_data = computer_tool(tool_name, tool_args)

                emit({
                    "type": "tool_result",
                    "name": tool_name,
                    "content": json.dumps(result_data, default=str),
                    "session_id": session_id,
                })

                # Feed result back to LLM
                if isinstance(result_data, dict) and "text" in result_data:
                    # Screenshot OCR — send the text content
                    feedback = f"Screen OCR text ({result_data.get('width', '?')}x{result_data.get('height', '?')}):\n{result_data['text'][:3000]}"
                else:
                    feedback = f"Tool '{tool_name}' result: {json.dumps(result_data, default=str)}"

                messages.append({
                    "role": "user",
                    "content": feedback,
                })

            elif action["type"] == "code":
                emit({
                    "type": "code",
                    "language": action["language"],
                    "content": action["code"],
                    "session_id": session_id,
                })
                emit({
                    "type": "execution_start",
                    "language": action["language"],
                    "session_id": session_id,
                })

                result = execute(action["language"], action["code"])

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
                    "content": f"{e}\n{traceback.format_exc()}",
                    "session_id": session_id,
                })

        elif cmd_type == "ping":
            emit({"type": "pong"})


if __name__ == "__main__":
    main()
