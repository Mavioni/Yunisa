import { showScreen } from "../app.js";

let currentConversationId = null;
let abortController = null;
let serverPort = 8080;
let activePersona = 'default';
let configuredContextSize = 2048;
let unlimitedContext = true;
let nimApiKey = '';
let nimModel = 'meta/llama-3.1-70b-instruct';

const messagesEl = () => document.getElementById("messages");
const inputEl = () => document.getElementById("user-input");
const sendBtn = () => document.getElementById("send-btn");
const stopBtn = () => document.getElementById("stop-btn");
const chatTitle = () => document.getElementById("chat-title");
const modelBadge = () => document.getElementById("model-badge");
const contextWarning = () => document.getElementById("context-warning");
const convList = () => document.getElementById("conversation-list");

export function initChat() {
  const input = inputEl();
  const send = sendBtn();
  const stop = stopBtn();

  send.addEventListener("click", sendMessage);
  stop.addEventListener("click", stopGeneration);

  // Auto-resize textarea as user types
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
    send.disabled = !input.value.trim();
    scrollToBottom();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim()) sendMessage();
    }
  });

  const newChatBtn = document.getElementById("new-chat-btn");
  if (newChatBtn) newChatBtn.addEventListener("click", startNewChat);

  // Fetch the server port once
  window.yunisa.server.port().then((port) => {
    if (port) serverPort = port;
  });

  // Load active model badge
  window.yunisa.models.getActive().then((model) => {
    if (model && modelBadge()) {
      modelBadge().textContent = model.name || model.id || "Local Model";
    }
  });

  window.yunisa.config.get().then(cfg => {
    if (cfg && cfg.psaiCore) activePersona = cfg.psaiCore;
    if (cfg && cfg.contextSize) configuredContextSize = parseInt(cfg.contextSize, 10) || 2048;
    unlimitedContext = cfg && cfg.unlimitedContext === false ? false : true;
    if (cfg && cfg.nvidiaApiKey) nimApiKey = cfg.nvidiaApiKey;
    if (cfg && cfg.nimModel) nimModel = cfg.nimModel;
  });

  // Register the global Agent-S chunk stream handler
  window.yunisa.interpreter.onChunk(handleAgentChunk);

  loadConversationList();
}

function openRightPanel(title) {
  const panel = document.getElementById('right-panel');
  const content = document.getElementById('right-panel-content');
  const header = panel.querySelector('.right-panel-header');
  if (header && title) header.textContent = title;
  
  if (content) content.innerHTML = '';
  if (panel) panel.classList.remove('hidden');
  return content;
}

function closeRightPanel() {
  const panel = document.getElementById('right-panel');
  if (panel) panel.classList.add('hidden');
}

let agentSessionId = null;
let currentAgentTextEl = null;
let currentAgentTextContent = "";
let accumulatedAgentDbText = "";
let agentStepBar = null;
let agentStepCount = 0;
const MAX_AGENT_STEPS = 15;

function createStepBar() {
  const bar = document.createElement('div');
  bar.className = 'agent-step-bar';
  const label = document.createElement('span');
  label.className = 'step-label';
  label.textContent = 'Agent Progress';
  bar.appendChild(label);
  const dots = document.createElement('div');
  dots.className = 'step-dots';
  for (let i = 0; i < MAX_AGENT_STEPS; i++) {
    const dot = document.createElement('div');
    dot.className = 'step-dot';
    dots.appendChild(dot);
  }
  bar.appendChild(dots);
  return bar;
}

function updateStepBar(stepIndex, state) {
  if (!agentStepBar) return;
  const dots = agentStepBar.querySelectorAll('.step-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('done', 'active', 'error');
    if (i < stepIndex) dot.classList.add('done');
    else if (i === stepIndex) dot.classList.add(state);
  });
  const label = agentStepBar.querySelector('.step-label');
  if (label) label.textContent = `Step ${stepIndex + 1} of ${MAX_AGENT_STEPS}`;
}

