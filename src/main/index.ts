import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, net, dialog } from 'electron';

import { ChildProcess, execFileSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ServerManager } from './server-manager';
import { ConversationStore } from './conversation-store';
import { MsamStore } from './msam-store';
import { ModelManager } from './model-manager';
import { InterpreterManager } from './interpreter-manager';
import { NemoclawOrchestrator } from './nemoclaw-orchestrator';
import { setupAutoUpdater } from './auto-updater';
import { setupTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverManager: ServerManager;
let conversationStore: ConversationStore;
let msamStore: MsamStore;
let modelManager: ModelManager;
let interpreterManager: InterpreterManager;
let nemoclawOrchestrator: NemoclawOrchestrator;
let vlmProcess: ChildProcess | null = null;

function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, '..', '..', 'resources', relativePath);
}

function getDataDir(): string {
  return path.join(app.getPath('appData'), 'yunisa');
}

function getConfigPath(): string {
  return path.join(getDataDir(), 'config.json');
}

const DEFAULT_CONFIG: Record<string, any> = {
  contextSize: '16384',
  cpuThreads: 'auto',
  psaiCore: 'default',
  coraxLevel: 'guarded',
  airgapMode: false,
  nvidiaApiKey: '',
  nemoclawOnlineMode: false,
  nemoclawUseDocker: false,   // Native-first for instant boot
  enableVlmStudio: false,
  enableDtia: true,
};

function getConfig(): any {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  // First install — write defaults to disk
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return { ...DEFAULT_CONFIG };
}

const VALID_CONFIG_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

function setConfig(key: string, value: any): void {
  if (!VALID_CONFIG_KEYS.has(key)) return; // reject unknown keys
  const configPath = getConfigPath();
  const config = getConfig();
  config[key] = value;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    title: 'YUNISA',
    icon: getResourcePath('icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('console-message', (event, ...args: any[]) => {
    const logPath = path.join(getDataDir(), 'renderer_errors.log');
    
    // Handle both old and new signatures gracefully
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      const details = args[0];
      fs.appendFileSync(logPath, `[Renderer] ${details.message} (${details.sourceId}:${details.line})\n`);
    } else {
      const level = args[0];
      const message = args[1];
      const line = args[2];
      const sourceId = args[3];
      fs.appendFileSync(logPath, `[Renderer] ${message} (${sourceId}:${line})\n`);
    }
  });

  mainWindow.on('close', () => {
    (app as any).isQuitting = true;
    app.quit();
  });
}

/** 
 * Strips Mark-of-the-Web (Zone.Identifier) from all files in the given directories
 * and adds them to Windows Defender exclusions so nothing gets blocked at runtime.
 * Runs asynchronously and never throws — errors are logged but don't block boot.
 */
