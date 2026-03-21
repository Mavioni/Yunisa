import { showScreen } from '../app.js';

export async function initSettings() {
  const screen = document.getElementById('settings-screen');
  screen.innerHTML = ''; // Clear previous

  const config = await window.yunisa.config.get();

  const container = document.createElement('div');
  container.className = 'models-container settings-scroll-container';
  container.style.cssText = 'width: 100%; max-width: 800px; margin: 0 auto; padding: 1.5rem; align-self: flex-start; overflow-y: auto; max-height: 100%;';
  
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid #333; padding-bottom: 0.75rem;';
  const title = document.createElement('h2');
  title.style.cssText = 'color: #e94560; margin: 0; font-weight: 300; letter-spacing: 2px; text-transform: uppercase; font-size: 1.25rem;';
  title.textContent = 'Ecosystem Control Subsystem';
  header.appendChild(title);
  
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = '⟨ Initialize Chat Sequence';
  header.appendChild(backBtn);
  container.appendChild(header);

  const createCard = (titleText, descText) => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.style.cssText = 'margin-bottom: 0.75rem; padding: 1rem 1.25rem; border-left: 3px solid #00a1ff; background: rgba(15, 52, 96, 0.1); display: flex; flex-direction: column; gap: 0.5rem;';
    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0; color: #fff; font-size: 1.1rem;';
    title.textContent = titleText;
    const desc = document.createElement('p');
    desc.style.cssText = 'margin: 0; color: #aaa; font-size: 0.9rem;';
    desc.textContent = descText;
    card.appendChild(title);
    card.appendChild(desc);
    return card;
  };

  const createInput = (placeholder, key) => {
    const input = document.createElement('input');
    input.type = 'password';
    input.style.cssText = 'width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid #333; border-radius: 4px; outline: none; transition: border 0.2s; box-sizing: border-box;';
    input.placeholder = placeholder;
    input.value = config[key] || '';
    input.addEventListener('focus', () => input.style.borderColor = '#00a1ff');
    input.addEventListener('blur', () => input.style.borderColor = '#333');
    input.addEventListener('change', (e) => window.yunisa.config.set(key, e.target.value));
    return input;
  };

  const createToggle = (labelStr, key) => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; color: #fff; cursor: pointer; user-select: none; font-size: 0.95rem;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.cssText = 'width: 16px; height: 16px; accent-color: #e94560; cursor: pointer;';
    checkbox.checked = config[key] || false;
    checkbox.addEventListener('change', (e) => window.yunisa.config.set(key, e.target.checked));
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelStr));
    return label;
  };

  const createSelect = (optionsMap, key) => {
    const select = document.createElement('select');
    select.style.cssText = 'width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); color: #fff; border: 1px solid #333; border-radius: 4px; outline: none; cursor: pointer; box-sizing: border-box;';
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
  sysCard.style.borderLeftColor = '#00ff00';
  sysCard.innerHTML += `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; background: #0b0f19; padding: 1rem; border-radius: 6px;">
        <div>
            <span style="color: #888; font-size: 0.8rem; text-transform: uppercase;">Compute Core</span>
            <div id="rtx-status" style="color: #00ff00; font-family: monospace; font-size: 1.1rem; margin-top: 0.25rem;">SECURE</div>
        </div>
        <div>
            <span style="color: #888; font-size: 0.8rem; text-transform: uppercase;">Inference Engine</span>
            <div id="server-stats" style="color: #00a1ff; font-family: monospace; font-size: 1.1rem; margin-top: 0.25rem;">Checking...</div>
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
  nimCard.style.borderLeftColor = '#e94560';
  nimCard.appendChild(createInput('nvapi-xxxxxxxxxxxxxxxxxxxxxxxx', 'nvidiaApiKey'));
  nimCard.appendChild(createToggle('Airgap Mode: Prevent all outbound NIM/Internet telemetry automatically', 'airgapMode'));
  container.appendChild(nimCard);

  // 7. NemoClaw Sandbox Boundary
  const clawCard = createCard('NemoClaw Ecosystem Sandbox', 'Configure network permissions for the NemoClaw Agent container.');
  clawCard.style.borderLeftColor = '#f59e0b';
  clawCard.appendChild(createToggle('Enable Online Mode (Allow NemoClaw agents unrestricted live internet access)', 'nemoclawOnlineMode'));
  container.appendChild(clawCard);

  // 8. Experimential Architecture
  const devCard = createCard('Developer Subsystems', 'Enable radical experimental architecture modes.');
  devCard.style.borderLeftColor = '#a855f7';
  
  const devToggle = createToggle('Initialize VLM Matrix Studio (WARNING: Requires Extreme Hardware > 80GB VRAM)', 'enableVlmStudio');
  const checkbox = devToggle.querySelector('input');
  checkbox.addEventListener('change', (e) => {
    const btn = document.getElementById('vlm-btn');
    if (btn) btn.style.display = e.target.checked ? 'block' : 'none';
  });
  
  devCard.appendChild(devToggle);
  container.appendChild(devCard);

  // 9. Engine Control
  const engineCard = createCard('Inference Engine Control', 'Restart the local AI backend without restarting the full application.');
  engineCard.style.borderLeftColor = '#e94560';
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
