"""YUNISA Agent Bridge — connects Electron to local LLM + Agent-S.

Communicates via stdin/stdout using newline-delimited JSON.
"""

import json
import sys
import traceback
import io
import time
import os

try:
    # Inject agent-s_repo into Python path so gui_agents can be imported
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'agent-s_repo'))
    import pyautogui
    from PIL import Image
    from gui_agents.s3.agents.agent_s import AgentS3
    from gui_agents.s3.agents.grounding import OSWorldACI
    from gui_agents.s3.utils.local_env import LocalEnv
    HAVE_AGENT_S = True
except ImportError:
    HAVE_AGENT_S = False

# Configuration (set by 'configure' command)
port = 8080
model = "bitnet"
max_loops = 15

def emit(obj: dict):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

def handle_message(instruction: str, session_id: str):
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
        "content": "[SYSTEM] Initializing AgentS3 with local BitNet engine...\n",
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

        scaled_width, scaled_height = 1920, 1080
        
        screen_width, screen_height = pyautogui.size()
        scale_factor = min(2400 / screen_width, 2400 / screen_height, 1)
        scaled_width = int(screen_width * scale_factor)
        scaled_height = int(screen_height * scale_factor)

        for step in range(max_loops):
            emit({
                "type": "text_delta",
                "content": f"\n\n--- Step {step + 1}/{max_loops} ---\nTaking screenshot...",
                "session_id": session_id
            })

            screenshot = pyautogui.screenshot()
            screenshot = screenshot.resize((scaled_width, scaled_height), Image.LANCZOS)
            buffered = io.BytesIO()
            screenshot.save(buffered, format="PNG")
            
            obs = {"screenshot": buffered.getvalue()}

            emit({
                "type": "text_delta",
                "content": "\nThinking...\n",
                "session_id": session_id
            })

            # Block while calling AgentS3
            info, code = agent.predict(instruction=instruction, observation=obs)

            if not code or len(code) == 0:
                emit({
                    "type": "text_delta",
                    "content": "\n⚠️ Agent produced no executable action.",
                    "session_id": session_id
                })
                break

            if "done" in code[0].lower() or "fail" in code[0].lower():
                emit({
                    "type": "text_delta",
                    "content": "\n✅ Task completed or failed. Agent stopped.",
                    "session_id": session_id
                })
                break
                
            if "next" in code[0].lower():
                continue

            if "wait" in code[0].lower():
                emit({"type": "text_delta", "content": "\n⏳ Waiting...", "session_id": session_id})
                time.sleep(5)
                continue

            emit({
                "type": "code",
                "language": "python",
                "content": str(code[0]),
                "session_id": session_id
            })
            
            emit({
                "type": "text_delta",
                "content": "\nExecuting action...\n",
                "session_id": session_id
            })
            
            try:
                exec(code[0])
                time.sleep(1.0)
            except Exception as e:
                emit({
                    "type": "text_delta",
                    "content": f"\n⚠️ Execution error: {e}",
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
    global port, model
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
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
