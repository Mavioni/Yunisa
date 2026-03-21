import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, net } from 'electron';
import { ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ServerManager } from './server-manager';
import { ConversationStore } from './conversation-store';
import { ModelManager } from './model-manager';
import { InterpreterManager } from './interpreter-manager';
import { NemoclawOrchestrator } from './nemoclaw-orchestrator';
import { setupAutoUpdater } from './auto-updater';
import { setupTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverManager: ServerManager;
let conversationStore: ConversationStore;
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

function setConfig(key: string, value: any): void {
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

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.webContents.openDevTools(); // open devtools for user too
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    fs.appendFileSync('C:\\Users\\massi\\yunisa\\renderer_errors.log', `[Renderer] ${message} (${sourceId}:${line})\n`);
  });

  mainWindow.on('close', () => {
    (app as any).isQuitting = true;
    app.quit();
  });
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

  conversationStore = new ConversationStore(dataDir);
  modelManager = new ModelManager(dataDir);
  serverManager = new ServerManager(binariesDir, dataDir, getConfig);
  interpreterManager = new InterpreterManager(appRoot);
  nemoclawOrchestrator = new NemoclawOrchestrator(pythonDir);

  registerIpcHandlers();

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

  // Models
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
  ipcMain.handle('conversations:get-messages', (_, convId: string) => conversationStore.getMessages(convId));

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
  ipcMain.handle('terminal:execute', async (_, cmd: string) => {
    return new Promise((resolve) => {
      require('child_process').exec(`powershell.exe -Command "${cmd.replace(/"/g, '\\"')}"`, (error: any, stdout: string, stderr: string) => {
        resolve({ stdout, stderr, error: error?.message });
      });
    });
  });

  // Interpreter
  ipcMain.handle('interpreter:start', async () => {
    const port = serverManager.getPort();
    await interpreterManager.start(port);
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
    const llmPort = serverManager.getPort();
    const cfg = getConfig();
    return await nemoclawOrchestrator.start(llmPort, cfg.nemoclawUseDocker || false);
  });
  ipcMain.handle('nemoclaw:stop', () => {
    nemoclawOrchestrator.stop();
    return { status: 'stopped' };
  });
  ipcMain.handle('nemoclaw:status', () => {
    return nemoclawOrchestrator.getStatus();
  });

  // VLM Studio Pipeline
  ipcMain.handle('vlm:train', async () => {
    if (vlmProcess) return { status: 'already_running' };
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app', 'vlm_research', 'train_yunisa.py')
      : path.join(__dirname, '..', '..', 'vlm_research', 'train_yunisa.py');
    
    // Use unbuffered python (-u) so prints stream immediately to the UI
    vlmProcess = require('child_process').spawn('python', ['-u', scriptPath], {
      cwd: path.dirname(scriptPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const sendLog = (d: Buffer) => {
      mainWindow?.webContents.send('vlm:log', d.toString());
    };
    
    vlmProcess!.stdout?.on('data', sendLog);
    vlmProcess!.stderr?.on('data', sendLog);
    vlmProcess!.on('exit', () => {
      mainWindow?.webContents.send('vlm:log', '\n[SYSTEM] Training loop terminated.');
      vlmProcess = null;
    });

    return { status: 'started' };
  });

  ipcMain.handle('vlm:stop', () => {
    if (vlmProcess) {
      if (process.platform === 'win32') {
        try { require('child_process').execSync(`taskkill /PID ${vlmProcess.pid} /T /F`, { stdio: 'ignore' }); } catch {}
      } else {
        process.kill(vlmProcess.pid!, 'SIGTERM');
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

app.on('ready', initialize);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  serverManager?.stop();
  interpreterManager?.stop();
  conversationStore?.close();
  nemoclawOrchestrator?.stop();
  if (vlmProcess) {
    try {
      if (process.platform === 'win32') {
        require('child_process').execSync(`taskkill /PID ${vlmProcess.pid} /T /F`, { stdio: 'ignore' });
      } else { process.kill(vlmProcess.pid!, 'SIGTERM'); }
    } catch {}
    vlmProcess = null;
  }
});

app.on('activate', () => {
  mainWindow?.show();
});

(app as any).isQuitting = false;
