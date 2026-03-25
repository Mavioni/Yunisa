"""YUNISA Agent Bridge — connects Electron to local LLM + Agent-S.

Communicates via stdin/stdout using newline-delimited JSON.
"""

import json
import sys
import traceback
import io
import time
import os
import threading
from pathlib import Path

# Import computer_use for OCR and window listing
try:
    from computer_use import screenshot_ocr, list_windows  # pyre-ignore[21]
    HAVE_COMPUTER_USE = True
except ImportError:
    HAVE_COMPUTER_USE = False

try:
    # Inject agent-s_repo into Python path so gui_agents can be imported
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'agent-s_repo'))
    import pyautogui  # type: ignore[import-untyped]
    from PIL import Image, ImageGrab  # type: ignore[import-untyped]
    from gui_agents.s3.agents.agent_s import AgentS3  # type: ignore[import-untyped]
    from gui_agents.s3.agents.grounding import OSWorldACI  # type: ignore[import-untyped]
    from gui_agents.s3.utils.local_env import LocalEnv  # type: ignore[import-untyped]
    HAVE_AGENT_S = True
except ImportError:
    HAVE_AGENT_S = False

# Configuration (set by 'configure' command)
port = 8086
model = "airllm"
_abort_event = threading.Event()
max_loops = 15

def emit(obj: dict):
    sys.__stdout__.write(json.dumps(obj) + "\n")
    sys.__stdout__.flush()

