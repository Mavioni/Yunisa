<div align="center">

<img src="resources/logo.png" alt="YUNISA Logo" width="180"/>

# Ｙ Ｕ Ｎ Ｉ Ｓ Ａ

_Your Intelligence. Your Machine. Your Rules._

<br>

[![Download](https://img.shields.io/github/v/release/Mavioni/Yunisa?label=Latest%20Release&style=for-the-badge&color=e94560)](https://github.com/Mavioni/Yunisa/releases/latest)
[![License](https://img.shields.io/github/license/Mavioni/Yunisa?style=for-the-badge&color=16213e)](LICENSE)
[![Windows](https://img.shields.io/badge/Platform-Windows_11-0078D6?style=for-the-badge&logo=windows)](https://github.com/Mavioni/Yunisa/releases/latest)
[![Showcase](https://img.shields.io/badge/Showcase-yunisai.com-2A9D8F?style=for-the-badge)](https://www.yunisai.com)

<br>

> **YUNISA** runs a powerful AI chatbot entirely on your computer — no cloud, no API keys, no telemetry, and no data ever leaving your machine. 
> Powered by the breakthrough 1-bit LLM technology of Microsoft's **BitNet.cpp**.

**[yunisai.com](https://www.yunisai.com)** — Full showcase of the sovereign tech ecosystem: 9 systems, 6 books, zero cloud.

</div>

<br>

---

## Repository Structure

```
Yunisa/
├── src/                    # Electron desktop app source
│   ├── main/               # Main process (model manager, server, IPC)
│   └── renderer/           # UI (chat, interpreter, models, settings)
├── python/                 # Python bridges
│   ├── computer_use.py     # Computer use agent
│   ├── web_search.py       # Web search bridge
│   ├── executor.py         # Code execution sandbox
│   ├── interpreter_bridge.py
│   └── nvidia_nim_bridge.py
├── vlm_research/           # Vision-Language Model R&D
│   ├── yunisa_vlm.py       # Custom 1-bit VLM architecture
│   ├── train_yunisa.py     # Training pipeline (SigLIP + BitNet)
│   ├── MIND_MAP.md         # Architecture diagrams
│   └── TRAINING_GUIDE.md   # Training sequence documentation
├── docs/                   # Showcase site (GitHub Pages → yunisai.com)
│   ├── index.html          # Full SPA — Home, Work, Architecture, Stack, Contact
│   └── CNAME               # Custom domain config
├── resources/              # App assets & binaries
│   ├── binaries/           # llama-server.exe + DLLs
│   ├── icon.ico
│   └── logo.png
└── .github/workflows/      # CI/CD
    └── deploy-pages.yml    # Auto-deploy docs/ to GitHub Pages
```

---

<div align="center">
  <h2>✦ The Experience ✦</h2>
</div>

<table align="center" width="100%">
  <tr>
    <td width="50%">
      <h3>🔒 Absolute Privacy</h3>
      <p>Your conversations <b>never leave your computer</b>. There is no server, no telemetry, no cloud integration. Every thought, every word, and every prompt stays securely on your local SSD.</p>
    </td>
    <td width="50%">
      <h3>⚡ Pure Efficiency</h3>
      <p>No GPU required. YUNISA leverages <a href="https://huggingface.co/microsoft/BitNet-b1.58-2B-4T">BitNet b1.58</a>—a 2.4 billion parameter model utilizing 1.58-bit ternary quantization. It blazes through inference on any modern x86 CPU.</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>💎 Elegant Design</h3>
      <p>A beautifully sleek, cinematic dark-themed UI that feels like an extension of your operating system. Seamlessly integrated with Windows, it sits quietly in your system tray until summoned.</p>
    </td>
    <td width="50%">
      <h3>🧠 Untethered Intelligence</h3>
      <p>Once you download the initial model, YUNISA doesn't require an active internet connection. Take your creative partner with you on a flight, to a cabin, or entirely off the grid.</p>
    </td>
  </tr>
</table>

<br>

---

<div align="center">
  <h2>Ignition Sequence</h2>
</div>

### 1. 📥 Download
Acquire the latest build directly from our [Releases Page](https://github.com/Mavioni/Yunisa/releases/latest). Look for **`YUNISA Setup 1.0.0.exe`**.

### 2. ⚡ Install
Launch the setup. YUNISA gracefully installs itself into your local environment — zero administration privileges required.

### 3. 🧠 Initialize the Core
On your first launch, YUNISA will seamlessly download the hyper-optimized 1-bit AI model (~1.2 GB) directly to your machine. 

### 4. 💬 Interface
That's it. Start exploring. No accounts. No tracking. Pure local intelligence.

<br>

---

<div align="center">
  <h2>Architecture Diagram</h2>
  <p><i>The inner workings of a private intellect.</i></p>
</div>

```mermaid
flowchart TD
    UI(🖥️ YUNISA.exe Desktop Application)
    SERVER(🧠 llama-server.exe)
    DB(💾 SQLite Database)
    MODEL(📦 BitNet b1.58 Model)
    OS((Windows CPU))

    UI <==> |127.0.0.1:8080| SERVER
    SERVER <==> |Inference Engine| MODEL
    UI ==> |Saves Chat History| DB
    SERVER <--> |Executes Math| OS

    style UI fill:#16213e,stroke:#e94560,stroke-width:2px,color:#fff
    style SERVER fill:#0f3460,stroke:#00a1ff,stroke-width:2px,color:#fff
    style DB fill:#1a1a2e,stroke:#ffb400,stroke-width:2px,color:#fff
    style MODEL fill:#1a1a2e,stroke:#00ff00,stroke-width:2px,color:#fff
    style OS fill:#222,stroke:#555,color:#fff
```

<br>

---

<div align="center">
  <h2>Technological Core</h2>
</div>

| Component | Technology | Purpose |
|:---|:---|:---|
| **Shell** | [Electron](https://www.electronjs.org/) | Seamless Desktop Integration |
| **Engine** | [BitNet.cpp](https://github.com/microsoft/BitNet) / [llama.cpp](https://github.com/ggerganov/llama.cpp) | Ultra-fast 1-Bit Inference |
| **Model** | [BitNet b1.58-2B-4T](https://huggingface.co/microsoft/BitNet-b1.58-2B-4T) | 2.4 Billion Parameters on CPU |
| **Memex** | [SQLite](https://sqlite.org/) | Perpetual Local Memory |
| **Frontend** | HTML / CSS / JS | Minimalist Vanilla Interface |
| **Bridges** | Python (FastAPI) | Computer Use, Web Search, Code Execution |
| **VLM** | SigLIP + BitNet (research) | Local Vision-Language Understanding |

<br>

---

<div align="center">
  <h2>The Sovereign Ecosystem</h2>
  <p><i>YUNISA is one of nine systems. See the full architecture at <a href="https://www.yunisai.com">yunisai.com</a>.</i></p>
</div>

| # | System | Domain | Status |
|:--|:-------|:-------|:-------|
| 01 | **DTIA** | Dialectical Ternary Inference Architecture | Spec complete |
| 02 | **MIZU** | Dialectical Meta-Language & Compiler | Active development |
| 03 | **Na'Tari** | Ternary Programming Language & IDE | Spec + prototype |
| 04 | **Sovereign Inference Engine** | On-device ternary-weight AI | Active development |
| 05 | **CoRax** | Constitutional Agent Governance | 99-page spec complete |
| 06 | **ITACHI** | Android ARM64 Inference Runtime | Active development |
| 07 | **Cyberdeck** | Custom AI Hardware Platform | 11-volume spec |
| 08 | **P.S.AI** | Historical Figure Resurrection | Design phase |
| 09 | **YUNISA** | Local Desktop AI (this repo) | **Released** |

<br>

---

<div align="center">
  <h2>Frequently Asked Questions</h2>
</div>

<details>
<summary><b>Is my data truly private?</b></summary>
<br>
Yes. YUNISA runs 100% locally. There is no server component, no analytics, no telemetry. Your conversations are stored securely in a SQLite database on your machine at <code>%APPDATA%/yunisa/conversations.db</code>. If you delete the file, they are gone forever.
</details>

<details>
<summary><b>How fast is the inference?</b></summary>
<br>
On a modern x86 CPU, expect 5-7 tokens per second. That equates to roughly 1-2 sentences per second — fast enough for a natural, flowing conversation. By utilizing BitNet's 1-bit quantization, energy consumption is reduced by 70-80% compared to standard AI models.
</details>

<details>
<summary><b>Can I operate entirely offline?</b></summary>
<br>
Yes. After the one-time initial model download, no internet connection is required. All AI inference is local.
</details>

<details>
<summary><b>Where is my local memory stored?</b></summary>
<br>
All persistent YUNISA data lives quietly in <code>%APPDATA%/yunisa/</code>:<br>
• <code>conversations.db</code> — Your encrypted chat history<br>
• <code>config.json</code> — Your system preferences<br>
• <code>models/</code> — Your downloaded neural networks
</details>

<details>
<summary><b>What about the showcase site?</b></summary>
<br>
The <code>docs/</code> directory contains the full <a href="https://www.yunisai.com">yunisai.com</a> showcase — a single-page app documenting all 9 sovereign systems, the 6-layer architecture, publications, roadmap, and tech stack. It auto-deploys to GitHub Pages on push.
</details>

<br>

---

<div align="center">
  <h2>Building from Source</h2>
</div>

For the engineers and architects looking to modify the core:

```bash
# Clone the repository
git clone https://github.com/Mavioni/Yunisa.git
cd Yunisa

# Install dependencies
npm install
pip install -r python/requirements.txt

# Ignite Development Mode
npm run start
```

> **Note:** The `resources/binaries/` directory must contain `llama-server.exe` and its dynamically linked libraries (`ggml.dll`, `llama.dll`, `llava_shared.dll`) previously compiled from the [BitNet.cpp](https://github.com/microsoft/BitNet) source.

<br>

---

<div align="center">
  <i>"A machine that thinks, tucked away in the shadows of your hard drive."</i>
  
  <br><br><br>
  
  <img src="https://img.shields.io/badge/Built_with-BitNet.cpp-0f3460?style=for-the-badge&logo=microsoft" alt="Built with BitNet"/>
  <br>
  <p>Released under the MIT License.</p>
  <p><a href="https://www.yunisai.com">yunisai.com</a> · <a href="https://github.com/Mavioni">GitHub</a> · Prescott Valley, AZ</p>
</div>
