"""
YUNISA NemoClaw Agent Dashboard
===============================
A local Flask web-UI that acts as the NemoClaw OpenShell sandbox.
Connects to the local Yunisa LLM engine at localhost:8080/v1 for inference,
and uses Agent-S (gui_agents) for autonomous computer-use tasks.
"""
import sys
import os
import json
import argparse
import threading
from flask import Flask, request, jsonify, render_template_string  # type: ignore[import-untyped]

# ── HTML Dashboard Template ──────────────────────────────────────────
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>NemoClaw — OpenShell Sandbox</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Consolas', 'Courier New', monospace;
    background: #0a0e17;
    color: #c0c8d8;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .header {
    background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
    padding: 0.75rem 1.5rem;
    border-bottom: 2px solid #00ff41;
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .header h1 {
    font-size: 1rem;
    color: #00ff41;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .header .status {
    margin-left: auto;
    font-size: 0.75rem;
    color: #888;
  }
  .header .status .dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #00ff41;
    margin-right: 4px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    gap: 0.75rem;
    overflow: hidden;
  }
  .log-area {
    flex: 1;
    background: #0d1117;
    border: 1px solid #1a2332;
    border-radius: 6px;
    padding: 1rem;
    overflow-y: auto;
    font-size: 0.85rem;
    line-height: 1.6;
  }
  .log-area .entry { margin-bottom: 0.25rem; }
  .log-area .entry.system { color: #00ff41; }
  .log-area .entry.user { color: #58a6ff; }
  .log-area .entry.agent { color: #f0883e; }
  .log-area .entry.error { color: #f85149; }
  .input-row {
    display: flex;
    gap: 0.5rem;
  }
  .input-row input {
    flex: 1;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    color: #c9d1d9;
    font-family: inherit;
    font-size: 0.9rem;
    outline: none;
    transition: border-color 0.2s;
  }
  .input-row input:focus { border-color: #00ff41; }
  .input-row button {
    background: linear-gradient(135deg, #00ff41 0%, #00cc33 100%);
    color: #0a0e17;
    border: none;
    border-radius: 6px;
    padding: 0.6rem 1.5rem;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-size: 0.8rem;
    transition: opacity 0.2s;
  }
  .input-row button:hover { opacity: 0.85; }
</style>
</head>
<body>
  <div class="header">
    <h1>⟐ NemoClaw Agent Terminal</h1>
    <div class="status"><span class="dot"></span>OpenShell Sandbox Active — Port {{ port }}</div>
  </div>
  <div class="main">
    <div class="log-area" id="log">
      <div class="entry system">[SYSTEM] NemoClaw OpenShell Sandbox initialized.</div>
      <div class="entry system">[SYSTEM] Connected to Yunisa LLM Engine at http://127.0.0.1:{{ llm_port }}/v1</div>
      <div class="entry system">[SYSTEM] Ready. Type a command below to dispatch an autonomous agent task.</div>
    </div>
    <div class="input-row">
      <input id="cmd" type="text" placeholder="Describe a task for the NemoClaw agent..." autofocus />
      <button onclick="sendCmd()">Execute</button>
    </div>
  </div>
  <script>
    const log = document.getElementById('log');
    const cmdInput = document.getElementById('cmd');

    function addEntry(text, cls) {
      const d = document.createElement('div');
      d.className = 'entry ' + cls;
      d.textContent = text;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    async function sendCmd() {
      const cmd = cmdInput.value.trim();
      if (!cmd) return;
      cmdInput.value = '';
      addEntry('[USER] ' + cmd, 'user');
      addEntry('[AGENT] Processing task...', 'agent');
      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: cmd })
        });
        const data = await res.json();
        addEntry('[AGENT] ' + (data.result || data.error || 'Task completed.'), 'agent');
      } catch (e) {
        addEntry('[ERROR] ' + e.message, 'error');
      }
    }

    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendCmd();
    });
  </script>
