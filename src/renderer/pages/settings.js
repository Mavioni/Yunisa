import { showScreen } from '../app.js';

export function initSettings() {
  const screen = document.getElementById('settings-screen');
  const container = document.createElement('div');
  container.className = 'models-container';
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;';
  const title = document.createElement('h2');
  title.textContent = 'Settings';
  header.appendChild(title);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = 'Back to Chat';
  header.appendChild(backBtn);
  container.appendChild(header);
  const aboutCard = document.createElement('div');
  aboutCard.className = 'model-card';
  const aboutTitle = document.createElement('h3');
  aboutTitle.textContent = 'About YUNISA';
  aboutCard.appendChild(aboutTitle);
  const aboutMeta = document.createElement('p');
  aboutMeta.className = 'model-meta';
  aboutMeta.style.marginTop = '0.5rem';
  aboutMeta.textContent = 'Version 1.0.0 | Local AI powered by BitNet.cpp | Your conversations never leave your computer.';
  aboutCard.appendChild(aboutMeta);
  container.appendChild(aboutCard);
  const serverCard = document.createElement('div');
  serverCard.className = 'model-card';
  const serverTitle = document.createElement('h3');
  serverTitle.textContent = 'Server Status';
  serverCard.appendChild(serverTitle);
  const serverStatus = document.createElement('p');
  serverStatus.className = 'model-meta';
  serverStatus.style.marginTop = '0.5rem';
  serverStatus.textContent = 'Checking...';
  serverCard.appendChild(serverStatus);
  container.appendChild(serverCard);
  const dataCard = document.createElement('div');
  dataCard.className = 'model-card';
  const dataTitle = document.createElement('h3');
  dataTitle.textContent = 'Data Location';
  dataCard.appendChild(dataTitle);
  const dataDir = document.createElement('p');
  dataDir.className = 'model-meta';
  dataDir.style.marginTop = '0.5rem';
  dataDir.textContent = 'Loading...';
  dataCard.appendChild(dataDir);
  container.appendChild(dataCard);
  screen.appendChild(container);
  backBtn.addEventListener('click', () => showScreen('chat'));
  const observer = new MutationObserver(async () => {
    if (screen.classList.contains('active')) {
      const status = await window.yunisa.server.status();
      const port = await window.yunisa.server.port();
      serverStatus.textContent = 'Status: ' + status + ' | Port: ' + port;
      const dir = await window.yunisa.app.getDataDir();
      dataDir.textContent = dir;
    }
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
}
