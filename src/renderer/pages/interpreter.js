import { showScreen } from '../app.js';

let sessionCounter = 0;
let currentSessionId = null;
let isRunning = false;
let started = false;

export function initInterpreter() {
  const screen = document.getElementById('interpreter-screen');

  // Build layout — same structure as chat but without sidebar
  const main = document.createElement('div');
  main.className = 'chat-main';
  main.style.width = '100%';

  // Header
  const header = document.createElement('div');
  header.className = 'chat-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn-ghost';
  backBtn.textContent = 'Back to Chat';
  backBtn.addEventListener('click', () => showScreen('chat'));
  header.appendChild(backBtn);

  const title = document.createElement('span');
  title.id = 'interp-title';
  title.style.fontWeight = '600';
  title.style.flex = '1';
  title.style.textAlign = 'center';
  title.textContent = 'Interpreter';
  header.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = 'auto-run';
  badge.style.background = 'var(--success)';
  badge.style.color = 'white';
  header.appendChild(badge);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-ghost';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', clearMessages);
  header.appendChild(clearBtn);

  main.appendChild(header);

  // Messages area
  const messages = document.createElement('div');
  messages.id = 'interp-messages';
  messages.className = 'messages';
  main.appendChild(messages);

  // Input area
  const inputArea = document.createElement('div');
  inputArea.className = 'input-area';

  const input = document.createElement('textarea');
  input.id = 'interp-input';
  input.placeholder = 'Tell me what to do...';
  input.rows = 1;
  inputArea.appendChild(input);

  const sendBtn = document.createElement('button');
  sendBtn.id = 'interp-send-btn';
  sendBtn.className = 'btn btn-primary';
  sendBtn.textContent = 'Run';
  sendBtn.disabled = true;
  inputArea.appendChild(sendBtn);

  const stopBtn = document.createElement('button');
  stopBtn.id = 'interp-stop-btn';
  stopBtn.className = 'btn btn-danger hidden';
  stopBtn.textContent = 'Stop';
  inputArea.appendChild(stopBtn);

  main.appendChild(inputArea);
  screen.appendChild(main);

  // Auto-resize input
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    sendBtn.disabled = !input.value.trim();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim() && !isRunning) sendMessage();
    }
  });

  sendBtn.addEventListener('click', () => {
    if (input.value.trim() && !isRunning) sendMessage();
  });

  stopBtn.addEventListener('click', () => {
    if (currentSessionId) {
      window.yunisa.interpreter.abort(currentSessionId);
      setRunning(false);
    }
  });

  // Chunk handler
  window.yunisa.interpreter.onChunk(handleChunk);
}

// Current assistant message elements for streaming
let currentTextEl = null;
let currentTextContent = '';

