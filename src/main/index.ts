import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, net } from 'electron';
import path from 'path';
import { ServerManager } from './server-manager';
import { ConversationStore } from './conversation-store';
import { ModelManager } from './model-manager';
import { setupAutoUpdater } from './auto-updater';
import { setupTray } from './tray';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverManager: ServerManager;
let conversationStore: ConversationStore;
let modelManager: ModelManager;

function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, '..', '..', 'resources', relativePath);
}

function getDataDir(): string {
  return path.join(app.getPath('appData'), 'yunisa');
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
  });

  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

async function initialize(): Promise<void> {
  const dataDir = getDataDir();
  const binariesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'binaries')
    : path.join(__dirname, '..', '..', 'resources', 'binaries');

  conversationStore = new ConversationStore(dataDir);
  modelManager = new ModelManager(dataDir);
  serverManager = new ServerManager(binariesDir, dataDir);

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
  // Don't quit — tray keeps app alive
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  serverManager?.stop();
});

app.on('activate', () => {
  mainWindow?.show();
});

(app as any).isQuitting = false;