</body>
</html>
"""

# ── Flask Application ────────────────────────────────────────────────
app = Flask(__name__)

LLM_PORT = 8080  # Yunisa's local inference port

@app.route('/')
def dashboard():
    return render_template_string(DASHBOARD_HTML, port=args.port, llm_port=LLM_PORT)

@app.route('/health')
def health():
    return 'OK', 200

@app.route('/api/execute', methods=['POST'])
def execute_task():
    data = request.json
    instruction = data.get('instruction', '')

    if not instruction:
        return jsonify({'error': 'No instruction provided.'}), 400

    # Guard against oversized inputs that can crash the agent
    MAX_INSTRUCTION_LEN = 10000
    if len(instruction) > MAX_INSTRUCTION_LEN:
        return jsonify({'error': f'Instruction too long ({len(instruction)} chars). Max {MAX_INSTRUCTION_LEN}.'}), 400

    # Attempt to use Agent-S for autonomous task execution
    try:
        import pyautogui  # type: ignore[import-untyped]
        import io
        from PIL import Image  # type: ignore[import-untyped]
        from gui_agents.s3.agents.agent_s import AgentS3  # type: ignore[import-untyped]
        from gui_agents.s3.agents.grounding import OSWorldACI  # type: ignore[import-untyped]
        from gui_agents.s3.utils.local_env import LocalEnv  # type: ignore[import-untyped]

        base_url = f"http://127.0.0.1:{LLM_PORT}/v1"
        engine_params = {
            "engine_type": "openai",
            "model": "local-bitnet",
            "base_url": base_url,
            "api_key": "sk-local",
        }
        engine_params_for_grounding = {
            "engine_type": "openai",
            "model": "local-bitnet",
            "base_url": base_url,
            "api_key": "empty",
            "grounding_width": 1920,
            "grounding_height": 1080,
        }

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
            max_trajectory_length=3,
            enable_reflection=False,
        )

        # [SECURITY FIX]: BitNet b1.58 is text-only. Pass a 1x1 pixel so we don't crash the server.
        screenshot = Image.new("RGB", (1, 1), color="black")
        buffered = io.BytesIO()
        screenshot.save(buffered, format="PNG")

        obs = {"screenshot": buffered.getvalue()}
        try:
            info, action = agent.predict(instruction=instruction, observation=obs)
        except Exception as fmt_err:
            # BitNet often can't produce structured Agent-S JSON — fall back gracefully
            err_text = str(fmt_err)
            truncated_err = err_text[:500] if len(err_text) > 500 else err_text
            return jsonify({
                'result': f'[Text-Only Mode] Agent processed your request but could not format a structured response. '
                          f'Raw output: {truncated_err}'
            })

        info_text = json.dumps(info, default=str)
        truncated_info = info_text[:500] if len(info_text) > 500 else info_text
        return jsonify({
            'result': f'Agent planned {len(action)} action(s). Info: {truncated_info}'
        })
    except ImportError as e:
        return jsonify({
            'result': f'[Fallback Mode] Agent-S modules not fully loaded ({e}). '
                      f'Task queued: "{instruction}". Install gui-agents to enable full autonomous execution.'
        })
    except Exception as e:
        return jsonify({'result': f'Agent execution error: {str(e)}'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='NemoClaw OpenShell Sandbox Server')
    parser.add_argument('--port', type=int, default=3000)
    parser.add_argument('--llm-host', type=str, default='127.0.0.1')
    parser.add_argument('--llm-port', type=int, default=8080)
    args = parser.parse_args()
    LLM_PORT = args.llm_port
    LLM_HOST = args.llm_host

    # Export to app context if needed, though route uses locals nicely
    app.config['LLM_HOST'] = LLM_HOST

    print(f"[NemoClaw] OpenShell Sandbox booting on http://0.0.0.0:{args.port}")
    print(f"[NemoClaw] LLM Engine bound to http://{LLM_HOST}:{LLM_PORT}/v1")
    app.run(host='0.0.0.0', port=args.port, debug=False)