function handleChunk(chunk) {
  const messages = document.getElementById('interp-messages');

  switch (chunk.type) {
    case 'text_delta':
      if (!currentTextEl) {
        currentTextEl = appendMessage('assistant', '');
        currentTextContent = '';
      }
      currentTextContent += chunk.content;
      renderMarkdown(currentTextEl, currentTextContent);
      scrollToBottom();
      break;

    case 'code':
      // Render a code block
      const codeBlock = document.createElement('div');
      codeBlock.className = 'interp-code-block';

      const langBadge = document.createElement('span');
      langBadge.className = 'interp-lang-badge';
      langBadge.textContent = chunk.language;
      codeBlock.appendChild(langBadge);

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = chunk.content;
      pre.appendChild(code);
      codeBlock.appendChild(pre);

      messages.appendChild(codeBlock);
      scrollToBottom();
      // Reset text accumulator for post-code text
      currentTextEl = null;
      currentTextContent = '';
      break;

    case 'execution_start':
      const spinner = document.createElement('div');
      spinner.className = 'interp-executing';
      spinner.id = 'interp-exec-spinner';
      spinner.textContent = 'Running ' + chunk.language + '...';
      messages.appendChild(spinner);
      scrollToBottom();
      break;

    case 'execution_output': {
      // Remove spinner
      const sp = document.getElementById('interp-exec-spinner');
      if (sp) sp.remove();

      const outputBox = document.createElement('div');
      outputBox.className = 'interp-output ' + (chunk.exit_code === 0 ? 'success' : 'error');

      const outputPre = document.createElement('pre');
      outputPre.textContent = chunk.content;
      outputBox.appendChild(outputPre);

      if (chunk.exit_code !== 0) {
        const exitLabel = document.createElement('span');
        exitLabel.className = 'interp-exit-code';
        exitLabel.textContent = 'exit code ' + chunk.exit_code;
        outputBox.appendChild(exitLabel);
      }

      messages.appendChild(outputBox);
      scrollToBottom();
      break;
    }

    case 'search_start': {
      currentTextEl = null;
      currentTextContent = '';
      const searchSpinner = document.createElement('div');
      searchSpinner.className = 'interp-executing interp-search-indicator';
      searchSpinner.id = 'interp-search-spinner';
      searchSpinner.textContent = 'Searching: ' + chunk.query;
      messages.appendChild(searchSpinner);
      scrollToBottom();
      break;
    }

    case 'search_results': {
      const ss = document.getElementById('interp-search-spinner');
      if (ss) ss.remove();

      const searchBox = document.createElement('div');
      searchBox.className = 'interp-search-results';

      const searchHeader = document.createElement('span');
      searchHeader.className = 'interp-lang-badge';
      searchHeader.textContent = chunk.count + ' result' + (chunk.count !== 1 ? 's' : '');
      searchBox.appendChild(searchHeader);

      const searchContent = document.createElement('div');
      searchContent.className = 'interp-search-content';
      renderMarkdown(searchContent, chunk.content);
      searchBox.appendChild(searchContent);

      messages.appendChild(searchBox);
      scrollToBottom();
      break;
    }

    case 'fetch_start': {
      currentTextEl = null;
      currentTextContent = '';
      const fetchSpinner = document.createElement('div');
      fetchSpinner.className = 'interp-executing';
      fetchSpinner.id = 'interp-fetch-spinner';
      fetchSpinner.textContent = 'Reading page...';
      messages.appendChild(fetchSpinner);
      scrollToBottom();
      break;
    }

    case 'fetch_result': {
      const fs = document.getElementById('interp-fetch-spinner');
      if (fs) fs.remove();

      const fetchBox = document.createElement('div');
      fetchBox.className = 'interp-output success';
      const fetchPre = document.createElement('pre');
      fetchPre.textContent = chunk.content;
      fetchBox.appendChild(fetchPre);
      messages.appendChild(fetchBox);
      scrollToBottom();
      break;
    }

    case 'tool_result': {
      currentTextEl = null;
      currentTextContent = '';
      // Remove any active spinner
      const ts = document.getElementById('interp-exec-spinner') ||
                 document.getElementById('interp-search-spinner') ||
                 document.getElementById('interp-fetch-spinner');
      if (ts) ts.remove();

      const toolBox = document.createElement('div');
      toolBox.className = 'interp-output success';

      const toolLabel = document.createElement('div');
      toolLabel.style.cssText = 'font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-tertiary);margin-bottom:0.3rem;';
      toolLabel.textContent = chunk.name;
      toolBox.appendChild(toolLabel);

      const toolPre = document.createElement('pre');
      try {
        const parsed = JSON.parse(chunk.content);
        if (parsed.text) {
          // OCR result — show text content
          toolPre.textContent = parsed.text.substring(0, 1000) + (parsed.text.length > 1000 ? '...' : '');
        } else if (parsed.error) {
          toolBox.className = 'interp-output error';
          toolPre.textContent = parsed.error;
        } else {
          toolPre.textContent = chunk.content;
        }
      } catch {
        toolPre.textContent = chunk.content;
      }
      toolBox.appendChild(toolPre);
      messages.appendChild(toolBox);
      scrollToBottom();
      break;
    }

    case 'done':
      setRunning(false);
      currentTextEl = null;
      currentTextContent = '';
      break;

    case 'error':
      setRunning(false);
      appendMessage('error', chunk.content);
      currentTextEl = null;
      currentTextContent = '';
      break;
  }
}

async function sendMessage() {
  const input = document.getElementById('interp-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  // Ensure interpreter bridge is started
  if (!started) {
    try {
      await window.yunisa.interpreter.start();
      started = true;
    } catch (err) {
      appendMessage('error', 'Failed to start interpreter: ' + (err.message || err));
      return;
    }
  }

  appendMessage('user', text);
  setRunning(true);
  currentTextEl = null;
  currentTextContent = '';

  sessionCounter++;
  currentSessionId = 'session-' + sessionCounter;
  window.yunisa.interpreter.send(text, currentSessionId);
}

function setRunning(running) {
  isRunning = running;
  const sendBtn = document.getElementById('interp-send-btn');
  const stopBtn = document.getElementById('interp-stop-btn');
  if (running) {
    sendBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
  } else {
    sendBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
  }
}

function clearMessages() {
  const messages = document.getElementById('interp-messages');
  messages.innerHTML = '';
  currentTextEl = null;
  currentTextContent = '';
}

function appendMessage(role, content) {
  const container = document.getElementById('interp-messages');
  const div = document.createElement('div');
  div.className = 'message message-' + role;

  const label = document.createElement('span');
  label.className = 'message-role';
  if (role === 'user') label.textContent = 'You';
  else if (role === 'error') label.textContent = 'Error';
  else label.textContent = 'YUNISA';
  div.appendChild(label);

  const body = document.createElement('div');
  body.className = 'message-body';
  div.appendChild(body);

  if (content) renderMarkdown(body, content);

  container.appendChild(div);
  scrollToBottom();
  return body;
}

function renderMarkdown(el, text) {
  if (window.marked) {
    el.innerHTML = window.marked.parse(text);
  } else {
    let safe = escapeHtml(text);
    safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
    safe = safe.replace(/\n/g, '<br>');
    el.innerHTML = safe;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  const container = document.getElementById('interp-messages');
  if (container) container.scrollTop = container.scrollHeight;
}
