import { showScreen } from '../app.js';

export function initNemoclaw() {
  const container = document.getElementById('nemoclaw-screen');
  container.innerHTML = '';
  
  container.style.flexDirection = 'column';
  container.style.width = '100%';
  container.style.position = 'relative';

  // ── Top Header Bar ──────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = 'height: 50px; background: #0f3460; display: flex; align-items: center; padding: 0 1rem; justify-content: space-between; border-bottom: 2px solid #00ff00;';
  
  const title = document.createElement('h3');
  title.style.cssText = 'color: #fff; margin: 0; font-family: monospace; font-size: 1rem;';
  title.innerHTML = '<span style="color:#00ff00;">●</span> NVIDIA NEMOCLAW [OpenShell Sandbox]';
  header.appendChild(title);
  
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-primary';
  backBtn.style.cssText = 'padding: 0.25rem 0.75rem; background: transparent; border: 1px solid #00ff00; color: #00ff00;';
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
    <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; border-radius: 50%; border: 2px solid #e94560; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 2rem; color: #e94560;">⟐</span>
    </div>
    <h2 style="color: #e94560; margin-bottom: 0.5rem; letter-spacing: 2px;">OFFLINE NODE</h2>
    <p style="margin-bottom: 1.5rem; line-height: 1.6; color: #555;">
      The NemoClaw OpenShell sandbox is not currently active.<br>
      Click below to initialize the agent dashboard.
    </p>
  `;

  const bootBtn = document.createElement('button');
  bootBtn.id = 'nemoclaw-boot-btn';
  bootBtn.textContent = '⟐  Initialize OpenShell Sandbox';
  bootBtn.style.cssText = `
    background: linear-gradient(135deg, #00ff41 0%, #00cc33 100%);
    color: #0a0e17; border: none; border-radius: 8px;
    padding: 0.85rem 2.5rem; font-weight: 700; font-family: monospace;
    cursor: pointer; text-transform: uppercase; letter-spacing: 2px;
    font-size: 0.9rem; transition: all 0.3s ease;
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
  `;
  bootBtn.onmouseenter = () => { bootBtn.style.boxShadow = '0 0 35px rgba(0, 255, 65, 0.5)'; };
  bootBtn.onmouseleave = () => { bootBtn.style.boxShadow = '0 0 20px rgba(0, 255, 65, 0.2)'; };

  bootBtn.onclick = async () => {
    bootBtn.disabled = true;
    bootBtn.textContent = 'Booting Sandbox...';
    bootBtn.style.opacity = '0.6';

    try {
      const result = await window.yunisa.nemoclaw.start();
      if (result.status === 'started' || result.status === 'already_running') {
        // Hide fallback, show iframe
        fallback.style.display = 'none';
        iframe.src = 'http://127.0.0.1:3000';
        iframe.style.display = 'block';
      }
    } catch (err) {
      bootBtn.textContent = 'Boot Failed — Retry';
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

  // ── Sidebar button binding ──────────────────────────────────────
  const btn = document.getElementById('nemoclaw-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      showScreen('nemoclaw');
    });
  }
}
