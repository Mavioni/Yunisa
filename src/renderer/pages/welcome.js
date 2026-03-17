import { showScreen, setLoadingStatus } from '../app.js';

export function initWelcome() {
  const screen = document.getElementById('welcome-screen');
  const container = document.createElement('div');
  container.className = 'welcome-container';
  const h1 = document.createElement('h1');
  h1.textContent = 'YUNISA';
  container.appendChild(h1);
  const desc = document.createElement('p');
  desc.id = 'welcome-text';
  desc.textContent = 'Your personal AI assistant, running entirely on your computer. No internet required. No data leaves your machine.';
  container.appendChild(desc);

  const step1 = document.createElement('div');
  step1.id = 'welcome-step-1';
  const getStartedBtn = document.createElement('button');
  getStartedBtn.className = 'btn btn-primary';
  getStartedBtn.style.cssText = 'font-size: 1.1rem; padding: 0.75rem 2rem;';
  getStartedBtn.textContent = 'Get Started';
  step1.appendChild(getStartedBtn);
  container.appendChild(step1);

  const step2 = document.createElement('div');
  step2.id = 'welcome-step-2';
  step2.className = 'hidden';
  const modelCard = document.createElement('div');
  modelCard.className = 'model-card';
  modelCard.style.cssText = 'text-align: left; margin-bottom: 1.5rem;';
  const mt = document.createElement('h3');
  mt.textContent = 'BitNet b1.58-2B-4T';
  modelCard.appendChild(mt);
  const mm = document.createElement('p');
  mm.className = 'model-meta';
  mm.textContent = '2.4B parameters \u00B7 1.2 GB download \u00B7 CPU optimized';
  modelCard.appendChild(mm);
  const md = document.createElement('p');
  md.style.cssText = 'font-size: 0.85rem; color: var(--text-secondary);';
  md.textContent = 'A fast, energy-efficient language model from Microsoft that runs on any modern CPU.';
  modelCard.appendChild(md);
  step2.appendChild(modelCard);
  const downloadBtn = document.createElement('button');
  downloadBtn.id = 'download-btn';
  downloadBtn.className = 'btn btn-primary';
  downloadBtn.style.cssText = 'font-size: 1.1rem; padding: 0.75rem 2rem;';
  downloadBtn.textContent = 'Download Model';
  step2.appendChild(downloadBtn);
  const progressDiv = document.createElement('div');
  progressDiv.id = 'download-progress';
  progressDiv.className = 'hidden';
  const pBar = document.createElement('div');
  pBar.className = 'progress-bar';
  const pFill = document.createElement('div');
  pFill.id = 'progress-fill';
  pFill.className = 'progress-fill';
  pFill.style.width = '0%';
  pBar.appendChild(pFill);
  progressDiv.appendChild(pBar);
  const pText = document.createElement('p');
  pText.id = 'progress-text';
  pText.className = 'progress-text';
  pText.textContent = 'Downloading...';
  progressDiv.appendChild(pText);
  step2.appendChild(progressDiv);
  container.appendChild(step2);

  const step3 = document.createElement('div');
  step3.id = 'welcome-step-3';
  step3.className = 'hidden';
  const readyText = document.createElement('p');
  readyText.style.cssText = 'font-size: 1.2rem; margin-bottom: 1.5rem;';
  readyText.textContent = 'You are all set!';
  step3.appendChild(readyText);
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-primary';
  startBtn.style.cssText = 'font-size: 1.1rem; padding: 0.75rem 2rem;';
  startBtn.textContent = 'Start Chatting';
  step3.appendChild(startBtn);
  container.appendChild(step3);
  screen.appendChild(container);

  getStartedBtn.addEventListener('click', () => {
    step1.classList.add('hidden');
    step2.classList.remove('hidden');
    desc.textContent = 'First, let us download the AI model.';
  });
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.classList.add('hidden');
    progressDiv.classList.remove('hidden');
    try {
      const registry = await window.yunisa.models.listRegistry();
      const defaultModel = registry.find(m => m.default);
      await window.yunisa.models.download(defaultModel.id);
      step2.classList.add('hidden');
      step3.classList.remove('hidden');
      desc.textContent = 'Model downloaded successfully!';
    } catch (err) {
      pText.textContent = 'Download failed. Please try again.';
      downloadBtn.classList.remove('hidden');
    }
  });
  startBtn.addEventListener('click', async () => {
    showScreen('loading');
    setLoadingStatus('Starting AI engine...');
    const active = await window.yunisa.models.getActive();
    const result = await window.yunisa.server.start(active.path);
    if (result.status === 'ready') { showScreen('chat'); }
    else { setLoadingStatus('Failed to start. Please restart YUNISA.'); }
  });
  window.yunisa.models.onDownloadProgress((progress) => {
    pFill.style.width = progress.percent + '%';
    pText.textContent = progress.percent + '% - ' + progress.speed + ' - ' + formatBytes(progress.downloadedBytes) + ' / ' + formatBytes(progress.totalBytes);
  });
}

function formatBytes(bytes) {
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes > 1048576) return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}
