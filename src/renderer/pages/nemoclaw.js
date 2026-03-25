import { showScreen } from '../app.js';

export function initNemoclaw() {
  const screen = document.getElementById('nemoclaw-screen');
  if (!screen) return;

  const container = document.createElement('div');
  container.className = 'nemoclaw-container';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'nemoclaw-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'nemoclaw-title-row';
  const title = document.createElement('h2');
  title.innerHTML = '<span style="color:#00ff41;">⟐</span> NemoClaw OpenShell Sandbox';
  titleRow.appendChild(title);

  const statusDot = document.createElement('span');
  statusDot.className = 'nemoclaw-status offline';
  statusDot.id = 'nemoclaw-status-dot';
  statusDot.textContent = 'Offline';
  titleRow.appendChild(statusDot);
  header.appendChild(titleRow);

  const controls = document.createElement('div');
  controls.className = 'nemoclaw-controls';

  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = 'Start Sandbox';
  startBtn.id = 'nemoclaw-start-btn';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'btn btn-danger';
  stopBtn.textContent = 'Stop';
  stopBtn.id = 'nemoclaw-stop-btn';
  stopBtn.style.display = 'none';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = '⟨ Back to Chat';
  backBtn.addEventListener('click', () => showScreen('chat'));

  controls.appendChild(startBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(backBtn);
  header.appendChild(controls);
  container.appendChild(header);

  // ── Iframe container ──
  const iframeWrap = document.createElement('div');
  iframeWrap.className = 'nemoclaw-iframe-wrap';
  iframeWrap.id = 'nemoclaw-iframe-wrap';

  const placeholder = document.createElement('div');
  placeholder.className = 'nemoclaw-placeholder';
  placeholder.innerHTML = `
    <div class="nemoclaw-placeholder-icon">⟐</div>
    <h3>NemoClaw OpenShell Sandbox</h3>
    <p>Autonomous agent execution environment. Click <strong>Start Sandbox</strong> to boot the Flask agent dashboard.</p>
    <p class="nemoclaw-placeholder-sub">Runs at <code>http://127.0.0.1:3000</code> — Docker isolation available in Settings.</p>
  `;
  iframeWrap.appendChild(placeholder);
  container.appendChild(iframeWrap);

  screen.appendChild(container);

  // ── Logic ──
  let isRunning = false;

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';
    const dot = document.getElementById('nemoclaw-status-dot');

    try {
      const result = await window.yunisa.nemoclaw.start();
      isRunning = true;

      if (dot) { dot.className = 'nemoclaw-status online'; dot.textContent = 'Online'; }
      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';

      // Replace placeholder with iframe
      const wrap = document.getElementById('nemoclaw-iframe-wrap');
      if (wrap) {
        wrap.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.className = 'nemoclaw-iframe';
        iframe.src = `http://127.0.0.1:${result.port || 3000}`;
        iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
        wrap.appendChild(iframe);
      }
    } catch (err) {
      startBtn.textContent = 'Failed — Retry';
      startBtn.disabled = false;
      if (dot) { dot.className = 'nemoclaw-status error'; dot.textContent = 'Error'; }
    }
  });

  stopBtn.addEventListener('click', async () => {
    await window.yunisa.nemoclaw.stop();
    isRunning = false;

    const dot = document.getElementById('nemoclaw-status-dot');
    if (dot) { dot.className = 'nemoclaw-status offline'; dot.textContent = 'Offline'; }
    stopBtn.style.display = 'none';
    startBtn.style.display = 'inline-flex';
    startBtn.textContent = 'Start Sandbox';
    startBtn.disabled = false;

    // Replace iframe with placeholder
    const wrap = document.getElementById('nemoclaw-iframe-wrap');
    if (wrap) {
      wrap.innerHTML = '';
      const ph = document.createElement('div');
      ph.className = 'nemoclaw-placeholder';
      ph.innerHTML = `
        <div class="nemoclaw-placeholder-icon">⟐</div>
        <h3>Sandbox Stopped</h3>
        <p>Click <strong>Start Sandbox</strong> to restart.</p>
      `;
      wrap.appendChild(ph);
    }
  });

  // Check status when screen becomes active
  const observer = new MutationObserver(async () => {
    if (screen.classList.contains('active')) {
      try {
        const status = await window.yunisa.nemoclaw.status();
        const dot = document.getElementById('nemoclaw-status-dot');
        if (status.running) {
          if (dot) { dot.className = 'nemoclaw-status online'; dot.textContent = 'Online'; }
          startBtn.style.display = 'none';
          stopBtn.style.display = 'inline-flex';
        }
      } catch {}
    }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
}
