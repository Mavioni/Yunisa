import { initChat } from './pages/chat.js';
import { initWelcome } from './pages/welcome.js';
import { initModels } from './pages/models.js';
import { initSettings } from './pages/settings.js';
import { initInterpreter } from './pages/interpreter.js';
import { initNemoclaw } from './pages/nemoclaw.js';

const screens = {
  loading: document.getElementById('loading-screen'),
  welcome: document.getElementById('welcome-screen'),
  chat: document.getElementById('chat-screen'),
  interpreter: document.getElementById('interpreter-screen'),
  models: document.getElementById('models-screen'),
  settings: document.getElementById('settings-screen'),
  nemoclaw: document.getElementById('nemoclaw-screen'),
};

export function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name]?.classList.add('active');
}

export function setLoadingStatus(text) {
  document.getElementById('loading-status').textContent = text;
}

async function boot() {
  showScreen('loading');

  // Initialize page modules
  initWelcome();
  initModels();
  initSettings();
  initChat();
  initInterpreter();
  initNemoclaw();

  // Setup auto-updater notifications
  window.yunisa.updater.onUpdateAvailable((info) => {
    if (confirm(`YUNISA v${info.version} is available. Download now?`)) {
      window.yunisa.updater.downloadUpdate();
    }
  });
  window.yunisa.updater.onUpdateReady(() => {
    if (confirm('Update downloaded. Restart now to install?')) {
      window.yunisa.updater.installUpdate();
    }
  });

  // Handle tray "Restart Server" request
  window.yunisa.onServerRestartRequested(async () => {
    showScreen('loading');
    setLoadingStatus('Restarting AI engine...');
    await window.yunisa.server.stop();
    const active = await window.yunisa.models.getActive();
    if (active) {
      const result = await window.yunisa.server.start(active.path);
      if (result.status === 'ready') {
        showScreen('chat');
        return;
      }
    }
    setLoadingStatus('Failed to restart server.');
  });

  // Check if any model is installed
  try {
    const hasModel = await window.yunisa.models.hasAny();

    if (!hasModel) {
      showScreen('welcome');
      return;
    }

    // Start server with active model
    setLoadingStatus('Starting AI engine...');
    const active = await window.yunisa.models.getActive();
    if (!active) {
      showScreen('welcome');
      return;
    }

    const result = await window.yunisa.server.start(active.path);
    if (result.status === 'ready') {
      showScreen('chat');
    } else {
      setLoadingStatus('Failed to start server. Check model file.');
    }
  } catch (err) {
    console.error('Boot error:', err);
    setLoadingStatus('Error: ' + (err.message || 'Failed to initialize. Please restart YUNISA.'));
  }
}

boot();
