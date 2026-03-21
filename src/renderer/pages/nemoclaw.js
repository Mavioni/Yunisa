import { showScreen } from '../app.js';

export function initNemoclaw() {
  const container = document.getElementById('nemoclaw-screen');
  container.innerHTML = '';
  
  container.style.flexDirection = 'column';
  container.style.width = '100%';
  container.style.position = 'relative';

  // ── Top Header Bar ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = 'height: 50px; background: var(--bg-panel, rgba(10,16,26,0.85)); display: flex; align-items: center; padding: 0 1rem; justify-content: space-between; border-bottom: 2px solid #4caf50;';
  
  const title = document.createElement('h3');
  title.style.cssText = 'color: var(--text-primary, #c8d8f0); margin: 0; font-family: monospace; font-size: 1rem;';
  title.innerHTML = '<span style="color:#4caf50;">●</span> NVIDIA NEMOCLAW [OpenShell Sandbox]';
  header.appendChild(title);
  
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-primary';
  backBtn.style.cssText = 'padding: 0.25rem 0.75rem; background: transparent; border: 1px solid #4caf50; color: #4caf50;';
  backBtn.textContent = 'Disconnect & Return';
  backBtn.onclick = () => showScreen('chat');
  header.appendChild(backBtn);
  
  container.appendChild(header);

  // ── Offline Fallback with Boot Button ───────────────────────────
  const fallback = document.createElement('div');
  fallback.id = 'nemoclaw-fallback';
  fallback.style.cssText = `
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    text-align: center; font-family: monospace; color: #777; z-index: 2;
    pointer-events: auto; width: 80%; max-width: 500px;
  `;
  fallback.innerHTML = `
    <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; border-radius: 50%; border: 2px solid #f44336; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 2rem; color: #f44336;">⟐</span>
    </div>
    <h2 style="color: #f44336; margin-bottom: 0.5rem; letter-spacing: 2px;">OFFLINE NODE</h2>
    <p style="margin-bottom: 1.5rem; line-height: 1.6; color: #555;">
      The NemoClaw OpenShell sandbox is not currently active.<br>
      Click below to initialize the agent dashboard.
    </p>
  `;

  const bootBtn = document.createElement('button');
  bootBtn.id = 'nemoclaw-boot-btn';
  bootBtn.textContent = '⟐  Initialize OpenShell Sandbox';
  bootBtn.style.cssText = `
    background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
    color: #0a0e17; border: none; border-radius: 8px;
    padding: 0.85rem 2.5rem; font-weight: 700; font-family: monospace;
    cursor: pointer; text-transform: uppercase; letter-spacing: 2px;
    font-size: 0.9rem; transition: all 0.3s ease;
    box-shadow: 0 0 20px rgba(76, 175, 80, 0.2);
  `;
  bootBtn.onmouseenter = () => { bootBtn.style.boxShadow = '0 0 35px rgba(76, 175, 80, 0.5)'; };
  bootBtn.onmouseleave = () => { bootBtn.style.boxShadow = '0 0 20px rgba(76, 175, 80, 0.2)'; };

  bootBtn.onclick = async () => {
    bootBtn.disabled = true;
    bootBtn.textContent = 'Initializing...';
    bootBtn.style.opacity = '0.6';

    // Progress bar
    const progWrap = document.createElement('div');
    progWrap.style.cssText = 'width:100%; margin-top:1.5rem;';
    const progBar = document.createElement('div');
    progBar.style.cssText = 'height:4px; background:#1a1f2e; border-radius:2px; overflow:hidden;';
    const progFill = document.createElement('div');
    progFill.style.cssText = 'height:100%; width:0%; background:linear-gradient(90deg,#4caf50,#388e3c); transition:width 0.5s ease;';
    progBar.appendChild(progFill);
    progWrap.appendChild(progBar);
    const statusText = document.createElement('p');
    statusText.style.cssText = 'color:#4caf50; font-size:0.8rem; margin-top:0.5rem; font-family:monospace;';
    statusText.textContent = '[1/5] Checking Docker daemon...';
    progWrap.appendChild(statusText);
    fallback.appendChild(progWrap);

    // Animated boot stages
    const stages = [
      { pct: '15%', text: '[1/5] Checking Docker daemon...' },
      { pct: '30%', text: '[2/5] Building sandbox image...' },
      { pct: '50%', text: '[3/5] Provisioning virtual display...' },
      { pct: '70%', text: '[4/5] Binding Agent-S modules...' },
      { pct: '85%', text: '[5/5] Starting Flask server...' },
    ];
    let stageIdx = 0;
    const stageInterval = setInterval(() => {
      if (stageIdx < stages.length) {
        progFill.style.width = stages[stageIdx].pct;
        statusText.textContent = stages[stageIdx].text;
        stageIdx++;
      }
    }, 1500);

    try {
      const result = await window.yunisa.nemoclaw.start();
      clearInterval(stageInterval);
      progFill.style.width = '100%';
      statusText.textContent = '[OK] Sandbox online.';
      if (result.status === 'started' || result.status === 'already_running' || result.status === 'started_native' || result.status === 'started_secure_container') {
        setTimeout(() => {
          fallback.style.display = 'none';
          iframe.src = 'http://127.0.0.1:3000';
          iframe.style.display = 'block';
        }, 800);
      }
    } catch (err) {
      clearInterval(stageInterval);
      progFill.style.background = '#f44336';
      progFill.style.width = '100%';
      statusText.style.color = '#f44336';
      statusText.textContent = '[FAIL] ' + (err.message || 'Boot failed');
      bootBtn.textContent = 'Retry Boot';
      bootBtn.style.opacity = '1';
      bootBtn.disabled = false;
    }
  };

  fallback.appendChild(bootBtn);
  container.appendChild(fallback);

  // ── NemoClaw Iframe (hidden until booted) ───────────────────────
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position: relative; z-index: 1; width: 100%; height: calc(100% - 50px); border: none; background: transparent; display: none;';
  container.appendChild(iframe);

  // ── Check if already running on load ────────────────────────────
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