def handle_message(instruction: str, session_id: str):
    _abort_event.clear()
    if not HAVE_AGENT_S:
        emit({
            "type": "error",
            "content": "gui-agents is not installed. Please run `pip install -r python/requirements.txt` to enable the Agent-S interpreter.",
            "session_id": session_id
        })
        emit({"type": "done", "session_id": session_id})
        return

    emit({
        "type": "text_delta",
        "content": "[SYSTEM] Initializing AgentS3 with massive AirLLM inference engine...\n",
        "session_id": session_id
    })

    base_url = f"http://127.0.0.1:{port}/v1"
    
    engine_params = {
        "engine_type": "openai",
        "model": model,
        "base_url": base_url,
        "api_key": "empty",
    }
    
    # Grounding uses the same engine for YUNISA's offline constraint
    engine_params_for_grounding = {
        "engine_type": "openai",
        "model": model,
        "base_url": base_url,
        "api_key": "empty",
        "grounding_width": 1920,
        "grounding_height": 1080,
    }

    try:
        # Provide local env for executing code
        local_env = LocalEnv()
        grounding_agent = OSWorldACI(
            env=local_env,
            platform="windows",
            engine_params_for_generation=engine_params,
            engine_params_for_grounding=engine_params_for_grounding,
            width=1920,
            height=1080
        )

        agent = AgentS3(
            engine_params,
            grounding_agent,
            platform="windows",
            max_trajectory_length=8,
            enable_reflection=False
        )
        
        agent.reset()

        for step in range(max_loops):
            if _abort_event.is_set():
                emit({"type": "text_delta", "content": "\n*[Aborted by user]*", "session_id": session_id})
                break
            emit({
                "type": "text_delta",
                "content": f"\n\n--- Step {step + 1}/{max_loops} ---\nCapturing screen context...",
                "session_id": session_id
            })

            # Build textual screen context for the text-only model
            screen_text = ""
            if HAVE_COMPUTER_USE:
                try:
                    ocr_result = screenshot_ocr()
                    if ocr_result.get("text"):
                        screen_text += f"\n[SCREEN OCR TEXT]:\n{ocr_result['text'][:3000]}\n"
                except Exception:
                    pass
                try:
                    windows = list_windows()
                    if windows and not isinstance(windows[0], dict) or not windows[0].get("error"):
                        win_list = "\n".join(f"  - {w.get('title', '')} ({w.get('name', '')})" for w in windows[:20])
                        screen_text += f"\n[OPEN WINDOWS]:\n{win_list}\n"
                except Exception:
                    pass

            # AgentS3 still needs a screenshot in obs dict — send a small real one
            if ImageGrab:
                screenshot = ImageGrab.grab()
                screenshot.thumbnail((768, 768))
            else:
                screenshot = Image.new("RGB", (1, 1), color="black")
            buffered = io.BytesIO()
            screenshot.save(buffered, format="PNG")
            obs = {"screenshot": buffered.getvalue()}
            buffered.close()

            # Inject textual context into the instruction so text-only models can reason
            augmented_instruction = instruction
            if screen_text:
                augmented_instruction = f"{instruction}\n\n--- CURRENT SCREEN STATE ---{screen_text}--- END SCREEN STATE ---"

            emit({
                "type": "text_delta",
                "content": "\nThinking...\n",
                "session_id": session_id
            })

            # Block while calling AgentS3
            info, raw_code = agent.predict(instruction=augmented_instruction, observation=obs)
            code: list = list(raw_code) if raw_code else []

            if not code:
                emit({
                    "type": "text_delta",
                    "content": "\n⚠️ Agent produced no executable action.",
                    "session_id": session_id
                })
                break

            action_str = str(code[0])

            if "done" in action_str.lower() or "fail" in action_str.lower():
                status_msg = "Task completed" if "done" in action_str.lower() else "Task failed"
                emit({
                    "type": "text_delta",
                    "content": f"\n\n<br><strong>✅ {status_msg}. Agent stopped.</strong>",
                    "session_id": session_id
                })
                break
                
            if "next" in action_str.lower():
                continue

            if "wait" in action_str.lower():
                emit({"type": "text_delta", "content": "\n⏳ Waiting...", "session_id": session_id})
                time.sleep(5)
                continue

            emit({
                "type": "code",
                "language": "python",
                "content": action_str,
                "session_id": session_id
            })
            
            emit({
                "type": "text_delta",
                "content": "\nExecuting action...\n",
                "session_id": session_id
            })
            
            try:
                # [CRITICAL SECURITY FIX]: Tightly sandbox Python execution so the LLM cannot run 
                # host-level RCE commands like os.system or subprocess.Popen.
                import builtins
                import contextlib
                
                original_import = builtins.__import__
                def safe_import(name, *args, **kwargs):
                    if name in ["os", "sys", "subprocess", "shutil", "socket", "urllib"]:
                        raise ImportError("Module restricted by Agent Security Sandbox")
                    return original_import(name, *args, **kwargs)

                safe_builtins = {
                    "print": print, "range": range, "int": int, "float": float, 
                    "str": str, "list": list, "dict": dict, "len": len, 
                    "bool": bool, "enumerate": enumerate, "zip": zip,
                    "__import__": safe_import
                }
                safe_globals = {
                    "__builtins__": safe_builtins,
                    "pyautogui": pyautogui,
                    "time": time
                }
                
                output_buf = io.StringIO()
                exc_container = []

                def worker():
                    try:
                        with contextlib.redirect_stdout(output_buf), contextlib.redirect_stderr(output_buf):
                            exec(action_str, safe_globals)
                    except Exception as ex:
                        exc_container.append(ex)

                t = threading.Thread(target=worker)
                t.daemon = True
                t.start()
                t.join(timeout=15.0)

                output_str = output_buf.getvalue()
                if output_str.strip():
                    emit({
                        "type": "text_delta",
                        "content": f"\n\n[Terminal Output]:\n```text\n{output_str.strip()}\n```",
                        "session_id": session_id
                    })

                if t.is_alive():
                    emit({
                        "type": "text_delta",
                        "content": "\n⚠️ Execution timed out after 15 seconds.",
                        "session_id": session_id
                    })
                elif exc_container:
                    raise exc_container[0]

                time.sleep(1.0)
            except Exception as e:
                emit({
                    "type": "text_delta",
                    "content": f"\n⚠️ Execution error: {e}",
                    "session_id": session_id
                })
                
        else:
            emit({
                "type": "text_delta",
                "content": f"\n\n<br><strong>⚠️ Max steps ({max_loops}) reached. Agent stopped.</strong>",
                "session_id": session_id
            })
            
    except Exception as e:
        emit({
            "type": "error",
            "content": f"AgentS3 Error: {e}\n{traceback.format_exc()}",
            "session_id": session_id
        })

    emit({"type": "done", "session_id": session_id})


def main():
    global port, model, max_loops
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            # Guard against oversized payloads BEFORE parsing
            if len(line) > 100000:
                emit({"type": "error", "content": "Input too large", "session_id": "system"})
                continue
            cmd = json.loads(line)
        except json.JSONDecodeError:
            continue

        cmd_type = cmd.get("type")
        if cmd_type == "configure":
            port = cmd.get("port", port)
            model = cmd.get("model", model)
            max_loops = cmd.get("max_loops", max_loops)
            emit({"type": "configured", "port": port, "model": model, "max_loops": max_loops})
        elif cmd_type == "message":
            content = cmd.get("content", "")
            if len(content) > 50000:
                emit({"type": "error", "content": "Message too long. Max 50000 chars.", "session_id": cmd.get("session_id", "default")})
                continue
            session_id = cmd.get("session_id", "default")
            try:
                handle_message(content, session_id)
            except Exception as e:
                emit({
                    "type": "error",
                    "content": f"{e}\n{traceback.format_exc()}",
                    "session_id": session_id,
                })
        elif cmd_type == "abort":
            _abort_event.set()
            emit({"type": "aborted", "session_id": cmd.get("session_id", "default")})
        elif cmd_type == "ping":
            emit({"type": "pong"})

if __name__ == "__main__":
    main()
