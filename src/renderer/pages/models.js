import { showScreen, setLoadingStatus } from '../app.js';

export function initModels() {
  const screen = document.getElementById('models-screen');
  const container = document.createElement('div');
  container.className = 'models-container';
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;';
  const title = document.createElement('h2');
  title.textContent = 'Models';
  header.appendChild(title);
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = 'Back to Chat';
  header.appendChild(backBtn);
  container.appendChild(header);
  const listDiv = document.createElement('div');
  listDiv.id = 'models-list';
  container.appendChild(listDiv);
  screen.appendChild(container);
  backBtn.addEventListener('click', () => showScreen('chat'));
  const observer = new MutationObserver(() => { if (screen.classList.contains('active')) refreshModels(); });
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
}

async function refreshModels() {
  const registry = await window.yunisa.models.listRegistry();
  const installed = await window.yunisa.models.listInstalled();
  const active = await window.yunisa.models.getActive();
  const list = document.getElementById('models-list');
  list.textContent = '';
  for (const model of registry) {
    const inst = installed.find(i => i.id === model.id);
    const isActive = active?.id === model.id;
    const card = document.createElement('div');
    card.className = 'model-card';
    const h3 = document.createElement('h3');
    h3.textContent = model.name + ' ';
    if (isActive) { const badge = document.createElement('span'); badge.className = 'badge'; badge.style.background = 'var(--success)'; badge.style.color = '#ffffff'; badge.textContent = 'Active'; h3.appendChild(badge); }
    card.appendChild(h3);
    const meta = document.createElement('p');
    meta.className = 'model-meta';
    meta.textContent = model.size + ' - ' + model.description;
    card.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'model-actions';
    const progressDiv = document.createElement('div');
    progressDiv.className = 'model-progress hidden';
    const pBar = document.createElement('div');
    pBar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = '0%';
    pBar.appendChild(fill);
    progressDiv.appendChild(pBar);
    const pText = document.createElement('p');
    pText.className = 'progress-text';
    pText.textContent = 'Downloading...';
    progressDiv.appendChild(pText);
    if (inst) {
      if (!isActive) {
        const switchBtn = document.createElement('button');
        switchBtn.className = 'btn btn-primary';
        switchBtn.textContent = 'Switch To';
        switchBtn.addEventListener('click', async () => {
          showScreen('loading'); setLoadingStatus('Switching model...');
          await window.yunisa.server.stop(); await window.yunisa.models.setActive(model.id);
          const result = await window.yunisa.server.start(inst.path);
          showScreen(result.status === 'ready' ? 'chat' : 'models');
        });
        actions.appendChild(switchBtn);
      }
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Delete this model? You will need to re-download it.')) { await window.yunisa.models.delete(model.id); refreshModels(); }
      });
      actions.appendChild(deleteBtn);
    } else {
      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn btn-primary';
      dlBtn.textContent = 'Download';
      dlBtn.addEventListener('click', async () => {
        dlBtn.classList.add('hidden');
        progressDiv.classList.remove('hidden');
        pText.textContent = 'Downloading...';
        fill.style.width = '0%';
        window.yunisa.models.onDownloadProgress((progress) => {
          if (progress.modelId === model.id) { fill.style.width = progress.percent + '%'; pText.textContent = progress.percent + '% - ' + progress.speed; }
        });
        try { await window.yunisa.models.download(model.id); refreshModels(); }
        catch (err) {
          progressDiv.classList.add('hidden');
          pText.textContent = 'Download failed.';
          dlBtn.textContent = 'Retry Download';
          dlBtn.classList.remove('hidden');
        }
      });
      actions.appendChild(dlBtn);
    }
    card.appendChild(actions);
    card.appendChild(progressDiv);
    list.appendChild(card);
  }
}
