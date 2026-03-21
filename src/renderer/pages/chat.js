import { showScreen } from "../app.js";

let currentConversationId = null;
let abortController = null;
let serverPort = 8080;
let activePersona = 'default';
let configuredContextSize = 2048;

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

  // Load persona and context size from config
  window.yunisa.config.get().then(cfg => {
    if (cfg && cfg.psaiCore) activePersona = cfg.psaiCore;
    if (cfg && cfg.contextSize) configuredContextSize = parseInt(cfg.contextSize, 10) || 2048;
  });

  loadConversationList();
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
  messagesEl().innerHTML = "";
  if (chatTitle()) chatTitle().textContent = "New Chat";
  if (contextWarning()) contextWarning().style.display = "none";
  inputEl().value = "";
  inputEl().focus();

  loadConversationList();
}

async function sendMessage() {
  const input = inputEl();
  const text = input.value.trim();
  if (!text) return;

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

  // Get all messages for context
  const allMessages = await window.yunisa.conversations.getMessages(activeConversationId);
  const apiMessages = buildApiMessages(allMessages);

  // Show stop button, hide send button
  sendBtn().style.display = "none";
  stopBtn().style.display = "inline-flex";

  // Create assistant message placeholder
  const assistantEl = appendMessage("assistant", "");
  let fullResponse = "";

  // Refresh port in case server restarted
  const port = await window.yunisa.server.port();
  if (port) serverPort = port;

  abortController = new AbortController();

  try {
    const response = await fetch(`http://127.0.0.1:${serverPort}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
  }

  // Refresh conversation list (title may have changed on first message)
  loadConversationList();
}

function stopGeneration() {
  if (abortController) {
    abortController.abort();
  }
}

function buildApiMessages(messages) {
  const PERSONAS = {
    default: 'You are YUNISA, a helpful AI assistant running locally. Be concise and helpful.',
    sovereign: 'You are YUNISA, acting as The Sovereign Advisor — a powerful, strategic intellect. Speak with authority, precision, and foresight. Avoid hedging.',
    kinetic: 'You are YUNISA in Kinetic Director mode. Be high-energy, direct, action-oriented. Prioritize brevity and decisive output.',
    cyberdeck: 'You are YUNISA running System 07 Cyberdeck Protocol. Respond in a technical, hacker-aesthetic style with deep system awareness.',
  };
  const systemPrompt = PERSONAS[activePersona] || PERSONAS.default;

  // Reserve ~40% of context for history, 60% for DTIA prompts + generation
  // Rough heuristic: 1 token ≈ 4 chars
  const maxChars = Math.max(800, Math.floor(configuredContextSize * 4 * 0.4));
  let totalChars = 0;
  const result = [];
  let truncated = false;

  result.push({ role: "system", content: systemPrompt });

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
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  const container = messagesEl();
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}
