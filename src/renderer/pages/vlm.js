// VLM Matrix Studio

export function initVlm() {
  const container = document.getElementById('vlm-screen');
  container.innerHTML = '';
  
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.height = '100%';
  container.style.background = 'var(--bg-void, #06080c)';
  container.style.color = 'var(--text-primary, #c8d8f0)';
  container.style.fontFamily = 'monospace';

  // ── Header ───────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = 'height: 60px; background: linear-gradient(90deg, #1f1105 0%, #0d1117 100%); display: flex; align-items: center; padding: 0 1.5rem; justify-content: space-between; border-bottom: 2px solid #ff9900; box-shadow: 0 4px 15px rgba(255, 153, 0, 0.1);';
  
  const title = document.createElement('h3');
  title.style.cssText = 'color: #fff; margin: 0; font-size: 1.1rem; letter-spacing: 1px;';
  title.innerHTML = '<span style="color:#ff9900; font-size: 1.3rem;">◈</span> VLM MATRIX STUDIO';
  header.appendChild(title);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '1rem';

  const trainBtn = document.createElement('button');
  trainBtn.textContent = 'Commence VLM Alignment';
  trainBtn.style.cssText = 'background: #ff9900; color: #000; border: none; border-radius: 4px; padding: 0.5rem 1.5rem; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: inherit; text-transform: uppercase;';
  
  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'HALT';
  stopBtn.style.cssText = 'background: transparent; color: #f44336; border: 1px solid #f44336; border-radius: 4px; padding: 0.5rem 1rem; font-weight: bold; cursor: pointer; transition: 0.2s; font-family: inherit; display: none;';
  
  controls.appendChild(stopBtn);
  controls.appendChild(trainBtn);
  header.appendChild(controls);
  container.appendChild(header);

  // ── Dashboard Body ───────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'flex: 1; display: flex; flex-direction: column; padding: 1.5rem; gap: 1.5rem; overflow: hidden; max-width: 1200px; margin: 0 auto; width: 100%;';
  
  // Stats Row
  const statsRow = document.createElement('div');
  statsRow.style.cssText = 'display: flex; gap: 1rem; height: 100px;';
  
  const createCard = (label, color) => {
    const card = document.createElement('div');
    card.style.cssText = `flex: 1; background: #161b22; border: 1px solid #30363d; border-radius: 8px; border-top: 3px solid ${color}; padding: 1rem; display: flex; flex-direction: column; justify-content: center;`;
    const titleObj = document.createElement('div');
    titleObj.textContent = label;
    titleObj.style.cssText = 'font-size: 0.8rem; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem;';
    const valueObj = document.createElement('div');
    valueObj.textContent = '---';
    valueObj.style.cssText = 'font-size: 1.8rem; font-weight: bold; color: #fff;';
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
  termHeader.style.cssText = 'font-size: 0.85rem; color: #8b949e; letter-spacing: 1px; margin-bottom: -1rem;';
  body.appendChild(termHeader);

  const term = document.createElement('div');
  term.style.cssText = 'flex: 1; background: #000; border: 1px solid #30363d; border-radius: 8px; padding: 1rem; overflow-y: auto; font-family: "Courier New", Courier, monospace; font-size: 0.85rem; line-height: 1.5; color: #a5d6ff;';
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

  // Listen to IPC stream and parse dict metrics dynamically
  window.yunisa.vlm.onLog((text) => {
    text.split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      
      // Parse HuggingFace dictionary logs
      // Example: {'loss': 2.345, 'learning_rate': 0.0001, 'epoch': 0.5}
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
   });
  });
}