function createActionCard(type, content, lang) {
  const card = document.createElement('div');
  card.className = 'agent-action-card';
  const header = document.createElement('div');
  header.className = 'action-header';
  
  if (type === 'code') {
    header.classList.add('executing');
    header.textContent = lang ? `Executing ${lang}` : 'Executing Code';
  } else if (type === 'error') {
    header.classList.add('error');
    header.textContent = 'Execution Error';
  } else {
    header.classList.add('success');
    header.textContent = 'Action Complete';
  }
  card.appendChild(header);
  
  const body = document.createElement('div');
  body.className = 'action-body';
  const pre = document.createElement('pre');
  pre.textContent = content;
  body.appendChild(pre);
  card.appendChild(body);
  return card;
}

let agentWorkspaceEl = null;

function handleAgentChunk(chunk) {
  const messages = messagesEl();
  if (!messages) return;

  switch (chunk.type) {
    case 'text_delta':
      if (!agentWorkspaceEl) {
        agentWorkspaceEl = appendMessage('assistant', '');
      }
      if (!currentAgentTextEl) {
        currentAgentTextEl = document.createElement('div');
        currentAgentTextEl.className = 'agent-narrative';
        agentWorkspaceEl.appendChild(currentAgentTextEl);
        currentAgentTextContent = "";
      }
      currentAgentTextContent += chunk.content;
      accumulatedAgentDbText += chunk.content;
      
      // Parse step indicators from the text stream
      const stepMatch = currentAgentTextContent.match(/Step (\d+)\/(\d+)/);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1], 10) - 1;
        if (!agentStepBar) {
          agentStepBar = createStepBar();
          agentWorkspaceEl.insertBefore(agentStepBar, agentWorkspaceEl.firstChild);
        }
        agentStepCount = stepNum;
        updateStepBar(stepNum, 'active');
        
        // Clean out the raw text so it doesnt look ugly alongside the visual bar
        currentAgentTextContent = currentAgentTextContent.replace(/--- Step \d+\/\d+ --- Capturing screen context\.\.\. Thinking\.\.\./g, '');
        currentAgentTextContent = currentAgentTextContent.replace(/Executing action\.\.\./g, '');
      }
      
      if (currentAgentTextContent.trim()) {
        renderMarkdown(currentAgentTextEl, currentAgentTextContent);
      }
      scrollToBottom();
      break;

    case 'code':
      if (!agentWorkspaceEl) agentWorkspaceEl = appendMessage('assistant', '');
      
      // Render as a structured action card
      const actionCard = createActionCard('code', chunk.content, chunk.language);
      agentWorkspaceEl.appendChild(actionCard);

      accumulatedAgentDbText += `\n\n\`\`\`${chunk.language}\n${chunk.content}\n\`\`\`\n\n`;

      // Mark current step as done
      if (agentStepBar) updateStepBar(agentStepCount, 'done');

      // Reset text accumulator for subsequent replies so they append AFTER the code block
      currentAgentTextEl = null;
      currentAgentTextContent = "";
      scrollToBottom();
      break;

    case 'error':
      if (!agentWorkspaceEl) agentWorkspaceEl = appendMessage('assistant', '');
      // Render error as a distinct card
      const errorCard = createActionCard('error', chunk.content);
      agentWorkspaceEl.appendChild(errorCard);
      accumulatedAgentDbText += `\n\n**Error:** ${chunk.content}\n\n`;
      
      if (agentStepBar) updateStepBar(agentStepCount, 'error');
      scrollToBottom();
      break;

    case 'done':
      // The python backend handles terminal state messages (Abort, Error, Complete).

      
      // Save the total aggregated action flow into the database
      if (accumulatedAgentDbText && currentConversationId) {
        window.yunisa.conversations.addMessage(currentConversationId, "assistant", accumulatedAgentDbText).catch(e => console.warn(e));
      }
      accumulatedAgentDbText = "";
      currentAgentTextEl = null;
      agentWorkspaceEl = null;
      agentStepBar = null;
      agentStepCount = 0;
      isSending = false;
      sendBtn().style.display = "inline-flex";
      stopBtn().style.display = "none";
      break;
  }
}


