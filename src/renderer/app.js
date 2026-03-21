import { initChat } from './pages/chat.js';
import { initWelcome } from './pages/welcome.js';
import { initModels } from './pages/models.js';
import { initSettings } from './pages/settings.js';
import { initInterpreter } from './pages/interpreter.js';
import { initNemoclaw } from './pages/nemoclaw.js';
import { initVlm } from './pages/vlm.js';

const screens = {
  loading: document.getElementById('loading-screen'),
  welcome: document.getElementById('welcome-screen'),
  chat: document.getElementById('chat-screen'),
  interpreter: document.getElementById('interpreter-screen'),
  models: document.getElementById('models-screen'),
  settings: document.getElementById('settings-screen'),
  nemoclaw: document.getElementById('nemoclaw-screen'),
  vlm: document.getElementById('vlm-screen'),
};

// Map nav button IDs to screen names
const NAV_MAP = {
  'nav-chat': 'chat',
  'nav-interpreter': 'interpreter',
  'nav-nemoclaw': 'nemoclaw',
  'nav-models': 'models',
  'nav-vlm': 'vlm',
  'nav-settings': 'settings',
};

// Screens that show the conversation panel
const CHAT_SCREENS = new Set(['chat']);

let currentScreen = 'loading';

export function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name]?.classList.add('active');
  currentScreen = name;

  // Update icon rail active state
  document.querySelectorAll('.rail-btn').forEach(btn => btn.classList.remove('active'));
  const activeNav = Object.entries(NAV_MAP).find(([, v]) => v === name);
  if (activeNav) {
    document.getElementById(activeNav[0])?.classList.add('active');
  }

  // Show/hide conversation panel
  const convPanel = document.getElementById('conv-panel');
  if (convPanel) {
    if (CHAT_SCREENS.has(name)) {
      convPanel.classList.remove('collapsed');
    } else {
      convPanel.classList.add('collapsed');
    }
  }

  // For non-chat screens shown inside chat-screen, handle differently
  // Non-chat screens are separate full-width divs
}

export function setLoadingStatus(text) {
  document.getElementById('loading-status').textContent = text;
}

async function boot() {
  showScreen('loading');

  // Initialize all page modules
  initWelcome();
  initModels();
  initSettings();
  initChat();
  initInterpreter();
  initNemoclaw();
  initVlm();

  // Wire icon rail navigation
  Object.entries(NAV_MAP).forEach(([btnId, screenName]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => showScreen(screenName));
    }
  });

  // Pre-flight: hide VLM if not enabled
  const config = await window.yunisa.config.get();
  const vlmBtn = document.getElementById('nav-vlm');
  if (vlmBtn) {
    vlmBtn.style.display = config.enableVlmStudio ? 'flex' : 'none';
  }

  // Auto-updater notifications
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

  // Tray restart
  window.yunisa.onServerRestartRequested(async () => {
    showScreen('loading');
    setLoadingStatus('Restarting AI engine...');
    await window.yunisa.server.stop();
    const active = await window.yunisa.models.getActive();
    if (active) {
      const result = await window.yunisa.server.start(active.path);
      if (result.status === 'ready') { showScreen('chat'); return; }
    }
    setLoadingStatus('Failed to restart server.');
  });

  // Boot sequence
  try {
    const hasModel = await window.yunisa.models.hasAny();
    if (!hasModel) { showScreen('welcome'); return; }

    setLoadingStatus('Starting AI engine...');
    const active = await window.yunisa.models.getActive();
    if (!active) { showScreen('welcome'); return; }

    const result = await window.yunisa.server.start(active.path);
    if (result.status === 'ready') {
      showScreen('chat');
    } else {
      setLoadingStatus('Failed to start server. Check model file.');
    }
  } catch (err) {
    console.error('Boot error:', err);
    setLoadingStatus('Error: ' + (err.message || 'Failed to initialize.'));
  }
}

boot();
