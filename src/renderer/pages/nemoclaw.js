import { showScreen } from '../app.js';

export function initNemoclaw() {
  const container = document.getElementById('nemoclaw-screen');
  container.innerHTML = '';
  
  // Add a top header bar for navigating back, because iframes eat inputs sometimes
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

  container.style.position = 'relative';

  const fallback = document.createElement('div');
  fallback.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; font-family: monospace; color: #777; z-index: 0; pointer-events: none; width: 100%;';
  fallback.innerHTML = `<h2 style="color: #e94560; margin-bottom: 0.5rem;">OFFLINE NODE</h2><p>NVIDIA NemoClaw sandbox is completely disconnected.<br>Ensure the OpenShell container is actively broadcasting on Port 3000.</p>`;
  container.appendChild(fallback);

  // Mount the NemoClaw iframe
  const iframe = document.createElement('iframe');
  iframe.src = 'http://127.0.0.1:3000'; // Standard local execution port for UI dashboards
  iframe.style.cssText = 'position: relative; z-index: 1; width: 100%; height: calc(100% - 50px); border: none; background: transparent;';
  
  // Note: the iframe natively loads the NemoClaw UI. 
  // Instruct the user that NemoClaw must be configured to point to http://127.0.0.1:8080/v1
  // to natively hook into Yunisa's active 1-bit instance!
  
  container.appendChild(iframe);
  
  // Bind sidebar button
  const btn = document.getElementById('nemoclaw-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      showScreen('nemoclaw');
    });
  }
}