async function loadConversationList() {
  const conversations = await window.yunisa.conversations.list();
  const list = convList();
  if (!list) return;

  list.innerHTML = "";

  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = "conversation-item";
    item.textContent = conv.title;
    item.dataset.id = conv.id;

    if (conv.id === currentConversationId) {
      item.classList.add("active");
    }

    item.addEventListener("click", () => loadConversation(conv.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "conv-delete-btn";
    deleteBtn.textContent = "\u00d7";
    deleteBtn.title = "Delete conversation";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.yunisa.conversations.delete(conv.id);
      if (currentConversationId === conv.id) {
        currentConversationId = null;
        messagesEl().innerHTML = "";
        if (chatTitle()) chatTitle().textContent = "New Chat";
      }
      loadConversationList();
    });

    item.appendChild(deleteBtn);
    list.appendChild(item);
  });
}

async function loadConversation(id) {
  currentConversationId = id;
  const conv = await window.yunisa.conversations.get(id);
  const messages = await window.yunisa.conversations.getMessages(id);

  if (chatTitle() && conv) {
    chatTitle().textContent = conv.title;
  }

  closeRightPanel();
  messagesEl().innerHTML = "";
  if (contextWarning()) contextWarning().style.display = "none";

  messages.forEach((msg) => {
    appendMessage(msg.role, msg.content);
  });

  scrollToBottom();
  loadConversationList();
}

async function startNewChat() {
  const model = await window.yunisa.models.getActive();
  const modelName = model ? model.id || "local" : "local";
  const conv = await window.yunisa.conversations.create(modelName);

  currentConversationId = conv.id;
  closeRightPanel();
  messagesEl().innerHTML = "";
  if (chatTitle()) chatTitle().textContent = "New Chat";
  if (contextWarning()) contextWarning().style.display = "none";
  inputEl().value = "";
  inputEl().focus();

  loadConversationList();
}

let isSending = false;

