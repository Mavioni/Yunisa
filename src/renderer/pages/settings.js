import { showScreen } from '../app.js';

export async function initSettings() {
  const screen = document.getElementById('settings-screen');
  screen.innerHTML = ''; // Clear previous

  const config = await window.yunisa.config.get();

  const container = document.createElement('div');
  container.className = 'models-container settings-scroll-container';
  
  const header = document.createElement('div');
  header.className = 'settings-header';
  const title = document.createElement('h2');
  title.className = 'settings-title';
  title.textContent = 'Ecosystem Control Subsystem';
  header.appendChild(title);
  
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = '⟨ Back to Chat';
  header.appendChild(backBtn);
  container.appendChild(header);

  const createCard = (titleText, descText) => {
    const card = document.createElement('div');
    card.className = 'model-card settings-card';
    const title = document.createElement('h3');
    title.textContent = titleText;
    const desc = document.createElement('p');
    desc.textContent = descText;
    card.appendChild(title);
    card.appendChild(desc);
    return card;
  };

  const createInput = (placeholder, key) => {
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'settings-input';
    input.placeholder = placeholder;
    input.value = config[key] || '';
    input.addEventListener('change', (e) => window.yunisa.config.set(key, e.target.value));
    return input;
  };

  const createToggle = (labelStr, key) => {
    const label = document.createElement('label');
    label.className = 'settings-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = config[key] || false;
    checkbox.addEventListener('change', (e) => window.yunisa.config.set(key, e.target.checked));
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelStr));
    return label;
  };

  const createSelect = (optionsMap, key) => {
    const select = document.createElement('select');
    select.className = 'settings-select';
    optionsMap.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.text;
      if (config[key] === p.value) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', (e) => window.yunisa.config.set(key, e.target.value));
    return select;
  };

  // 0. App Navigation & Interface
  const navCard = createCard('Application Interface & Navigation', 'Control global layout geometry, themes, and workspace data.');
  navCard.style.borderLeftColor = '#9c27b0';
  navCard.appendChild(createSelect([
    { value: 'dark', text: 'Obsidian Glass (Dark Default)' },
    { value: 'light', text: 'Luminous (Light Edition)' }
  ], 'theme'));
  const themeSelect = navCard.querySelector('select');
  themeSelect.addEventListener('change', (e) => {
    document.body.setAttribute('data-theme', e.target.value);
  });
  
  const clearChatsBtn = document.createElement('button');
  clearChatsBtn.className = 'btn btn-danger';
  clearChatsBtn.style.cssText = 'font-size: 0.85rem; margin-top: 1rem;';
  clearChatsBtn.textContent = 'Clear All Conversations';
  clearChatsBtn.addEventListener('click', async () => {
    if (confirm('Are you absolutely sure you want to permanently delete all Chat conversations?')) {
      clearChatsBtn.disabled = true;
      clearChatsBtn.textContent = 'Clearing...';
      try {
        await window.yunisa.conversations.deleteAll();
        clearChatsBtn.textContent = 'Conversations Cleared ✓';
      } catch (err) {
        clearChatsBtn.textContent = 'Error Clearing Data';
      }
      setTimeout(() => { clearChatsBtn.textContent = 'Clear All Conversations'; clearChatsBtn.disabled = false; }, 3000);
    }
  });
  navCard.appendChild(clearChatsBtn);
  container.appendChild(navCard);

  // 1. Hardware Monitor [System 01 DTIA]
  const sysCard = createCard('System 01 [DTIA] Hardware Monitor', 'Real-time telemetry of the Dialectical Ternary Inference Architecture.');
  sysCard.style.borderLeftColor = '#4caf50';
  const hwGrid = document.createElement('div');
  hwGrid.className = 'settings-hw-grid';
  
  const coreDiv = document.createElement('div');
  const coreLabel = document.createElement('span');
  coreLabel.className = 'settings-hw-label';
  coreLabel.textContent = 'Compute Core';
  const coreValue = document.createElement('div');
  coreValue.id = 'rtx-status';
  coreValue.className = 'settings-hw-value';
  coreValue.style.color = '#4caf50';
  coreValue.textContent = 'SECURE';
  coreDiv.appendChild(coreLabel);
  coreDiv.appendChild(coreValue);
  
  const engineDiv = document.createElement('div');
  const engineLabel = document.createElement('span');
  engineLabel.className = 'settings-hw-label';
  engineLabel.textContent = 'Inference Engine';
  const engineValue = document.createElement('div');
  engineValue.id = 'server-stats';
  engineValue.className = 'settings-hw-value';
  engineValue.style.color = '#2196f3';
  engineValue.textContent = 'Checking...';
  engineDiv.appendChild(engineLabel);
  engineDiv.appendChild(engineValue);
  
  hwGrid.appendChild(coreDiv);
  hwGrid.appendChild(engineDiv);
  sysCard.appendChild(hwGrid);
  sysCard.appendChild(createToggle('Enable DTIA (Dialectical Ternary Inference Architecture Pipeline)', 'enableDtia'));
  container.appendChild(sysCard);

  // 2. Hardware Allocation
  const allocCard = createCard('Resource Allocation', 'Configure local hardware bounds for the Yunisa runtime.');
  allocCard.appendChild(createSelect([
    {value: '4096', text: '4,096 Tokens (Standard)'},
    {value: '8192', text: '8,192 Tokens (Extended)'},
    {value: '16384', text: '16,384 Tokens (Developer)'},
    {value: '32768', text: '32,768 Tokens (Maximum - RTX Requires)'}
  ], 'contextSize'));
  allocCard.appendChild(createSelect([
    {value: 'auto', text: 'Auto-detect Physical Cores'},
    {value: '4', text: '4 Threads (Low Power)'},
    {value: '8', text: '8 Threads (Balanced)'},
    {value: 'max', text: 'Max Threads (Aggressive)'}
  ], 'cpuThreads'));
  allocCard.appendChild(createToggle('Unlimited Context (send full conversation history without token truncation)', 'unlimitedContext'));
  container.appendChild(allocCard);

  // 3. System 08 [P.S.AI] Personas
  const psaiCard = createCard('System 08 [P.S.AI] Identity Core', 'Bind Yunisa to specific Historical Figure Resurrection or Advisory personas.');
  psaiCard.appendChild(createSelect([
    { value: 'default', text: 'Baseline Intelligence (Default)' },
    { value: 'sovereign', text: 'The Sovereign Advisor' },
    { value: 'kinetic', text: 'Kinetic High-Energy Director' },
    { value: 'cyberdeck', text: 'System 07 Cyberdeck Protocol' }
  ], 'psaiCore'));
  container.appendChild(psaiCard);

  // 4. System 05 [CoRax] Governance
  const coraxCard = createCard('System 05 [CoRax] Governance', 'Constitutional Agent framework filtering and output safety parameters.');
  coraxCard.appendChild(createSelect([
    { value: 'strict', text: 'Absolute Output Filtering (Strict)' },
    { value: 'guarded', text: 'Constitutional Boundaries (Guarded)' },
    { value: 'unrestricted', text: 'Unrestricted Developer Mode (Danger)' }
  ], 'coraxLevel'));
  container.appendChild(coraxCard);


  // 6. External Orbits [NIM]
  const nimCard = createCard('NVIDIA NIM Cloud Inference', 'Route inference to NVIDIA cloud when local hardware is insufficient. Leave API key empty to use local engine.');
  nimCard.style.borderLeftColor = '#76b900';
  nimCard.appendChild(createInput('nvapi-xxxxxxxxxxxxxxxxxxxxxxxx', 'nvidiaApiKey'));
  const nimModelInput = document.createElement('input');
  nimModelInput.type = 'text';
  nimModelInput.className = 'settings-input';
  nimModelInput.placeholder = 'Model ID (default: meta/llama-3.1-70b-instruct)';
  nimModelInput.value = config['nimModel'] || '';
  nimModelInput.addEventListener('change', (e) => window.yunisa.config.set('nimModel', e.target.value));
  nimCard.appendChild(nimModelInput);
  nimCard.appendChild(createToggle('Airgap Mode: Prevent all outbound NIM/Internet telemetry automatically', 'airgapMode'));
  container.appendChild(nimCard);

  // 7. NemoClaw Sandbox Boundary
  const clawCard = createCard('NemoClaw Ecosystem Sandbox', 'Configure network permissions for the NemoClaw Agent container.');
  clawCard.style.borderLeftColor = '#ffc107';
  clawCard.appendChild(createToggle('Enable Online Mode (Allow NemoClaw agents unrestricted live internet access)', 'nemoclawOnlineMode'));
  clawCard.appendChild(createToggle('Use Docker Container Boundary (Isolates execution. Native runs on host machine).', 'nemoclawUseDocker'));
  container.appendChild(clawCard);

  // 8. Experimential Architecture
  const devCard = createCard('Developer Subsystems', 'Enable radical experimental architecture modes.');
  devCard.style.borderLeftColor = '#2196f3';
  
  const devToggle = createToggle('Initialize VLM Matrix Studio (WARNING: Requires Extreme Hardware > 80GB VRAM)', 'enableVlmStudio');
  const checkbox = devToggle.querySelector('input');
  checkbox.addEventListener('change', (e) => {
    const btn = document.getElementById('nav-vlm');
    if (btn) btn.classList.toggle('hidden', !e.target.checked);
  });
  
  devCard.appendChild(devToggle);
  container.appendChild(devCard);

  // 9. Engine Control
  const engineCard = createCard('Inference Engine Control', 'Restart the local AI backend without restarting the full application.');
  engineCard.style.borderLeftColor = '#f44336';
  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn btn-danger';
  restartBtn.style.cssText = 'font-size: 0.85rem; margin-top: 0.5rem;';
  restartBtn.textContent = 'Restart Inference Engine';
  restartBtn.addEventListener('click', async () => {
    restartBtn.disabled = true;
    restartBtn.textContent = 'Restarting...';
    await window.yunisa.server.stop();
    const active = await window.yunisa.models.getActive();
    if (active) {
      const result = await window.yunisa.server.start(active.path);
      restartBtn.textContent = result.status === 'ready' ? 'Engine Restarted ✓' : 'Failed — Check Logs';
    } else {
      restartBtn.textContent = 'No Active Model';
    }
    setTimeout(() => { restartBtn.textContent = 'Restart Inference Engine'; restartBtn.disabled = false; }, 3000);
  });
  engineCard.appendChild(restartBtn);
  container.appendChild(engineCard);

  screen.appendChild(container);

  backBtn.addEventListener('click', () => showScreen('chat'));

  const observer = new MutationObserver(async () => {
    if (screen.classList.contains('active')) {
      const status = await window.yunisa.server.status();
      const port = await window.yunisa.server.port();
      const el = document.getElementById('server-stats');
      if (el) el.textContent = status.toUpperCase() + ' // PORT: ' + port;
    }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
}
