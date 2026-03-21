import { showScreen } from '../app.js';

export function initNemoclaw() {
  const container = document.getElementById('nemoclaw-screen');
  container.innerHTML = '';
  
  container.style.flexDirection = 'column';
  container.style.width = '100%';
  container.style.position = 'relative';

  // ── Header & Tabs ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'sandbox-header';
  
  const titleGroup = document.createElement('div');
  titleGroup.className = 'sandbox-title-group';
  titleGroup.innerHTML = '<span style="color:var(--green); font-size: 1.2rem;">⟐</span><span style="font-family: var(--font-display); font-weight: 500; font-size: 1rem; letter-spacing: 0.1em; color: #fff;">SANDBOX</span>';
  header.appendChild(titleGroup);

  const createTabBtn = (text, iconFile, active = false) => {
    const btn = document.createElement('button');
    btn.innerHTML = `<img src="assets/icons/${iconFile}" class="tab-icon"> ${text}`;
    btn.style.cssText = `
      background: transparent; border: none; font-family: var(--font-display); font-size: 0.82rem; font-weight: 500;
      color: ${active ? 'var(--blue)' : 'var(--text-secondary)'}; padding: 0.5rem 1rem; border-radius: 6px;
      cursor: pointer; transition: all 0.2s; letter-spacing: 0.05em; display: flex; align-items: center;
      ${active ? 'background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2);' : 'border: 1px solid transparent;'}
    `;
    btn.onmouseenter = () => { if(!btn.dataset.active) btn.style.color = '#fff'; };
    btn.onmouseleave = () => { if(!btn.dataset.active) btn.style.color = 'var(--text-secondary)'; };
    if (active) btn.dataset.active = "true";
    return btn;
  };

  const tabOpenShell = createTabBtn('OPENSHELL', 'tab_openshell.png', true);
  const tabTrt = createTabBtn('NVIDIA TRT', 'tab_nvidia.png', false);

  header.appendChild(tabOpenShell);
  header.appendChild(tabTrt);
  
  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  header.appendChild(spacer);

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.style.padding = '0.4rem 0.8rem';
  backBtn.textContent = 'Exit Sandbox';
  backBtn.onclick = () => showScreen('chat');
  header.appendChild(backBtn);
  
  container.appendChild(header);

  // ── Main Content Area ───────────────────────────────────────────
  const contentArea = document.createElement('div');
  contentArea.className = 'sandbox-content';
  container.appendChild(contentArea);

  // ── Tab 1: OpenShell Dashboard ──────────────────────────────────
  const panelOpenShell = document.createElement('div');
  panelOpenShell.style.cssText = 'width: 100%; height: 100%; display: flex; flex-direction: column; position: relative;';

  const fallback = document.createElement('div');
  fallback.id = 'nemoclaw-fallback';
  fallback.className = 'sandbox-fallback';
  fallback.innerHTML = `
    <div style="width: 70px; height: 70px; margin: 0 auto 1.5rem; border-radius: 50%; border: 2px solid var(--red); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 20px var(--red-soft);">
      <span style="font-size: 1.8rem; color: var(--red);">⟐</span>
    </div>
    <h2 style="color: var(--text-primary); margin-bottom: 0.5rem; letter-spacing: 0.1em; font-family: var(--font-display); font-weight: 500;">VM OFFLINE</h2>
    <p style="margin-bottom: 1.5rem; line-height: 1.6; font-size: 0.85rem;">
      The OpenClaw Virtual Machine is suspended to preserve local host resources.
    </p>
  `;

  const bootBtn = document.createElement('button');
  bootBtn.textContent = 'Initialize VM Instance';
  bootBtn.className = 'btn btn-primary';
  bootBtn.style.width = '100%';

  bootBtn.onclick = async () => {
    bootBtn.disabled = true;
    bootBtn.textContent = 'Booting Subsystem...';

    const progWrap = document.createElement('div');
    progWrap.style.cssText = 'width:100%; margin-top:1.5rem;';
    const progBar = document.createElement('div');
    progBar.style.cssText = 'height:4px; background:var(--border); border-radius:2px; overflow:hidden;';
    const progFill = document.createElement('div');
    progFill.style.cssText = 'height:100%; width:0%; background:var(--blue); transition:width 0.5s ease; box-shadow: 0 0 10px var(--blue-glow);';
    progBar.appendChild(progFill);
    progWrap.appendChild(progBar);
    const statusText = document.createElement('p');
    statusText.style.cssText = 'color:var(--text-secondary); font-size:0.75rem; margin-top:0.75rem; font-family:var(--font-mono);';
    statusText.textContent = '[1/4] Checking Docker daemon...';
    progWrap.appendChild(statusText);
    fallback.appendChild(progWrap);

    const stages = [
      { pct: '25%', text: '[1/4] Checking Docker daemon...' },
      { pct: '50%', text: '[2/4] Initializing VM Sandbox...' },
      { pct: '75%', text: '[3/4] Binding OpenShell interfaces...' },
      { pct: '90%', text: '[4/4] Starting bridge server...' },
    ];
    let stageIdx = 0;
    const stageInterval = setInterval(() => {
      if (stageIdx < stages.length) {
        progFill.style.width = stages[stageIdx].pct;
        statusText.textContent = stages[stageIdx].text;
        stageIdx++;
      }
    }, 1200);

    try {
      const result = await window.yunisa.nemoclaw.start();
      clearInterval(stageInterval);
      progFill.style.width = '100%';
      progFill.style.background = 'var(--green)';
      progFill.style.boxShadow = '0 0 10px var(--green-glow)';
      statusText.textContent = '[OK] Sandbox online.';
      if (result.status === 'started' || result.status === 'already_running' || result.status === 'started_native' || result.status === 'started_secure_container') {
        setTimeout(() => {
          fallback.style.display = 'none';
          iframe.src = 'http://127.0.0.1:3000';
          iframe.style.display = 'block';
          iframe.style.animation = 'fadeIn 0.5s ease';
        }, 800);
      }
    } catch (err) {
      clearInterval(stageInterval);
      progFill.style.background = 'var(--red)';
      progFill.style.width = '100%';
      statusText.style.color = 'var(--red)';
      statusText.textContent = '[FAIL] ' + (err.message || 'Boot failed');
      bootBtn.textContent = 'Retry Boot';
      bootBtn.disabled = false;
    }
  };

  fallback.appendChild(bootBtn);
  panelOpenShell.appendChild(fallback);

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position: relative; z-index: 1; width: 100%; height: 100%; border: none; background: transparent; display: none;';
  panelOpenShell.appendChild(iframe);
  
  contentArea.appendChild(panelOpenShell);

  // ── Tab 2: Root Terminal ────────────────────────────────────────
  // [CRITICAL SECURITY FIX]: UI layer completely stripped to align with backend RCE patch. 
  // Native terminal emulation must use node-pty + xterm.js in the future.
  

  // ── Tab 3: NVIDIA TRT ──────────────────────────────────────────
  const panelTrt = document.createElement('div');
  panelTrt.className = 'sandbox-trt-panel';
  panelTrt.innerHTML = `
    <span style="font-size: 3rem; margin-bottom: 1rem; color: #76b900;">⚙️</span>
    <h3 style="color: #76b900; letter-spacing: 0.1em; margin-bottom: 0.5rem;">NVIDIA TENSORRT INTEGRATION</h3>
    <p style="font-size: 0.9rem;">The native TRT-LLM UI node is currently suspended.</p>
  `;
  contentArea.appendChild(panelTrt);

  // ── Tab Logic ──────────────────────────────────────────────────
  const panels = { OpenShell: panelOpenShell, Trt: panelTrt };
  const tabs = { OpenShell: tabOpenShell, Trt: tabTrt };

  const switchTab = (tabName) => {
    Object.values(panels).forEach(p => p.style.display = 'none');
    Object.values(tabs).forEach(t => {
      t.dataset.active = "false";
      t.style.background = 'transparent';
      t.style.border = '1px solid transparent';
      t.style.color = 'var(--text-secondary)';
    });
    
    panels[tabName].style.display = 'flex';
    const activeTab = tabs[tabName];
    activeTab.dataset.active = "true";
    activeTab.style.color = 'var(--blue)';
    activeTab.style.background = 'rgba(59, 130, 246, 0.1)';
    activeTab.style.border = '1px solid rgba(59, 130, 246, 0.2)';
  };

  tabOpenShell.onclick = () => switchTab('OpenShell');
  tabTrt.onclick = () => switchTab('Trt');

  // Check if OpenShell is already running
  (async () => {
    try {
      const status = await window.yunisa.nemoclaw.status();
      if (status.running) {
        fallback.style.display = 'none';
        iframe.src = 'http://127.0.0.1:3000';
        iframe.style.display = 'block';
      }
    } catch {}
  })();
}
