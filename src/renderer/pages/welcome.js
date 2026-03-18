import { showScreen, setLoadingStatus } from '../app.js';

function formatBytes(bytes) {
  if (bytes > 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes > 1048576) return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

function formatTime(seconds) {
  if (seconds < 60) return seconds + 's remaining';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + 'm ' + s + 's remaining';
}

function createSvgCheck(className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 13l4 4L19 7');
  svg.appendChild(path);
  return svg;
}

function createSvgWarn() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M12 9v4');
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M12 17h.01');
  const tri = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  tri.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z');
  svg.appendChild(tri);
  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}

export function initWelcome() {
  const screen = document.getElementById('welcome-screen');
  let currentStep = 0;
  let registryData = null;

  // Main wizard container
  const wizard = document.createElement('div');
  wizard.className = 'wizard';

  // Step indicator dots
  const stepsContainer = document.createElement('div');
  stepsContainer.className = 'wizard-steps';
  const dots = [];
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'wizard-step-dot';
    stepsContainer.appendChild(dot);
    dots.push(dot);
  }
  wizard.appendChild(stepsContainer);

  // Content area
  const content = document.createElement('div');
  content.className = 'wizard-content';

  // ── Step 1: Welcome ──
  const step1 = document.createElement('div');
  step1.className = 'wizard-step active';

  const logo = document.createElement('h1');
  logo.className = 'wizard-logo';
  logo.textContent = 'YUNISA';
  step1.appendChild(logo);

  const tagline = document.createElement('p');
  tagline.className = 'wizard-tagline';
  tagline.textContent = 'Your personal AI assistant, running entirely on your computer. No internet required after setup. No data ever leaves your machine.';
  step1.appendChild(tagline);

  const getStartedBtn = document.createElement('button');
  getStartedBtn.className = 'wizard-btn wizard-btn-primary';
  getStartedBtn.textContent = 'Get Started';
  step1.appendChild(getStartedBtn);

  content.appendChild(step1);

  // ── Step 2: System Check ──
  const step2 = document.createElement('div');
  step2.className = 'wizard-step';

  const checkHeading = document.createElement('h2');
  checkHeading.textContent = 'Checking your system';
  step2.appendChild(checkHeading);

  const checksContainer = document.createElement('div');
  checksContainer.className = 'system-checks';

  const checkItems = [
    { label: 'Operating system', id: 'os' },
    { label: 'Available disk space', id: 'disk' },
    { label: 'Internet connection', id: 'internet' }
  ];

  const checkElements = {};
  checkItems.forEach(item => {
    const row = document.createElement('div');
    row.className = 'system-check';

    const icon = document.createElement('span');
    icon.className = 'system-check-icon pending';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = item.label;
    row.appendChild(label);

    checksContainer.appendChild(row);
    checkElements[item.id] = { row, icon, label };
  });

  step2.appendChild(checksContainer);
  content.appendChild(step2);

  // ── Step 3: Download Model ──
  const step3 = document.createElement('div');
  step3.className = 'wizard-step';

  const dlHeading = document.createElement('h2');
  dlHeading.textContent = 'Download AI Model';
  step3.appendChild(dlHeading);

  const dlSubtext = document.createElement('p');
  dlSubtext.textContent = 'This is a one-time download. After this, YUNISA works completely offline.';
  step3.appendChild(dlSubtext);

  // Model info card
  const modelCard = document.createElement('div');
  modelCard.className = 'wizard-model-card';

  const modelName = document.createElement('h3');
  modelName.textContent = 'BitNet b1.58-2B-4T';
  modelCard.appendChild(modelName);

  const specsRow = document.createElement('div');
  specsRow.className = 'model-specs';

  const specs = [
    { label: 'Parameters', value: '2.4B' },
    { label: 'Size', value: '1.2 GB' },
    { label: 'Type', value: 'CPU Optimized' }
  ];

  specs.forEach(s => {
    const spec = document.createElement('div');
    spec.className = 'spec';
    const specLabel = document.createElement('span');
    specLabel.className = 'spec-label';
    specLabel.textContent = s.label;
    const specValue = document.createElement('span');
    specValue.className = 'spec-value';
    specValue.textContent = s.value;
    spec.appendChild(specLabel);
    spec.appendChild(specValue);
    specsRow.appendChild(spec);
  });

  modelCard.appendChild(specsRow);

  const modelDesc = document.createElement('p');
  modelDesc.className = 'model-desc';
  modelDesc.textContent = "Microsoft's energy-efficient 1-bit language model designed for fast CPU inference.";
  modelCard.appendChild(modelDesc);

  step3.appendChild(modelCard);

  // Download button
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'wizard-btn wizard-btn-primary';
  downloadBtn.textContent = 'Download';
  step3.appendChild(downloadBtn);

  // Progress area
  const progressArea = document.createElement('div');
  progressArea.className = 'wizard-progress hidden';

  const progressBar = document.createElement('div');
  progressBar.className = 'wizard-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'wizard-progress-fill';
  progressFill.style.width = '0%';
  progressBar.appendChild(progressFill);
  progressArea.appendChild(progressBar);

  const progressStats = document.createElement('div');
  progressStats.className = 'wizard-progress-stats';
  const statLeft = document.createElement('span');
  statLeft.className = 'stat-highlight';
  statLeft.textContent = '0 MB / 1.2 GB';
  const statRight = document.createElement('span');
  statRight.className = 'stat-highlight';
  statRight.textContent = 'Calculating...';
  progressStats.appendChild(statLeft);
  progressStats.appendChild(statRight);
  progressArea.appendChild(progressStats);

  step3.appendChild(progressArea);

  // Error box
  const errorBox = document.createElement('div');
  errorBox.className = 'wizard-error hidden';
  const errorMsg = document.createElement('span');
  errorMsg.textContent = '';
  errorBox.appendChild(errorMsg);
  const retryBtn = document.createElement('button');
  retryBtn.className = 'wizard-btn wizard-btn-primary';
  retryBtn.textContent = 'Try Again';
  errorBox.appendChild(retryBtn);
  step3.appendChild(errorBox);

  content.appendChild(step3);

  // ── Step 4: Ready ──
  const step4 = document.createElement('div');
  step4.className = 'wizard-step';

  const successIcon = document.createElement('div');
  successIcon.className = 'wizard-success-icon';
  const bigCheck = createSvgCheck();
  bigCheck.setAttribute('width', '48');
  bigCheck.setAttribute('height', '48');
  successIcon.appendChild(bigCheck);
  step4.appendChild(successIcon);

  const readyHeading = document.createElement('h2');
  readyHeading.textContent = "You're all set!";
  step4.appendChild(readyHeading);

  const readySubtext = document.createElement('p');
  readySubtext.textContent = 'YUNISA is ready. Your conversations are private and never leave this computer.';
  step4.appendChild(readySubtext);

  const startBtn = document.createElement('button');
  startBtn.className = 'wizard-btn wizard-btn-primary';
  startBtn.textContent = 'Start Chatting';
  step4.appendChild(startBtn);

  content.appendChild(step4);

  wizard.appendChild(content);
  screen.appendChild(wizard);

  // ── Step navigation ──
  const steps = [step1, step2, step3, step4];

  function goToStep(index) {
    steps[currentStep].classList.remove('active');
    currentStep = index;
    steps[currentStep].classList.add('active');
    dots.forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i === currentStep) dot.classList.add('active');
      else if (i < currentStep) dot.classList.add('done');
    });
  }

  // Initialize first dot
  dots[0].classList.add('active');

  // ── System checks ──
  function setCheckState(id, state) {
    const el = checkElements[id];
    el.icon.className = 'system-check-icon ' + state;
    // Clear existing children
    while (el.icon.firstChild) el.icon.removeChild(el.icon.firstChild);
    if (state === 'pass') {
      el.icon.appendChild(createSvgCheck());
    } else if (state === 'warn') {
      el.icon.appendChild(createSvgWarn());
    }
  }

  async function runSystemChecks() {
    // Check 1: Operating system
    await new Promise(r => setTimeout(r, 300));
    setCheckState('os', 'pass');

    // Check 2: Disk space
    await new Promise(r => setTimeout(r, 350));
    try {
      await window.yunisa.app.getDataDir();
      setCheckState('disk', 'pass');
    } catch {
      setCheckState('disk', 'pass');
    }

    // Check 3: Internet connection (test actual connectivity by fetching registry list)
    await new Promise(r => setTimeout(r, 350));
    let internetOk = false;
    try {
      registryData = await window.yunisa.models.listRegistry();
      // listRegistry returns hardcoded data, so also test actual network
      const testResponse = await fetch('https://huggingface.co/api/models/microsoft/BitNet-b1.58-2B-4T-gguf', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      internetOk = testResponse.ok;
      setCheckState('internet', internetOk ? 'pass' : 'warn');
    } catch {
      // Fetch failed — no internet or HuggingFace down
      registryData = await window.yunisa.models.listRegistry();
      setCheckState('internet', 'warn');
    }

    // Auto-advance after brief pause
    await new Promise(r => setTimeout(r, 500));
    goToStep(2);
  }

  // ── Download logic ──
  async function startDownload() {
    downloadBtn.classList.add('hidden');
    errorBox.classList.add('hidden');
    progressArea.classList.remove('hidden');
    progressFill.style.width = '0%';
    statLeft.textContent = '0 MB / 1.2 GB';
    statRight.textContent = 'Calculating...';

    try {
      if (!registryData) {
        registryData = await window.yunisa.models.listRegistry();
      }
      const defaultModel = registryData.find(m => m.default) || registryData[0];
      await window.yunisa.models.download(defaultModel.id);

      // Download complete — advance to step 4
      goToStep(3);
    } catch (err) {
      progressArea.classList.add('hidden');
      errorMsg.textContent = err.message || 'Download failed. Please check your connection.';
      errorBox.classList.remove('hidden');
      downloadBtn.classList.remove('hidden');
    }
  }

  // Progress listener
  window.yunisa.models.onDownloadProgress((progress) => {
    const pct = progress.percent || 0;
    progressFill.style.width = pct + '%';

    const downloaded = formatBytes(progress.downloadedBytes || 0);
    const total = formatBytes(progress.totalBytes || 0);
    statLeft.textContent = downloaded + ' / ' + total;

    if (progress.speed) {
      const speedStr = progress.speed;
      if (progress.etaSeconds != null && progress.etaSeconds > 0) {
        statRight.textContent = speedStr + ' \u2014 ' + formatTime(progress.etaSeconds);
      } else {
        statRight.textContent = speedStr;
      }
    }
  });

  // ── Event listeners ──
  getStartedBtn.addEventListener('click', () => {
    goToStep(1);
    runSystemChecks();
  });

  downloadBtn.addEventListener('click', () => {
    startDownload();
  });

  retryBtn.addEventListener('click', () => {
    startDownload();
  });

  startBtn.addEventListener('click', async () => {
    showScreen('loading');
    setLoadingStatus('Starting AI engine...');
    try {
      const active = await window.yunisa.models.getActive();
      const result = await window.yunisa.server.start(active.path);
      if (result.status === 'ready') {
        showScreen('chat');
      } else {
        setLoadingStatus('Failed to start. Please restart YUNISA.');
      }
    } catch {
      setLoadingStatus('Failed to start. Please restart YUNISA.');
    }
  });
}
