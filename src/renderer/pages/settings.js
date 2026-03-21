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
  backBtn.textContent = '⟨ Initialize Chat Sequence';
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

  // 1. Hardware Monitor [System 01 DTIA]
  const sysCard = createCard('System 01 [DTIA] Hardware Monitor', 'Real-time telemetry of the Dialectical Ternary Inference Architecture.');
  sysCard.style.borderLeftColor = '#4caf50';
  sysCard.innerHTML += `
    <div class="settings-hw-grid">
        <div>
            <span class="settings-hw-label">Compute Core</span>
            <div id="rtx-status" class="settings-hw-value" style="color: #4caf50;">SECURE</div>
        </div>
        <div>
            <span class="settings-hw-label">Inference Engine</span>
            <div id="server-stats" class="settings-hw-value" style="color: #2196f3;">Checking...</div>
        </div>
    </div>
  `;
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
  const nimCard = createCard('NVIDIA Inference Microservices [NIM]', 'Secure bridge for offloading tensor operations beyond local hardware limits.');
  nimCard.style.borderLeftColor = '#f44336';
  nimCard.appendChild(createInput('nvapi-xxxxxxxxxxxxxxxxxxxxxxxx', 'nvidiaApiKey'));
  nimCard.appendChild(createToggle('Airgap Mode: Prevent all outbound NIM/Internet telemetry automatically', 'airgapMode'));
  container.appendChild(nimCard);

  // 7. NemoClaw Sandbox Boundary
  const clawCard = createCard('NemoClaw Ecosystem Sandbox', 'Configure network permissions for the NemoClaw Agent container.');
  clawCard.style.borderLeftColor = '#ffc107';
  clawCard.appendChild(createToggle('Enable Online Mode (Allow NemoClaw agents unrestricted live internet access)', 'nemoclawOnlineMode'));
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
