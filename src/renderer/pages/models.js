import { showScreen, setLoadingStatus } from '../app.js';

export function initModels() {
  const screen = document.getElementById('models-screen');
  screen.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'models-container';
  container.style.cssText = 'width:100%; max-width:860px; margin:0 auto; padding:1.5rem; display:flex; flex-direction:column; gap:1rem; overflow-y:auto; height:100%;';

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:0.75rem;';
  const title = document.createElement('h2');
  title.style.cssText = 'color:var(--text-primary); font-weight:300; letter-spacing:2px; text-transform:uppercase; font-size:1.1rem; margin:0;';
  title.textContent = 'Model Library';
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = '⟨ Back to Chat';
  backBtn.addEventListener('click', () => showScreen('chat'));
  header.appendChild(title);
  header.appendChild(backBtn);
  container.appendChild(header);

  // ── Filter bar ──
  const filterInput = document.createElement('input');
  filterInput.type = 'text';
  filterInput.placeholder = 'Filter models...';
  filterInput.style.cssText = 'width:100%; padding:0.65rem 1rem; background:var(--bg-card); color:var(--text-primary); border:var(--border); border-radius:var(--radius-sm); outline:none; font-size:0.85rem; box-sizing:border-box;';
  filterInput.addEventListener('focus', () => filterInput.style.borderColor = 'var(--blue)');
  filterInput.addEventListener('blur', () => filterInput.style.borderColor = '');
  container.appendChild(filterInput);

  // ── Model list ──
  const listDiv = document.createElement('div');
  listDiv.style.cssText = 'display:flex; flex-direction:column; gap:0.75rem;';
  container.appendChild(listDiv);
  screen.appendChild(container);

  filterInput.addEventListener('input', () => renderModels(filterInput.value.toLowerCase()));

  const observer = new MutationObserver(() => {
    if (screen.classList.contains('active')) renderModels('');
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
  
  // Progress listener
  window.yunisa.models.onDownloadProgress((progress) => {
    const fill = document.getElementById(`fill-${progress.modelId}`);
    const text = document.getElementById(`text-${progress.modelId}`);
    if (fill) fill.style.width = progress.percent + '%';
    if (text) text.textContent = `${progress.percent}% — ${progress.speed || ''}`;
  });

  async function renderModels(filter) {
    const registry = await window.yunisa.models.listRegistry();
    const installed = await window.yunisa.models.listInstalled();
    const active = await window.yunisa.models.getActive();
    listDiv.innerHTML = '';

    const TAG_MAP = {
      'cpu': { label: 'CPU Optimized', color: '#4caf50' },
      'gpu': { label: 'RTX Required', color: '#ffc107' },
      'vision': { label: 'Vision', color: '#2196f3' },
      'airllm': { label: 'AirLLM', color: '#f44336' },
      'code': { label: 'Code', color: '#2196f3' },
    };

    const getTags = (model) => {
      const tags = [];
      if (model.id.includes('airllm')) tags.push('airllm', 'gpu');
      else tags.push('cpu');
      if (model.id.includes('vision') || model.id.includes('vlm')) tags.push('vision');
      if (model.id.includes('code')) tags.push('code');
      return [...new Set(tags)];
    };

    const filtered = registry.filter(m =>
      !filter || m.name.toLowerCase().includes(filter) || m.description?.toLowerCase().includes(filter)
    );

    // Active model pinned at top
    const activeModel = filtered.find(m => m.id === active?.id);
    const others = filtered.filter(m => m.id !== active?.id);
    const ordered = activeModel ? [activeModel, ...others] : others;

    for (const model of ordered) {
      const inst = installed.find(i => i.id === model.id);
      const isActive = active?.id === model.id;
      const tags = getTags(model);

      const card = document.createElement('div');
      card.className = 'model-card';
      card.style.cssText = `padding:1.25rem; border-radius:var(--radius-sm); background:var(--bg-card); border:1px solid ${isActive ? 'var(--blue)' : 'var(--border)'}; ${isActive ? 'box-shadow:0 0 16px var(--blue-glow);' : ''}`;

      // Name row
      const nameRow = document.createElement('div');
      nameRow.style.cssText = 'display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap; margin-bottom:0.4rem;';
      const h3 = document.createElement('h3');
      h3.style.cssText = 'margin:0; font-size:1rem; color:var(--text-primary);';
      h3.textContent = model.name;
      nameRow.appendChild(h3);

      if (isActive) {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:0.65rem; padding:0.2rem 0.5rem; background:var(--green); color:#fff; border-radius:999px; font-weight:600; letter-spacing:0.5px;';
        badge.textContent = 'Active';
        nameRow.appendChild(badge);
      }

      // Capability tags
      tags.forEach(tag => {
        const t = TAG_MAP[tag];
        if (!t) return;
        const span = document.createElement('span');
        span.style.cssText = `font-size:0.6rem; padding:0.15rem 0.45rem; border-radius:999px; border:1px solid ${t.color}33; color:${t.color}; letter-spacing:0.5px;`;
        span.textContent = t.label;
        nameRow.appendChild(span);
      });

      card.appendChild(nameRow);

      // Meta
      const meta = document.createElement('p');
      meta.style.cssText = 'margin:0 0 0.85rem; color:var(--text-secondary); font-size:0.82rem;';
      meta.textContent = `${model.size || ''} — ${model.description || ''}`;
      card.appendChild(meta);

      // Progress bar (hidden)
      const progressWrap = document.createElement('div');
      progressWrap.id = `prog-${model.id}`;
      progressWrap.style.cssText = 'display:none; margin-bottom:0.75rem;';
      const pBar = document.createElement('div');
      pBar.style.cssText = 'height:4px; background:var(--border); border-radius:2px; overflow:hidden; margin-bottom:0.3rem;';
      const fill = document.createElement('div');
      fill.id = `fill-${model.id}`;
      fill.style.cssText = 'height:100%; width:0%; background:var(--blue); transition:width 0.3s;';
      pBar.appendChild(fill);
      progressWrap.appendChild(pBar);
      const pText = document.createElement('p');
      pText.id = `text-${model.id}`;
      pText.style.cssText = 'font-size:0.75rem; color:var(--text-secondary); margin:0;';
      pText.textContent = 'Downloading...';
      progressWrap.appendChild(pText);
      card.appendChild(progressWrap);

      // Actions
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:0.5rem; flex-wrap:wrap;';

      if (inst) {
        if (!isActive) {
          const switchBtn = document.createElement('button');
          switchBtn.className = 'btn btn-primary';
          switchBtn.textContent = 'Set Active';
          switchBtn.style.fontSize = '0.8rem';
          switchBtn.addEventListener('click', async () => {
            showScreen('loading'); setLoadingStatus('Switching model...');
            await window.yunisa.server.stop();
            await window.yunisa.models.setActive(model.id);
            const result = await window.yunisa.server.start(inst.path);
            showScreen(result.status === 'ready' ? 'chat' : 'models');
          });
          actions.appendChild(switchBtn);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.fontSize = '0.8rem';
        deleteBtn.addEventListener('click', async () => {
          if (confirm('Delete this model? You will need to re-download it.')) {
            await window.yunisa.models.delete(model.id);
            renderModels(filter);
          }
        });
        actions.appendChild(deleteBtn);
      } else {
        const dlBtn = document.createElement('button');
        dlBtn.id = `dl-${model.id}`;
        dlBtn.className = 'btn btn-primary';
        dlBtn.textContent = 'Download';
        dlBtn.style.fontSize = '0.8rem';
        dlBtn.addEventListener('click', async () => {
          dlBtn.style.display = 'none';
          progressWrap.style.display = 'block';
          try {
            await window.yunisa.models.download(model.id);
            renderModels(filter);
          } catch {
            progressWrap.style.display = 'none';
            dlBtn.textContent = 'Retry';
            dlBtn.style.display = 'inline-flex';
          }
        });
        actions.appendChild(dlBtn);
      }

      card.appendChild(actions);
      listDiv.appendChild(card);
    }
  }
}