async function sendMessage() {
  if (isSending) return;
  
  const input = inputEl();
  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  try {

  // Ensure we have a conversation
  if (!currentConversationId) {
    await startNewChat();
  }

  // Lock the conversation ID for this specific message stream to prevent bleed if user switches chats
  const activeConversationId = currentConversationId;

  input.value = "";
  input.style.height = "auto";

  // Save user message to DB and display it
  await window.yunisa.conversations.addMessage(activeConversationId, "user", text);
  appendMessage("user", text);

  // Show stop button, hide send button
  sendBtn().style.display = "none";
  stopBtn().style.display = "inline-flex";

  const isAgentMode = document.getElementById('agent-mode-toggle')?.checked;

  if (isAgentMode) {
    closeRightPanel();


    if (!agentSessionId) {
      await window.yunisa.interpreter.start();
      agentSessionId = `agent_${Date.now()}`;
    }
    accumulatedAgentDbText = "";
    currentAgentTextEl = null;
    currentAgentTextContent = "";
    await window.yunisa.interpreter.send(text, agentSessionId);
    
    // Refresh conversation list (title may have changed on first message)
    loadConversationList();
    
    // Important: Do NOT set isSending to false here.
    // The handleAgentChunk 'done' case will unlock the UI.
    return;
  }

  // Get all messages for context (BitNet path)
  const allMessages = await window.yunisa.conversations.getMessages(activeConversationId);

  // ── MSAM: Get long-term memory context ───────────────────────────────────
  let msamContext = null;
  try {
    msamContext = await window.yunisa.memory.getContext(text, activeConversationId);
    if (msamContext?.injected) {
      console.log(`[MSAM] Memory injected — episodic:${msamContext.episodicHits} semantic:${msamContext.semanticHits}`);
    }
  } catch (e) {
    // Non-fatal — memory layer unavailable, continue without it
    console.warn('[MSAM] getContext failed:', e);
  }

  const apiMessages = buildApiMessages(allMessages, msamContext?.injected ? msamContext.block : null);

  // ── Research Mode: search web and inject context ──
  const isResearchMode = document.getElementById('research-mode-toggle')?.checked;
  let researchContext = '';
  if (isResearchMode) {
    const searchingEl = appendMessage('assistant', '');
    renderMarkdown(searchingEl, '🔍 *Synthesizing web research...*');

    const panelContent = openRightPanel("Deep Research");
    const statusEl = document.createElement('div');
    statusEl.className = 'interp-executing';
    statusEl.innerHTML = '<span>🔍 Searching the web...</span>';
    panelContent.appendChild(statusEl);

    try {
      const results = await window.yunisa.search.query(text);
      if (results && results.length > 0) {
        statusEl.innerHTML = `<span>📖 Reading ${results.length} sources...</span>`;
        
        const sourcesWrap = document.createElement('div');
        sourcesWrap.className = 'research-sources-grid';

        results.forEach(r => {
          const card = document.createElement('div');
          card.className = 'source-card';
          card.innerHTML = `<div class="source-title">${escapeHtml(r.title || '')}</div><div class="source-url">${escapeHtml(r.url || '')}</div><div class="source-snippet">${escapeHtml(r.snippet || '')}</div>`;
          card.addEventListener('click', () => { if (r.url) window.open?.(r.url); });
          sourcesWrap.appendChild(card);
        });
        panelContent.appendChild(sourcesWrap);

        const pageTexts = [];
        for (const r of results.slice(0, 3)) {
          if (r.url) {
            try {
              const pageText = await window.yunisa.search.fetch(r.url);
              pageTexts.push(`Source: ${r.title}\nURL: ${r.url}\n\n${pageText}`);
            } catch {}
          }
        }
        researchContext = pageTexts.join('\n\n---\n\n');
        
        statusEl.className = 'interp-output success';
        statusEl.innerHTML = `✅ Research complete. Synthesizing ${pageTexts.length} pages.`;
        
        // Remove the temporary "Synthesizing" chat bubble, as the real response will start
        if (searchingEl && searchingEl.parentElement) {
          searchingEl.parentElement.removeChild(searchingEl);
        }
      } else {
        statusEl.className = 'interp-output error';
        statusEl.innerHTML = '⚠️ No search results found.';
        renderMarkdown(searchingEl, '⚠️ *No search results found. Answering without web context.*');
      }
    } catch (err) {
      statusEl.className = 'interp-output error';
      statusEl.innerHTML = `⚠️ Search failed: ${err.message}`;
      renderMarkdown(searchingEl, `⚠️ *Search failed: ${err.message}. Answering without web context.*`);
    }
  }

  // Inject research context into the api messages
  if (researchContext) {
    apiMessages.splice(1, 0, {
      role: 'system',
      content: `The following web research was gathered for the user's question. Use it to provide an informed, cited response:\n\n${researchContext}`
    });
  }

  // Create assistant message placeholder
  const assistantEl = appendMessage("assistant", "");
  let fullResponse = "";

  // Refresh port in case server restarted
  const port = await window.yunisa.server.port();
  if (port) serverPort = port;

  // Determine inference endpoint — NIM cloud vs local
  const useNim = nimApiKey && nimApiKey.length > 10;
  const inferenceUrl = useNim
    ? 'https://integrate.api.nvidia.com/v1/chat/completions'
    : `http://127.0.0.1:${serverPort}/v1/chat/completions`;
  const inferenceHeaders = { 'Content-Type': 'application/json' };
  if (useNim) inferenceHeaders['Authorization'] = `Bearer ${nimApiKey}`;

  abortController = new AbortController();

  try {
    const response = await fetch(inferenceUrl, {
      method: 'POST',
      headers: inferenceHeaders,
      body: JSON.stringify({
        model: useNim ? nimModel : undefined,
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      renderMarkdown(assistantEl, `**Error ${response.status}**: ${errText}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            renderMarkdown(assistantEl, fullResponse);
            scrollToBottom();
          }
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }

    // Guard: if the model returned zero tokens, show a diagnostic
    if (!fullResponse.trim()) {
      renderMarkdown(assistantEl, "**No response received.** The AI engine may be overloaded or restarting. Try again in a moment.");
    }
  } catch (err) {
    if (err.name === "AbortError") {
      fullResponse += "\n\n*[Generation stopped]*";
      renderMarkdown(assistantEl, fullResponse);
    } else {
      // Check if server is still alive
      const serverStatus = await window.yunisa.server.status();
      if (serverStatus !== "ready") {
        renderMarkdown(
          assistantEl,
          "**Connection lost** — the AI engine stopped unexpectedly. Restarting..."
        );
        // Attempt restart
        try {
          const active = await window.yunisa.models.getActive();
          if (active) {
            const result = await window.yunisa.server.start(active.path);
            const port = await window.yunisa.server.port();
            if (port) serverPort = port;
            if (result.status === "ready") {
              renderMarkdown(
                assistantEl,
                "**Reconnected** — the AI engine has restarted. Please send your message again."
              );
            } else {
              renderMarkdown(
                assistantEl,
                "**Failed to restart** the AI engine. Please restart YUNISA."
              );
            }
          }
        } catch {
          renderMarkdown(
            assistantEl,
            "**Failed to restart** the AI engine. Please restart YUNISA."
          );
        }
      } else {
        renderMarkdown(assistantEl, `**Connection error**: ${err.message}`);
      }
    }
  } finally {
    abortController = null;
    sendBtn().style.display = "inline-flex";
    stopBtn().style.display = "none";
  }

  // Save assistant response to DB only if conversation wasn't deleted mid-stream
  if (fullResponse) {
    try {
      await window.yunisa.conversations.addMessage(activeConversationId, "assistant", fullResponse);
    } catch (dbErr) {
      console.warn("Could not save assistant message: conversation was likely deleted or dropped.", dbErr);
    }

    // ── MSAM: fire-and-forget memory update ──────────────────────────────────
    // Trigger episodic summarisation and semantic re-index after each reply.
    // These are non-blocking — the UI is already unlocked before they finish.
    try {
      const currentPort = serverPort;
      window.yunisa.memory.summarise(activeConversationId, currentPort).catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  // Refresh conversation list (title may have changed on first message)
  loadConversationList();
  } catch (outerErr) {
    console.error("Outer sendMessage error:", outerErr);
  } finally {
    // We only unlock here if it's the BitNet flow.
    // The Agent flow bypasses this block completely via an early return outside the `try` block.
    // Wait, the early return IS inside the `try` block! So `finally` will execute anyway!
    // We must check if we're in agent mode.
    if (!document.getElementById('agent-mode-toggle')?.checked) {
      isSending = false;
    }
  }
}

function stopGeneration() {
  const isAgentMode = document.getElementById('agent-mode-toggle')?.checked;
  if (isAgentMode && agentSessionId) {
    window.yunisa.interpreter.abort(agentSessionId);
    isSending = false;
    sendBtn().style.display = "inline-flex";
    stopBtn().style.display = "none";
  } else if (abortController) {
    abortController.abort();
  }
}

function buildApiMessages(messages, memoryBlock = null) {
  const PERSONAS = {
    default: 'You are YUNISA, a helpful AI assistant running locally. Be concise and helpful.',
    sovereign: 'You are YUNISA, acting as The Sovereign Advisor — a powerful, strategic intellect. Speak with authority, precision, and foresight. Avoid hedging.',
    kinetic: 'You are YUNISA in Kinetic Director mode. Be high-energy, direct, action-oriented. Prioritize brevity and decisive output.',
    cyberdeck: 'You are YUNISA running System 07 Cyberdeck Protocol. Respond in a technical, hacker-aesthetic style with deep system awareness.',
  };
  const systemPrompt = PERSONAS[activePersona] || PERSONAS.default;

  // If unlimited context is enabled, allow more history but STRICTLY CAP at 75% to leave room for generation.
  // If we send Infinity, the model hits its token limit instantly and the response is cut off.
  const maxChars = unlimitedContext 
    ? Math.floor(configuredContextSize * 4 * 0.75)
    : Math.max(800, Math.floor(configuredContextSize * 4 * 0.4));
  let totalChars = 0;
  const result = [];
  let truncated = false;

  result.push({ role: "system", content: systemPrompt });

  // ── MSAM: inject long-term memory block right after persona system prompt ──
  if (memoryBlock) {
    result.push({ role: "system", content: memoryBlock });
  }

  const reversed = [...messages].reverse();
  const collected = [];

  for (const msg of reversed) {
    const msgChars = msg.content.length;
    if (totalChars + msgChars > maxChars && collected.length > 0) {
      truncated = true;
      break;
    }
    totalChars += msgChars;
    collected.push({ role: msg.role, content: msg.content });
  }

  collected.reverse();
  result.push(...collected);

  const warn = contextWarning();
  if (warn) {
    warn.style.display = truncated ? "block" : "none";
    if (truncated) {
      warn.textContent = `Context truncated: showing ${collected.length} of ${messages.length} messages (~${totalChars} chars)`;
    }
  }

  return result;
}

function appendMessage(role, content) {
  const container = messagesEl();
  const div = document.createElement("div");
  div.className = `message message-${role}`;

  const label = document.createElement("span");
  label.className = "message-role";
  label.textContent = role === "user" ? "You" : "YUNISA";
  div.appendChild(label);

  const body = document.createElement("div");
  body.className = "message-body";
  div.appendChild(body);

  if (content) renderMarkdown(body, content);

  // Timestamp
  const ts = document.createElement("div");
  ts.className = "message-ts";
  ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.appendChild(ts);

  // Copy button (only for assistant)
  if (role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(body.innerText || body.textContent || '');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
    div.appendChild(copyBtn);
  }

  container.appendChild(div);
  scrollToBottom();
  return body;
}

function replaceTrtTags(html) {
  let result = html;
  
  // Handle both raw and escaped semantic tags (case-insensitive) to prevent parser dropouts
  result = result.replace(/&lt;thesis&gt;|<thesis>/gi, '<div class="trt-block trt-thesis"><div class="trt-badge">+1 THESIS</div><div class="trt-content">');
  result = result.replace(/&lt;\/thesis&gt;|<\/thesis>/gi, '</div></div>');
  
  result = result.replace(/&lt;antithesis&gt;|<antithesis>/gi, '<div class="trt-block trt-antithesis"><div class="trt-badge">-1 ANTITHESIS</div><div class="trt-content">');
  result = result.replace(/&lt;\/antithesis&gt;|<\/antithesis>/gi, '</div></div>');
  
  result = result.replace(/&lt;synthesis&gt;|<synthesis>/gi, '<div class="trt-block trt-synthesis"><div class="trt-badge">0 SYNTHESIS</div><div class="trt-content">');
  result = result.replace(/&lt;\/synthesis&gt;|<\/synthesis>/gi, '</div></div>');
  
  return result;
}

function renderMarkdown(el, text) {
  let html = "";
  // Use marked.js if available, else fall back to simple renderer
  if (window.marked) {
    html = window.marked.parse(text);
  } else {
    let safe = escapeHtml(text);
    safe = safe.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
    safe = safe.replace(/\n/g, '<br>');
    html = safe;
  }
  el.innerHTML = replaceTrtTags(html);

  // ── Add "Run" buttons to code blocks ──
  el.querySelectorAll('pre > code').forEach(codeEl => {
    const pre = codeEl.parentElement;
    pre.style.position = 'relative';
    const langClass = [...codeEl.classList].find(c => c.startsWith('lang-') || c.startsWith('language-'));
    const lang = langClass ? langClass.replace(/^(lang-|language-)/, '') : '';
    const runnable = ['python', 'py', 'javascript', 'js', 'bash', 'sh', 'powershell', 'ps1'].includes(lang.toLowerCase());
    if (!runnable) return;

    const btn = document.createElement('button');
    btn.className = 'code-run-btn';
    btn.textContent = '▶ Run';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Running...';
      try {
        const result = await window.yunisa.executor.run(lang, codeEl.textContent);
        let outputEl = pre.nextElementSibling;
        if (!outputEl || !outputEl.classList.contains('code-output')) {
          outputEl = document.createElement('div');
          pre.after(outputEl);
        }
        outputEl.className = 'code-output' + (result.exit_code !== 0 ? ' error' : '');
        outputEl.textContent = (result.stdout || '') + (result.stderr ? '\n' + result.stderr : '') || '(no output)';
      } catch (e) {
        let outputEl = pre.nextElementSibling;
        if (!outputEl || !outputEl.classList.contains('code-output')) {
          outputEl = document.createElement('div');
          pre.after(outputEl);
        }
        outputEl.className = 'code-output error';
        outputEl.textContent = 'Execution error: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = '▶ Run';
    });
    pre.appendChild(btn);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom(force = false) {
  const container = messagesEl();
  
  if (force) {
    container.scrollTop = container.scrollHeight;
    return;
  }

  // Only auto-scroll if the user is already within 150px of the bottom.
  // This prevents the chat from violently snapping down if they scrolled up to read.
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  if (isNearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}
