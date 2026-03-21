// VLM Matrix Studio

export function initVlm() {
  const container = document.getElementById('vlm-screen');
  container.innerHTML = '';
  
  container.style.flexDirection = 'column';
  container.style.height = '100%';
  container.style.background = 'var(--bg-void, #06080c)';
  container.style.color = 'var(--text-primary, #c8d8f0)';
  container.style.fontFamily = 'monospace';

  // ── Header ───────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'vlm-header';
  
  const title = document.createElement('h3');
  title.innerHTML = '<span style="color:#ff9900; font-size: 1.3rem;">◈</span> VLM MATRIX STUDIO';
  header.appendChild(title);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '1rem';

  const trainBtn = document.createElement('button');
  trainBtn.textContent = 'Commence VLM Alignment';
  trainBtn.className = 'vlm-train-btn';
  
  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'HALT';
  stopBtn.className = 'vlm-halt-btn';
  
  controls.appendChild(stopBtn);
  controls.appendChild(trainBtn);
  header.appendChild(controls);
  container.appendChild(header);

  // ── Dashboard Body ───────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'vlm-body';
  
  // Stats Row
  const statsRow = document.createElement('div');
  statsRow.className = 'vlm-stats-row';
  
  const createCard = (label, color) => {
    const card = document.createElement('div');
    card.className = 'vlm-stat-card';
    card.style.borderTopColor = color;
    card.style.borderTopWidth = '3px';
    card.style.borderTopStyle = 'solid';
    const titleObj = document.createElement('div');
    titleObj.textContent = label;
    titleObj.className = 'vlm-stat-label';
    const valueObj = document.createElement('div');
    valueObj.textContent = '---';
    valueObj.className = 'vlm-stat-value';
    card.appendChild(titleObj);
    card.appendChild(valueObj);
    return { card, valueObj };
  };

  const epochStat = createCard('EPOCH', '#58a6ff');
  const lossStat = createCard('TRAINING LOSS', '#ff9900');
  const lrStat = createCard('LEARNING RATE', '#3fb950');

  statsRow.appendChild(epochStat.card);
  statsRow.appendChild(lossStat.card);
  statsRow.appendChild(lrStat.card);
  body.appendChild(statsRow);

  // Terminal Console
  const termHeader = document.createElement('div');
  termHeader.innerHTML = '<span style="color: #ff9900;">⚡</span> TENSOR OPERATIONS LOG';
  termHeader.className = 'vlm-term-label';
  body.appendChild(termHeader);

  const term = document.createElement('div');
  term.className = 'vlm-terminal';
  body.appendChild(term);
  container.appendChild(body);

  // ── Logic ────────────────────────────────────────────────────────
  let isTraining = false;

  const appendLine = (text, type = 'log') => {
    const el = document.createElement('div');
    el.textContent = text;
    if (type === 'error') el.style.color = '#ff7b72';
    if (type === 'system') el.style.color = '#3fb950';
    term.appendChild(el);
    term.scrollTop = term.scrollHeight;
  };

  trainBtn.onclick = async () => {
    if (isTraining) return;
    isTraining = true;
    trainBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    appendLine('[SYSTEM] Initiating Vision-Language Architecture Training Pipeline...', 'system');
    
    try {
      await window.yunisa.vlm.train();
    } catch (err) {
      appendLine('[ERROR] ' + err.message, 'error');
      stopBtn.onclick();
    }
  };

  stopBtn.onclick = async () => {
    if (!isTraining) return;
    appendLine('[SYSTEM] Aborting Tensor Allocation...', 'error');
    await window.yunisa.vlm.stop();
    isTraining = false;
    stopBtn.style.display = 'none';
    trainBtn.style.display = 'block';
  };

  window.yunisa.vlm.onLog((text) => {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        try {
            const lossMatch = line.match(/'loss':\s*([\d.]+)/);
            const lrMatch = line.match(/'learning_rate':\s*([\d.e-]+)/);
            const epochMatch = line.match(/'epoch':\s*([\d.]+)/);

            if (lossMatch) lossStat.valueObj.textContent = parseFloat(lossMatch[1]).toFixed(4);
            if (lrMatch) lrStat.valueObj.textContent = parseFloat(lrMatch[1]).toExponential(2);
            if (epochMatch) epochStat.valueObj.textContent = parseFloat(epochMatch[1]).toFixed(2);
        } catch (e) {}

        appendLine(line);
        
        if (line.includes('Training loop terminated')) {
            isTraining = false;
            stopBtn.style.display = 'none';
            trainBtn.style.display = 'block';
        }
    }
  });
}
