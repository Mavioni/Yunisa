"""Code execution engine — runs code blocks in subprocesses with timeout."""

import subprocess
import sys
import tempfile
import os
import shutil
from pathlib import Path

TIMEOUT = 30  # seconds


def _find_bash() -> list[str]:
    """Find a working bash executable, preferring Git Bash on Windows."""
    if sys.platform == "win32":
        # Git Bash locations
        candidates = [
            Path(os.environ.get("ProgramFiles", "")) / "Git" / "bin" / "bash.exe",
            Path(os.environ.get("ProgramFiles(x86)", "")) / "Git" / "bin" / "bash.exe",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Git" / "bin" / "bash.exe",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return [str(candidate), "-c"]
        # Fallback to PATH
        bash = shutil.which("bash")
        if bash:
            return [bash, "-c"]
        # Last resort: use cmd
        return ["cmd", "/c"]
    return ["bash", "-c"]


def execute(language: str, code: str, cwd: str | None = None) -> dict:
    """Execute a code block and return stdout, stderr, exit_code."""
    work_dir = cwd or str(Path.home())
    lang = language.lower().strip()

    try:
        if lang in ("python", "py", "python3"):
            return _run_file(code, ".py", [sys.executable], work_dir)
        elif lang in ("javascript", "js", "node"):
            return _run_file(code, ".js", ["node"], work_dir)
        elif lang in ("bash", "sh", "shell"):
            return _run_shell(code, work_dir, shell_cmd=_find_bash())
        elif lang in ("powershell", "ps1", "pwsh"):
            return _run_shell(code, work_dir, shell_cmd=["powershell", "-Command"])
        elif lang in ("cmd", "batch"):
            return _run_shell(code, work_dir, shell_cmd=["cmd", "/c"])
        else:
            return {
                "stdout": "",
                "stderr": f"Unsupported language: {language}",
                "exit_code": 1,
            }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {TIMEOUT}s",
            "exit_code": 124,
        }
    except FileNotFoundError as e:
        return {
            "stdout": "",
            "stderr": f"Runtime not found: {e}",
            "exit_code": 127,
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": str(e),
            "exit_code": 1,
        }


def _run_file(code: str, ext: str, cmd_prefix: list[str], cwd: str) -> dict:
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=ext, dir=cwd, delete=False
    ) as f:
        f.write(code)
        f.flush()
        tmp_path = f.name

    try:
        result = subprocess.run(
            cmd_prefix + [tmp_path],
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
            cwd=cwd,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }


def _run_shell(code: str, cwd: str, shell_cmd: list[str]) -> dict:
    result = subprocess.run(
        shell_cmd + [code],
        capture_output=True,
        text=True,
        timeout=TIMEOUT,
        cwd=cwd,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }
