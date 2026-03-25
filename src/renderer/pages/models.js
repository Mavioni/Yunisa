import { showScreen, setLoadingStatus } from '../app.js';

export function initModels() {
  const screen = document.getElementById('models-screen');
  screen.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'models-container';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'models-header';
  const title = document.createElement('h2');
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
  filterInput.className = 'models-filter';
  container.appendChild(filterInput);

  // ── Model list ──
  const listDiv = document.createElement('div');
  listDiv.className = 'models-list';
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
      card.className = `model-card${isActive ? ' model-card-active' : ''}`;

      // Name row
      const nameRow = document.createElement('div');
      nameRow.className = 'model-name-row';
      const h3 = document.createElement('h3');
      h3.textContent = model.name;
      nameRow.appendChild(h3);

      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'model-active-badge';
        badge.textContent = 'Active';
        nameRow.appendChild(badge);
      }

      // Capability tags
      tags.forEach(tag => {
        const t = TAG_MAP[tag];
        if (!t) return;
        const span = document.createElement('span');
        span.className = 'model-tag';
        span.style.borderColor = t.color + '33';
        span.style.color = t.color;
        span.textContent = t.label;
        nameRow.appendChild(span);
      });

      card.appendChild(nameRow);

      // Meta
      const meta = document.createElement('p');
      meta.className = 'model-meta';
      meta.textContent = `${model.size || ''} — ${model.description || ''}`;
      card.appendChild(meta);

      // Progress bar (hidden)
      const progressWrap = document.createElement('div');
      progressWrap.id = `prog-${model.id}`;
      progressWrap.className = 'model-progress hidden';
      const pBar = document.createElement('div');
      pBar.className = 'progress-bar';
      const fill = document.createElement('div');
      fill.id = `fill-${model.id}`;
      fill.className = 'progress-fill';
      pBar.appendChild(fill);
      progressWrap.appendChild(pBar);
      const pText = document.createElement('p');
      pText.id = `text-${model.id}`;
      pText.className = 'model-progress-text';
      pText.textContent = 'Downloading...';
      progressWrap.appendChild(pText);
      card.appendChild(progressWrap);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'model-actions';

      if (inst) {
        if (!isActive) {
          const switchBtn = document.createElement('button');
          switchBtn.className = 'btn btn-primary';
          switchBtn.textContent = 'Set Active';
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
        dlBtn.addEventListener('click', async () => {
          dlBtn.style.display = 'none';
          progressWrap.classList.remove('hidden');
          try {
            await window.yunisa.models.download(model.id);
            renderModels(filter);
          } catch {
            progressWrap.classList.add('hidden');
            dlBtn.textContent = 'Retry';
            dlBtn.style.display = 'inline-flex';
          }
        });
        actions.appendChild(dlBtn);
      }

      card.appendChild(actions);
      listDiv.appendChild(card);
    }

    // ── Cloud Models (NVIDIA NIM) ────────────────────────────────────
    const cfg = await window.yunisa.config.get();
    const cloudSection = document.createElement('div');
    cloudSection.style.cssText = 'margin-top:2rem;';
    const cloudTitle = document.createElement('h3');
    cloudTitle.style.cssText = 'color:var(--text-secondary);font-size:0.9rem;letter-spacing:1px;text-transform:uppercase;margin-bottom:1rem;';
    cloudTitle.textContent = '☁ Cloud Models — NVIDIA NIM';
    cloudSection.appendChild(cloudTitle);

    const NIM_MODELS = [
      { id: 'nim-llama-70b', name: 'Llama 3.1 70B Instruct', desc: 'Meta / NVIDIA NIM — Cloud inference via NIM API', tag: 'NIM Cloud' },
      { id: 'nim-nemotron-mini', name: 'Nemotron Mini 4B Instruct', desc: 'NVIDIA Nemotron — Lightweight cloud agent model', tag: 'NIM Cloud' },
    ];

    const hasKey = cfg.nvidiaApiKey && cfg.nvidiaApiKey.length > 5;

    for (const nm of NIM_MODELS) {
      const card = document.createElement('div');
      card.className = 'model-card';
      card.style.cssText = 'opacity:' + (hasKey ? '1' : '0.55') + ';';
      const nameRow = document.createElement('div');
      nameRow.className = 'model-name-row';
      const h3 = document.createElement('h3');
      h3.textContent = nm.name;
      const tag = document.createElement('span');
      tag.className = 'model-tag';
      tag.style.cssText = 'color:#76b900;border-color:#76b90033;';
      tag.textContent = nm.tag;
      nameRow.appendChild(h3);
      nameRow.appendChild(tag);
      card.appendChild(nameRow);
      const meta = document.createElement('p');
      meta.className = 'model-meta';
      meta.textContent = nm.desc;
      card.appendChild(meta);
      if (!hasKey) {
        const hint = document.createElement('p');
        hint.className = 'model-meta';
        hint.style.color = 'var(--accent)';
        hint.textContent = '⚡ Add your NVIDIA API key in Settings to enable cloud inference.';
        card.appendChild(hint);
      }
      cloudSection.appendChild(card);
    }

    // NIM connection test button
    const testBtn = document.createElement('button');
    testBtn.className = 'btn btn-ghost';
    testBtn.id = 'nim-test-btn';
    testBtn.style.cssText = 'margin-top:0.5rem;';
    testBtn.textContent = hasKey ? '🔌 Test NIM Connection' : '🔑 Configure API Key in Settings';
    testBtn.addEventListener('click', async () => {
      if (!hasKey) { showScreen('settings'); return; }
      testBtn.textContent = 'Testing...';
      testBtn.disabled = true;
      try {
        const result = await window.yunisa.nim.testConnection();
        testBtn.textContent = result.ok ? '✅ NIM Connected' : '❌ Connection Failed';
      } catch {
        testBtn.textContent = '❌ Error';
      }
      setTimeout(() => { testBtn.textContent = '🔌 Test NIM Connection'; testBtn.disabled = false; }, 3000);
    });
    cloudSection.appendChild(testBtn);
    listDiv.appendChild(cloudSection);
  }
}