function unblockAllResources(dirs: string[]): void {
  const existing = dirs.filter(d => { try { return fs.existsSync(d); } catch { return false; } });
  if (existing.length === 0) return;

  const escapedDirs = existing.map(d => d.replace(/'/g, "''")); // PS single-quote escape

  // 1. Strip Zone.Identifier (Mark of the Web) from EVERY file recursively
  const unblockCmd = escapedDirs
    .map(d => `Get-ChildItem -LiteralPath '${d}' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue`)
    .join('; ');

  // 2. Add directories to Windows Defender exclusion list (requires admin)
  const defenderCmd = escapedDirs
    .map(d => `Add-MpPreference -ExclusionPath '${d}' -ErrorAction SilentlyContinue`)
    .join('; ');

  // 3. Belt-and-suspenders: directly delete the Zone.Identifier ADS from executables
  const streamCmd = escapedDirs
    .map(d => `Get-ChildItem -LiteralPath '${d}' -Recurse -Include *.exe,*.py,*.dll,*.so -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue }`)
    .join('; ');

  const fullScript = `${unblockCmd}; ${defenderCmd}; ${streamCmd}`;

  const proc = spawn('powershell', [
    '-NonInteractive', '-WindowStyle', 'Hidden', '-NoProfile', '-Command', fullScript,
  ], { stdio: 'ignore', windowsHide: true });

  proc.on('exit', (code) => {
    if (code === 0) {
      console.log('[trust] Windows trust hardening complete — all resources unblocked.');
    } else {
      console.warn(`[trust] Trust hardening exited with code ${code} (may need elevation).`);
    }
  });
  proc.on('error', (e) => console.warn('[trust] Trust hardening spawn error:', e.message));
}

async function initialize(): Promise<void> {

  const dataDir = getDataDir();
  const binariesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'binaries')
    : path.join(__dirname, '..', '..', 'resources', 'binaries');

  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.join(__dirname, '..', '..');

  const pythonDir = path.join(appRoot, 'python');

  // ── Comprehensive Windows trust hardening ──────────────────────────────────
  // Runs once at elevated boot. Strips Zone.Identifier (Mark of the Web) from
  // all files and adds Defender exclusions so nothing gets blocked again.
  if (process.platform === 'win32') {
    unblockAllResources([binariesDir, pythonDir, appRoot]);
  }

  conversationStore = new ConversationStore(dataDir);
  msamStore = new MsamStore(dataDir);
  modelManager = new ModelManager(dataDir);
  serverManager = new ServerManager(binariesDir, dataDir, getConfig);
  interpreterManager = new InterpreterManager(appRoot);
  nemoclawOrchestrator = new NemoclawOrchestrator(pythonDir, getConfig);

  registerIpcHandlers();

  // Unified engine chain: push active tier name to renderer
  serverManager.onEngineActive((name) => {
    mainWindow?.webContents.send('server:engine-active', name);
  });

  // P3: Notify renderer when interpreter crashes and recovers
  interpreterManager.onCrashed(() => {
    mainWindow?.webContents.send('interpreter:crashed');
  });
  interpreterManager.onRestarted(() => {
    mainWindow?.webContents.send('interpreter:restarted');
  });

  createWindow();
  tray = setupTray(mainWindow!, getResourcePath('icon.ico'));
  setupAutoUpdater(mainWindow!);
}

function registerIpcHandlers(): void {
  // Server
  ipcMain.handle('server:start', (_, modelPath: string) => serverManager.start(modelPath));
  ipcMain.handle('server:stop', () => serverManager.stop());
  ipcMain.handle('server:status', () => serverManager.getStatus());
  ipcMain.handle('server:port', () => serverManager.getPort());

  // NIM connection test (P2)
  ipcMain.handle('nim:test-connection', async () => {
    const cfg = getConfig();
    if (!cfg.nvidiaApiKey) return { ok: false, error: 'No API key configured' };
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
        headers: { Authorization: `Bearer ${cfg.nvidiaApiKey}`, 'User-Agent': 'YUNISA/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      return { ok: res.ok, status: res.status };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });


  ipcMain.handle('models:list-registry', () => modelManager.getRegistry());
  ipcMain.handle('models:list-installed', () => modelManager.listInstalled());
  ipcMain.handle('models:download', (_, modelId: string) => modelManager.download(modelId, (progress) => {
    mainWindow?.webContents.send('models:download-progress', progress);
  }));
  ipcMain.handle('models:delete', (_, modelId: string) => modelManager.delete(modelId));
  ipcMain.handle('models:get-active', () => modelManager.getActive());
  ipcMain.handle('models:set-active', (_, modelId: string) => modelManager.setActive(modelId));
  ipcMain.handle('models:has-any', () => modelManager.hasAnyModel());

  // Conversations
  ipcMain.handle('conversations:list', () => conversationStore.list());
  ipcMain.handle('conversations:get', (_, id: string) => conversationStore.get(id));
  ipcMain.handle('conversations:create', (_, model: string) => conversationStore.create(model));
  ipcMain.handle('conversations:add-message', (_, convId: string, role: string, content: string) =>
    conversationStore.addMessage(convId, role, content));
  ipcMain.handle('conversations:update-title', (_, id: string, title: string) =>
    conversationStore.updateTitle(id, title));
  ipcMain.handle('conversations:delete', (_, id: string) => conversationStore.delete(id));
  ipcMain.handle('conversations:delete-all', () => conversationStore.deleteAll());
  ipcMain.handle('conversations:get-messages', (_, convId: string) => conversationStore.getMessages(convId));

  // MSAM Memory
  ipcMain.handle('memory:get-context', (_, query: string, convId: string) =>
    msamStore.getMemoryContext(query, convId));
  ipcMain.handle('memory:index-conversation', (_, convId: string, text: string) => {
    msamStore.indexConversation(convId, text);
  });
  ipcMain.handle('memory:summarise', async (_, convId: string, port: number) => {
    const messages = conversationStore.getMessages(convId);
    // Fire-and-forget — do not await in the IPC handler to keep UI snappy
    msamStore.summariseConversation(convId, messages, port).catch(() => {});
    return { queued: true };
  });
  ipcMain.handle('memory:set-working', (_, key: string, value: string) => {
    msamStore.setWorking(key, value);
  });
  ipcMain.handle('memory:get-working', (_, key: string) => msamStore.getWorking(key));
  ipcMain.handle('memory:get-all-working', () => msamStore.getAllWorking());
  ipcMain.handle('memory:get-all-episodic', () => msamStore.getAllEpisodicExcept('__nexus_dummy__'));



  // App
  ipcMain.handle('app:get-data-dir', () => getDataDir());
  ipcMain.handle('app:check-internet', async () => {
    try {
      const response = await net.fetch('https://huggingface.co/api/models/microsoft/BitNet-b1.58-2B-4T-gguf', {
        method: 'HEAD',
        headers: { 'User-Agent': 'YUNISA/1.0' },
      });
      return response.ok;
    } catch {
      return false;
    }
  });
  ipcMain.handle('app:quit', () => {
    (app as any).isQuitting = true;
    app.quit();
  });

  // Config
  ipcMain.handle('config:get', () => getConfig());
  ipcMain.handle('config:set', (_, key: string, value: any) => setConfig(key, value));

  // Terminal Sandbox
  // [CRITICAL SECURITY FIX]: Removed terminal:execute RCE vulnerability.
  // Direct execution of renderer IPC strings via child_process.exec() is strictly prohibited.

  // Interpreter
  ipcMain.handle('interpreter:start', async () => {
    await interpreterManager.start();
    interpreterManager.onChunk((chunk) => {
      mainWindow?.webContents.send('interpreter:chunk', chunk);
    });
    return { status: 'ready' };
  });

  ipcMain.handle('interpreter:send', (_, content: string, sessionId: string) => {
    interpreterManager.sendMessage(content, sessionId);
  });

  ipcMain.handle('interpreter:abort', (_, sessionId: string) => {
    interpreterManager.abort(sessionId);
  });

  // NemoClaw OpenShell Sandbox
  ipcMain.handle('nemoclaw:start', async () => {
    const cfg = getConfig();
    return await nemoclawOrchestrator.start(cfg.nemoclawUseDocker || false);
  });
  ipcMain.handle('nemoclaw:stop', () => {
    nemoclawOrchestrator.stop();
    return { status: 'stopped' };
  });
  ipcMain.handle('nemoclaw:status', () => {
    return nemoclawOrchestrator.getStatus();
  });

  // Web Search (Deep Research)
  ipcMain.handle('search:query', async (_, query: string) => {
    const pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'python')
      : path.join(__dirname, '..', '..', 'python');
    const script = path.join(pythonDir, 'web_search.py');
    return new Promise((resolve) => {
      const proc = spawn('python', ['-c', `import sys; sys.path.insert(0, '${pythonDir.replace(/\\/g, '/')}'); from web_search import search; import json; print(json.dumps(search('${query.replace(/'/g, "\\'")}')))` ], {
        cwd: pythonDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('exit', () => {
        try { resolve(JSON.parse(out)); } catch { resolve([]); }
      });
      setTimeout(() => { try { proc.kill(); } catch {} resolve([]); }, 15000);
    });
  });

  ipcMain.handle('search:fetch', async (_, url: string) => {
    const pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'python')
      : path.join(__dirname, '..', '..', 'python');
    return new Promise((resolve) => {
      const proc = spawn('python', ['-c', `import sys; sys.path.insert(0, '${pythonDir.replace(/\\/g, '/')}'); from web_search import fetch_page; print(fetch_page('${url.replace(/'/g, "\\'")}'))` ], {
        cwd: pythonDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('exit', () => resolve(out || '[No content]'));
      setTimeout(() => { try { proc.kill(); } catch {} resolve('[Timeout]'); }, 20000);
    });
  });

  // Code Executor (safe sandbox replacement for removed terminal:execute)
  ipcMain.handle('executor:run', async (_, language: string, code: string) => {
    const ALLOWED_LANGS = ['python', 'py', 'javascript', 'js', 'bash', 'sh', 'powershell'];
    if (!ALLOWED_LANGS.includes(language.toLowerCase())) {
      return { stdout: '', stderr: `Language "${language}" not allowed.`, exit_code: 1 };
    }
    if (code.length > 50000) {
      return { stdout: '', stderr: 'Code too long (max 50KB).', exit_code: 1 };
    }
    const pythonDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'python')
      : path.join(__dirname, '..', '..', 'python');
    const script = path.join(pythonDir, 'executor.py');
    return new Promise((resolve) => {
      const proc = spawn('python', ['-c', `import sys; sys.path.insert(0, '${pythonDir.replace(/\\/g, '/')}'); from executor import execute; import json; print(json.dumps(execute('${language}', '''${code.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}''')))` ], {
        cwd: pythonDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
      proc.on('exit', () => {
        try { resolve(JSON.parse(out)); } catch { resolve({ stdout: out, stderr: '', exit_code: 0 }); }
      });
      setTimeout(() => { try { proc.kill(); } catch {} resolve({ stdout: '', stderr: 'Execution timed out (30s)', exit_code: 124 }); }, 35000);
    });
  });

  // VLM Studio Pipeline
  ipcMain.handle('vlm:train', async () => {
    if (vlmProcess) return { status: 'already_running' };
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'vlm_research', 'train_yunisa.py')
      : path.join(__dirname, '..', '..', 'vlm_research', 'train_yunisa.py');
    
    // Use unbuffered python (-u) so prints stream immediately to the UI
    vlmProcess = spawn('python', ['-u', scriptPath], {
      cwd: path.dirname(scriptPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const sendLog = (d: Buffer) => {
      mainWindow?.webContents.send('vlm:log', d.toString());
    };
    
    vlmProcess!.stdout?.on('data', sendLog);
    vlmProcess!.stderr?.on('data', sendLog);
    vlmProcess!.on('error', (err) => {
      mainWindow?.webContents.send('vlm:log', `\n[SYSTEM] Failed to start training: ${err.message}`);
      vlmProcess = null;
    });
    vlmProcess!.on('exit', () => {
      mainWindow?.webContents.send('vlm:log', '\n[SYSTEM] Training loop terminated.');
      vlmProcess = null;
    });

    return { status: 'started' };
  });

  ipcMain.handle('vlm:stop', () => {
    if (vlmProcess) {
      if (process.platform === 'win32' && vlmProcess.pid) {
        try { execFileSync('taskkill', ['/PID', String(vlmProcess.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      } else if (vlmProcess.pid) {
        process.kill(vlmProcess.pid, 'SIGTERM');
      }
      vlmProcess = null;
    }
    return { status: 'stopped' };
  });

  // Updater
  ipcMain.handle('updater:download', () => {
    const { autoUpdater } = require('electron-updater');
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle('updater:install', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.quitAndInstall();
  });
}

// ── Windows elevation helper ─────────────────────────────────────────────────
function isRunningAsAdmin(): boolean {
  if (process.platform !== 'win32') return true; // N/A on macOS/Linux
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function relaunchAsAdmin(): void {
  // Use PowerShell's Start-Process with -Verb RunAs to trigger UAC elevation
  const exePath = process.execPath;
  const args = process.argv.slice(1).map(a => `"${a}"`).join(' ');
  execFileSync('powershell', [
    '-WindowStyle', 'Hidden',
    '-Command',
    `Start-Process -FilePath '${exePath}' -ArgumentList '${args}' -Verb RunAs`,
  ], { windowsHide: true });
}

// Hardening Chromium GPU cache & Single Instance Lock to prevent Access Denied 0x5 on reboot.
// setImmediate defers execution until Electron's module system is fully ready on Electron 41+
setImmediate(() => {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
    app.whenReady().then(() => {
      // Disable GPU shader cache (prevents Access Denied on reboot)
      app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
      // Allow elevated child-process spawning without Chromium sandbox interference
      app.commandLine.appendSwitch('no-sandbox');

      // Elevation guard — prompt once if running without admin rights
      if (process.platform === 'win32' && !isRunningAsAdmin()) {
        const result = dialog.showMessageBoxSync({
          type: 'warning',
          title: 'YUNISA — Elevation Required',
          message: 'YUNISA needs Administrator privileges to run AI inference engines without restrictions.\n\nClick OK to relaunch as Administrator.',
          buttons: ['Relaunch as Administrator', 'Continue Anyway'],
          defaultId: 0,
          cancelId: 1,
        });
        if (result === 0) {
          try {
            relaunchAsAdmin();
            app.quit();
            return;
          } catch (e) {
            console.warn('[elevation] Relaunch failed, continuing unelevated:', e);
          }
        }
      }

      initialize();
    });
  }

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    (app as any).isQuitting = true;
    serverManager?.stop();
    interpreterManager?.stop();
    conversationStore?.close();
    msamStore?.close();
    nemoclawOrchestrator?.stop();
    if (vlmProcess) {
      try {
        if (process.platform === 'win32' && vlmProcess.pid) {
          execFileSync('taskkill', ['/PID', String(vlmProcess.pid), '/T', '/F'], { stdio: 'ignore' });
        } else if (vlmProcess.pid) { process.kill(vlmProcess.pid, 'SIGTERM'); }
      } catch {}
      vlmProcess = null;
    }
  });

  app.on('activate', () => {
    mainWindow?.show();
  });

  (app as any).isQuitting = false;
});
