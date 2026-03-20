import { autoUpdater } from 'electron-updater';
import { BrowserWindow } from 'electron';

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:download-progress', {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater:update-ready');
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);
}
