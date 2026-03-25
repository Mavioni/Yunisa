console.log("[Renderer] Loading app.js modules...");
import { initChat } from './pages/chat.js';
import { initWelcome } from './pages/welcome.js';
import { initModels } from './pages/models.js';
import { initSettings } from './pages/settings.js';
import { initVlm } from './pages/vlm.js';
import { initNemoclaw } from './pages/nemoclaw.js';
import { initNexus } from './pages/nexus.js';
import { initWorldView } from './pages/worldview.js';

const screens = {
  loading: document.getElementById('loading-screen'),
  welcome: document.getElementById('welcome-screen'),
  chat: document.getElementById('chat-screen'),
  models: document.getElementById('models-screen'),
  settings: document.getElementById('settings-screen'),
  vlm: document.getElementById('vlm-screen'),
  nemoclaw: document.getElementById('nemoclaw-screen'),
  nexus: document.getElementById('nexus-screen'),
  worldview: document.getElementById('worldview-screen'),
};

const NAV_MAP = {
  'nav-chat': 'chat',
  'nav-models': 'models',
  'nav-vlm': 'vlm',
  'nav-nemoclaw': 'nemoclaw',
  'nav-nexus': 'nexus',
  'nav-worldview': 'worldview',
  'nav-settings': 'settings',
};

// Screens that show the conversation panel
const CHAT_SCREENS = new Set(['chat']);

let currentScreen = 'loading';

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
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
  initVlm();
  initNemoclaw();
  initNexus();
  initWorldView();

  // Wire icon rail navigation
  Object.entries(NAV_MAP).forEach(([btnId, screenName]) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => showScreen(screenName));
    }
  });

  // Pre-flight setup
  const config = await window.yunisa.config.get();
  const vlmBtn = document.getElementById('nav-vlm');
  if (vlmBtn) {
    vlmBtn.classList.toggle('hidden', !config.enableVlmStudio);
  }
  if (config.theme) {
    document.body.setAttribute('data-theme', config.theme);
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

  // Seamless engine chain — log active tier, no user action required
  if (window.yunisa.on) {
    window.yunisa.on('server:engine-active', (engineName) => {
      console.log(`[YUNISA] Engine online: ${engineName}`);
      // Optionally surface in status bar later
    });

    // P3: Interpreter crash → inline banner
    window.yunisa.on('interpreter:crashed', () => {
      const banner = document.getElementById('interpreter-crash-banner');
      if (banner) banner.style.display = 'flex';
    });
    window.yunisa.on('interpreter:restarted', () => {
      const banner = document.getElementById('interpreter-crash-banner');
      if (banner) banner.style.display = 'none';
    });
  }


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
      setLoadingStatus('All inference engines failed to start.');
      // Give the user a clear path forward
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.insertAdjacentHTML('beforeend', `
          <div style="margin-top:1.5rem;display:flex;flex-direction:column;align-items:center;gap:0.75rem;">
            <p style="color:var(--text-secondary);font-size:0.9rem;max-width:420px;text-align:center;line-height:1.6;">
              Local engines (llama.cpp, AirLLM) could not start.<br>
              Add an <strong>NVIDIA API Key</strong> in Settings to enable cloud inference as a fallback.
            </p>
            <button id="boot-settings-btn" class="btn btn-primary" style="min-width:180px;">⚙️ Open Settings</button>
            <button id="boot-retry-btn" class="btn btn-ghost" style="min-width:180px;">🔄 Retry</button>
          </div>`);
        document.getElementById('boot-settings-btn')?.addEventListener('click', () => showScreen('settings'));
        document.getElementById('boot-retry-btn')?.addEventListener('click', () => boot());
      }
    }
  } catch (err) {
    console.error('Boot error:', err);
    setLoadingStatus('Error: ' + (err.message || 'Failed to initialize.'));
  }
}

boot();
