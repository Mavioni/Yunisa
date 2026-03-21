import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('yunisa', {
  server: {
    start: (modelPath: string) => ipcRenderer.invoke('server:start', modelPath),
    stop: () => ipcRenderer.invoke('server:stop'),
    status: () => ipcRenderer.invoke('server:status'),
    port: () => ipcRenderer.invoke('server:port'),
  },

  models: {
    listRegistry: () => ipcRenderer.invoke('models:list-registry'),
    listInstalled: () => ipcRenderer.invoke('models:list-installed'),
    download: (modelId: string) => ipcRenderer.invoke('models:download', modelId),
    delete: (modelId: string) => ipcRenderer.invoke('models:delete', modelId),
    getActive: () => ipcRenderer.invoke('models:get-active'),
    setActive: (modelId: string) => ipcRenderer.invoke('models:set-active', modelId),
    hasAny: () => ipcRenderer.invoke('models:has-any'),
    onDownloadProgress: (callback: (progress: any) => void) => {
      const channel = 'models:download-progress';
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (_, progress) => callback(progress));
    },
  },

  conversations: {
    list: () => ipcRenderer.invoke('conversations:list'),
    get: (id: string) => ipcRenderer.invoke('conversations:get', id),
    create: (model: string) => ipcRenderer.invoke('conversations:create', model),
    addMessage: (convId: string, role: string, content: string) =>
      ipcRenderer.invoke('conversations:add-message', convId, role, content),
    updateTitle: (id: string, title: string) =>
      ipcRenderer.invoke('conversations:update-title', id, title),
    delete: (id: string) => ipcRenderer.invoke('conversations:delete', id),
    getMessages: (convId: string) => ipcRenderer.invoke('conversations:get-messages', convId),
  },

  interpreter: {
    start: () => ipcRenderer.invoke('interpreter:start'),
    send: (content: string, sessionId: string) =>
      ipcRenderer.invoke('interpreter:send', content, sessionId),
    abort: (sessionId: string) => ipcRenderer.invoke('interpreter:abort', sessionId),
    onChunk: (callback: (chunk: any) => void) => {
      const channel = 'interpreter:chunk';
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (_, chunk) => callback(chunk));
    },
  },

  // terminal:execute has been permanently removed (RCE vulnerability)

  app: {
    getDataDir: () => ipcRenderer.invoke('app:get-data-dir'),
    checkInternet: () => ipcRenderer.invoke('app:check-internet'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
  },

  updater: {
    onUpdateAvailable: (callback: (info: { version: string }) => void) => {
      ipcRenderer.on('updater:update-available', (_, info) => callback(info));
    },
    onUpdateReady: (callback: () => void) => {
      ipcRenderer.on('updater:update-ready', () => callback());
    },
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
  },

  nemoclaw: {
    start: () => ipcRenderer.invoke('nemoclaw:start'),
    stop: () => ipcRenderer.invoke('nemoclaw:stop'),
    status: () => ipcRenderer.invoke('nemoclaw:status'),
  },

  vlm: {
    train: () => ipcRenderer.invoke('vlm:train'),
    stop: () => ipcRenderer.invoke('vlm:stop'),
    onLog: (callback: (text: string) => void) => {
      ipcRenderer.on('vlm:log', (_, text) => callback(text));
    }
  },

  onServerRestartRequested: (callback: () => void) => {
    ipcRenderer.on('server:restart-requested', () => callback());
  },
});
