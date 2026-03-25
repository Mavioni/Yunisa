"""Computer use tools — screen capture, OCR, mouse/keyboard, window management.

Inspired by Agent-S (simular-ai/agent-s). Uses pyautogui + pytesseract
to give a text-only LLM the ability to see and control the screen.
"""

import json
import os
import subprocess
import sys
import time
import tempfile
from pathlib import Path

try:
    import pyautogui  # type: ignore[import-untyped]
    pyautogui.PAUSE = 0.3
    pyautogui.FAILSAFE = True  # move mouse to corner to abort
except ImportError:
    pyautogui = None

try:
    from PIL import Image, ImageGrab  # type: ignore[import-untyped]
except ImportError:
    Image = None
    ImageGrab = None

try:
    import pytesseract  # type: ignore[import-untyped]
except ImportError:
    pytesseract = None


def screenshot_ocr(region: dict | None = None) -> dict:
    """Capture screen (or region) and run OCR. Returns text + dimensions."""
    if not ImageGrab:
        return {"error": "PIL not installed", "text": ""}

    try:
        if region:
            bbox = (region["x"], region["y"],
                    region["x"] + region["w"], region["y"] + region["h"])
            img = ImageGrab.grab(bbox=bbox)
        else:
            img = ImageGrab.grab()

        width, height = img.size

        # Run OCR if tesseract is available
        text = ""
        if pytesseract:
            try:
                text = pytesseract.image_to_string(img)
            except Exception as e:
                text = f"[OCR failed: {e}]"
        else:
            text = "[tesseract not installed — screen captured but OCR unavailable]"

        return {
            "text": text.strip(),
            "width": width,
            "height": height,
        }
    except Exception as e:
        return {"error": str(e), "text": ""}


def screenshot_save(path: str | None = None) -> dict:
    """Save a screenshot to disk and return the path."""
    if not ImageGrab:
        return {"error": "PIL not installed"}
    try:
        img = ImageGrab.grab()
        if not path:
            path = str(Path(tempfile.gettempdir()) / "yunisa_screenshot.png")
        img.save(path)
        return {"path": path, "width": img.size[0], "height": img.size[1]}
    except Exception as e:
        return {"error": str(e)}


def mouse_click(x: int, y: int, button: str = "left", clicks: int = 1) -> dict:
    """Click at screen coordinates."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pyautogui.click(x, y, clicks=clicks, button=button)
        return {"action": "click", "x": x, "y": y, "button": button}
    except Exception as e:
        return {"error": str(e)}


def mouse_move(x: int, y: int) -> dict:
    """Move mouse to coordinates."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pyautogui.moveTo(x, y, duration=0.3)
        return {"action": "move", "x": x, "y": y}
    except Exception as e:
        return {"error": str(e)}


def mouse_scroll(clicks: int, x: int | None = None, y: int | None = None) -> dict:
    """Scroll the mouse wheel. Positive = up, negative = down."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        if x is not None and y is not None:
            pyautogui.scroll(clicks, x, y)
        else:
            pyautogui.scroll(clicks)
        return {"action": "scroll", "clicks": clicks}
    except Exception as e:
        return {"error": str(e)}


def keyboard_type(text: str) -> dict:
    """Type text using the keyboard."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pyautogui.typewrite(text, interval=0.02) if text.isascii() else pyautogui.write(text)
        return {"action": "type", "length": len(text)}
    except Exception as e:
        return {"error": str(e)}


def keyboard_hotkey(*keys: str) -> dict:
    """Press a keyboard shortcut (e.g., 'ctrl', 'c')."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pyautogui.hotkey(*keys)
        return {"action": "hotkey", "keys": list(keys)}
    except Exception as e:
        return {"error": str(e)}


def keyboard_press(key: str) -> dict:
    """Press a single key (enter, tab, escape, etc.)."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pyautogui.press(key)
        return {"action": "press", "key": key}
    except Exception as e:
        return {"error": str(e)}


def list_windows() -> list[dict]:
    """List visible windows with titles and positions (Windows only)."""
    try:
        if sys.platform == "win32":
            return _list_windows_win32()
        return [{"error": "Window listing only supported on Windows"}]
    except Exception as e:
        return [{"error": str(e)}]


def focus_window(title: str) -> dict:
    """Bring a window to the foreground by partial title match."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        windows = pyautogui.getWindowsWithTitle(title)
        if windows:
            win = windows[0]
            win.activate()
            time.sleep(0.3)
            return {"action": "focus", "title": win.title,
                    "x": win.left, "y": win.top, "w": win.width, "h": win.height}
        return {"error": f"No window found matching '{title}'"}
    except Exception as e:
        return {"error": str(e)}


def get_mouse_position() -> dict:
    """Get current mouse position."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}
    except Exception as e:
        return {"error": str(e)}


def get_screen_size() -> dict:
    """Get screen resolution."""
    if not pyautogui:
        return {"error": "pyautogui not installed"}
    try:
        size = pyautogui.size()
        return {"width": size.width, "height": size.height}
    except Exception as e:
        return {"error": str(e)}


def _list_windows_win32() -> list[dict]:
    """List windows using PowerShell on Windows."""
    ps_cmd = """
    Get-Process | Where-Object {$_.MainWindowTitle -ne ''} |
    Select-Object ProcessName, MainWindowTitle, Id |
    ConvertTo-Json
    """
    result = subprocess.run(
        ["powershell", "-Command", ps_cmd],
        capture_output=True, text=True, timeout=5
    )
    if result.returncode != 0:
        return [{"error": result.stderr}]

    try:
        data = json.loads(result.stdout)
        if isinstance(data, dict):
            data = [data]
        return [
            {"pid": w.get("Id"), "name": w.get("ProcessName", ""),
             "title": w.get("MainWindowTitle", "")}
            for w in data if w.get("MainWindowTitle")
        ]
    except json.JSONDecodeError:
        return [{"error": "Failed to parse window list"}]


# Dispatch table for the bridge
TOOLS = {
    "screenshot": screenshot_ocr,
    "screenshot_save": screenshot_save,
    "click": mouse_click,
    "move": mouse_move,
    "scroll": mouse_scroll,
    "type": keyboard_type,
    "hotkey": keyboard_hotkey,
    "press": keyboard_press,
    "list_windows": list_windows,
    "focus_window": focus_window,
    "mouse_position": get_mouse_position,
    "screen_size": get_screen_size,
}


def run_tool(name: str, args: dict | None = None) -> dict | list:
    """Run a computer use tool by name."""
    tool_fn = TOOLS.get(name)
    if not tool_fn:
        return {"error": f"Unknown tool: {name}"}
    return tool_fn(**(args or {}))
