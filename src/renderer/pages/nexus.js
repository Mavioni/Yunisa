// ═══════════════════════════════════════════════════════
//  DATA NEXUS  —  YUNISA Knowledge Graph Explorer
//  Connects to the live MSAM multi-scale memory store
// ═══════════════════════════════════════════════════════

export function initNexus() {
  const container = document.getElementById('nexus-screen');
  if (!container) return;

  container.innerHTML = `
    <div class="nexus-root">
      <!-- ── Header ─────────────────────────────────── -->
      <header class="nexus-header">
        <div class="nexus-header-left">
          <div class="nexus-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <div>
            <h2 class="nexus-title">DATA NEXUS</h2>
            <span class="nexus-subtitle">MSAM Knowledge Graph</span>
          </div>
          <div class="nexus-badge" id="nexus-status-badge">● LOADING</div>
        </div>
        <div class="nexus-header-right">
          <div class="nexus-search-wrap">
            <svg class="nexus-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="nexus-search" class="nexus-search" placeholder="Filter nodes…" type="text"/>
          </div>
          <button id="nexus-fit" class="nexus-btn" title="Fit graph">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
          </button>
          <button id="nexus-refresh" class="nexus-btn nexus-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            Re-sync
          </button>
        </div>
      </header>

      <!-- ── Stats bar ──────────────────────────────── -->
      <div class="nexus-stats-bar" id="nexus-stats-bar">
        <div class="nexus-stat"><span class="nexus-stat-val" id="stat-nodes">—</span><span class="nexus-stat-label">Nodes</span></div>
        <div class="nexus-stat-divider"></div>
        <div class="nexus-stat"><span class="nexus-stat-val" id="stat-edges">—</span><span class="nexus-stat-label">Links</span></div>
        <div class="nexus-stat-divider"></div>
        <div class="nexus-stat"><span class="nexus-stat-val" id="stat-convs">—</span><span class="nexus-stat-label">Conversations</span></div>
        <div class="nexus-stat-divider"></div>
        <div class="nexus-stat"><span class="nexus-stat-val" id="stat-facts">—</span><span class="nexus-stat-label">Working Facts</span></div>
      </div>

      <!-- ── Main body ──────────────────────────────── -->
      <div class="nexus-body">
        <div id="nexus-graph" class="nexus-graph">
          <div class="nexus-loading-overlay" id="nexus-loading">
            <div class="nexus-spinner"></div>
            <p>Mapping memory ontology…</p>
          </div>
        </div>

        <!-- ── Detail panel ──────────────────────────── -->
        <aside class="nexus-panel" id="nexus-panel">
          <div class="nexus-panel-header">
            <h3>ENTITY INSPECTOR</h3>
            <button class="nexus-panel-close" id="nexus-panel-close">&times;</button>
          </div>
          <div class="nexus-panel-body" id="nexus-panel-body">
            <div class="nexus-panel-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3"/></svg>
              <p>Select a node to inspect its memory data</p>
            </div>
          </div>
          <!-- Legend -->
          <div class="nexus-legend">
            <div class="nexus-legend-title">ONTOLOGY</div>
            <div class="nexus-legend-items">
              <span class="nexus-legend-dot" style="background:#6366f1"></span><span>Conversation</span>
              <span class="nexus-legend-dot" style="background:#10b981"></span><span>Topic / Entity</span>
              <span class="nexus-legend-dot" style="background:#f59e0b"></span><span>Working Fact</span>
              <span class="nexus-legend-dot" style="background:#3b82f6"></span><span>Keyword</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;

  // ── State ──────────────────────────────────────────────────────────────────
  let network = null;
  let allNodes = null;
  let allEdges = null;
  let rawEpisodic = [];
  let rawWorking = {};
  let rawConvs = [];
  const panelOpen = { value: false };

  // ── Load & render ──────────────────────────────────────────────────────────
  async function loadAndRender() {
    setStatus('SYNCING', false);
    showLoading(true);

    try {
      [rawEpisodic, rawWorking, rawConvs] = await Promise.all([
        window.yunisa.memory.getAllEpisodic().catch(() => []),
        window.yunisa.memory.getAllWorking().catch(() => ({})),
        window.yunisa.conversations.list().catch(() => []),
      ]);

      const { nodes, edges } = buildGraph(rawEpisodic, rawWorking, rawConvs);
      renderGraph(nodes, edges);
      updateStats(nodes, edges, rawConvs, rawWorking);
      setStatus('LIVE', true);
    } catch (err) {
      console.error('[Nexus] Load failed:', err);
      setStatus('OFFLINE', false);
    } finally {
      showLoading(false);
    }
  }

  // ── Graph builder ───────────────────────────────────────────────────────────
  function buildGraph(episodic, working, convs) {
    const nodes = [];
    const edges = [];
    let nodeId = 1;
    const convMap = new Map(); // conv_id → nodeId
    const topicMap = new Map(); // topic → nodeId

    // ── Build conversation id → title map ──
    const convTitleMap = new Map();
    for (const c of convs) {
      convTitleMap.set(c.id, c.title || `Conv ${c.id.slice(0, 6)}`);
    }

    // ── Nodes: Conversations (with episodic summary) ──
    for (const ep of episodic) {
      const title = convTitleMap.get(ep.conversation_id) || ep.conversation_id.slice(0, 8) + '…';
      const id = nodeId++;
      convMap.set(ep.conversation_id, id);
      nodes.push({
        id,
        label: truncate(title, 22),
        group: 'conversation',
        title: ep.summary || title,
        fullData: {
          type: 'Conversation',
          id: ep.conversation_id,
          title,
          summary: ep.summary,
          tokens: ep.token_count,
          updated: ep.updated_at,
        },
        value: 30 + Math.min(ep.token_count / 10, 40), // size ~ token count
      });

      // ── Extract topics from summary ──
      const topics = extractTopics(ep.summary);
      for (const topic of topics) {
        let topicNodeId = topicMap.get(topic);
        if (topicNodeId === undefined) {
          topicNodeId = nodeId++;
          topicMap.set(topic, topicNodeId);
          nodes.push({
            id: topicNodeId,
            label: topic,
            group: 'topic',
            title: `Topic: ${topic}`,
            fullData: { type: 'Topic/Entity', label: topic, conversations: [] },
          });
        }
        // link conv → topic
        const topicNode = nodes.find(n => n.id === topicNodeId);
        if (topicNode) topicNode.fullData.conversations.push(title);
        edges.push({ from: id, to: topicNodeId, label: 'discusses', arrows: 'to' });
      }
    }

    // ── Nodes: Working memory facts ──
    for (const [key, value] of Object.entries(working)) {
      const id = nodeId++;
      nodes.push({
        id,
        label: truncate(key, 20),
        group: 'fact',
        title: `${key}: ${value}`,
        fullData: { type: 'Working Memory', key, value },
      });

      // Connect facts to relevant conversations by keyword matching
      for (const [convId, convNodeId] of convMap) {
        const ep = episodic.find(e => e.conversation_id === convId);
        if (ep && (ep.summary.toLowerCase().includes(key.toLowerCase()) || ep.summary.toLowerCase().includes(value.toLowerCase()))) {
          edges.push({ from: convNodeId, to: id, label: 'knows', arrows: 'to', dashes: true });
        }
      }
    }

    // ── Link conversations sharing topics ──
    const convNodes = nodes.filter(n => n.group === 'conversation');
    for (let i = 0; i < convNodes.length; i++) {
      for (let j = i + 1; j < convNodes.length; j++) {
        const aTopics = getConvTopics(convNodes[i].id, edges, topicMap);
        const bTopics = getConvTopics(convNodes[j].id, edges, topicMap);
        const shared = aTopics.filter(t => bTopics.includes(t));
        if (shared.length >= 2) {
          edges.push({ from: convNodes[i].id, to: convNodes[j].id, label: 'related', arrows: '', dashes: true, width: 0.8 });
        }
      }
    }

    return { nodes, edges };
  }

  function getConvTopics(convId, edges, topicMap) {
    const topicIds = new Set([...topicMap.values()]);
    return edges
      .filter(e => e.from === convId && topicIds.has(e.to))
      .map(e => [...topicMap.entries()].find(([, id]) => id === e.to)?.[0])
      .filter(Boolean);
  }

  function extractTopics(summary) {
    if (!summary) return [];
    const topics = new Set();

    // Capitalized multi-word phrases (entities)
    const entityRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    let m;
    while ((m = entityRe.exec(summary)) !== null) {
      if (m[1].length < 40) topics.add(m[1]);
    }

    // Single capitalized important nouns (not at sentence start)
    const words = summary.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i].replace(/[^A-Za-z]/g, '');
      if (w.length > 4 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) {
        topics.add(w);
      }
    }

    // Keep only meaningful short topics (avoid noise)
    return [...topics].filter(t => t.length > 3 && t.length < 35).slice(0, 6);
  }

  // ── Render graph ────────────────────────────────────────────────────────────
  function renderGraph(nodeData, edgeData) {
    const graphEl = document.getElementById('nexus-graph');
    if (!graphEl) return;

    if (network) { network.destroy(); network = null; }

    if (nodeData.length === 0) {
      graphEl.innerHTML = `
        <div class="nexus-empty">
          <div class="nexus-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3"/></svg>
          </div>
          <h3>No Memory Data Yet</h3>
          <p>Start some conversations with YUNISA and the knowledge graph will populate as memories are indexed.</p>
        </div>`;
      return;
    }

    if (typeof vis === 'undefined') {
      graphEl.innerHTML = `<div class="nexus-empty"><p>vis-network library not loaded. Check your internet connection.</p></div>`;
      return;
    }

    allNodes = new vis.DataSet(nodeData);
    allEdges = new vis.DataSet(edgeData);

    const options = {
      nodes: {
        shape: 'dot',
        font: { color: '#cbd5e1', face: 'JetBrains Mono, monospace', size: 11, strokeWidth: 3, strokeColor: '#050a0d' },
        borderWidth: 2,
        borderWidthSelected: 3,
        shadow: { enabled: true, size: 18, x: 0, y: 0 },
        scaling: { min: 14, max: 52, label: { min: 10, max: 14 } },
      },
      edges: {
        width: 1.2,
        selectionWidth: 2.5,
        color: { color: 'rgba(99,102,241,0.28)', highlight: '#6366f1', hover: '#818cf8' },
        smooth: { type: 'dynamic' },
        font: { color: '#64748b', size: 9, background: 'rgba(5,10,13,0.85)', strokeWidth: 0, face: 'JetBrains Mono, monospace' },
        arrows: { to: { enabled: true, scaleFactor: 0.55 } },
      },
      groups: {
        conversation: {
          color: { background: '#6366f1', border: '#4f46e5', highlight: { background: '#818cf8', border: '#6366f1' } },
          shadow: { color: 'rgba(99,102,241,0.6)' },
        },
        topic: {
          color: { background: '#10b981', border: '#059669', highlight: { background: '#34d399', border: '#10b981' } },
          shadow: { color: 'rgba(16,185,129,0.5)' },
        },
        fact: {
          color: { background: '#f59e0b', border: '#d97706', highlight: { background: '#fbbf24', border: '#f59e0b' } },
          shadow: { color: 'rgba(245,158,11,0.5)' },
          shape: 'diamond',
        },
        keyword: {
          color: { background: '#3b82f6', border: '#2563eb', highlight: { background: '#60a5fa', border: '#3b82f6' } },
          shadow: { color: 'rgba(59,130,246,0.4)' },
          shape: 'triangleDown',
        },
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -55,
          centralGravity: 0.008,
          springLength: 180,
          springConstant: 0.06,
          damping: 0.4,
          avoidOverlap: 0.8,
        },
        maxVelocity: 60,
        solver: 'forceAtlas2Based',
        timestep: 0.35,
        stabilization: { iterations: 200, fit: true },
      },
      interaction: {
        hover: true,
        tooltipDelay: 150,
        zoomSpeed: 0.7,
        navigationButtons: false,
        keyboard: { enabled: true, bindToWindow: false },
      },
    };

    network = new vis.Network(graphEl, { nodes: allNodes, edges: allEdges }, options);

    network.on('click', ({ nodes: clickedNodes }) => {
      if (clickedNodes.length > 0) {
        showNodeDetail(clickedNodes[0]);
      } else {
        closePanelIfEmpty();
      }
    });

    network.on('hoverNode', () => { graphEl.style.cursor = 'pointer'; });
    network.on('blurNode', () => { graphEl.style.cursor = 'default'; });

    // Search integration
    document.getElementById('nexus-search')?.addEventListener('input', (e) => {
      filterNodes(e.target.value.trim());
    });

    document.getElementById('nexus-fit')?.addEventListener('click', () => {
      network?.fit({ animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    });
  }

  // ── Node detail panel ───────────────────────────────────────────────────────
  function showNodeDetail(nodeId) {
    const node = allNodes.get(nodeId);
    if (!node) return;

    const panel = document.getElementById('nexus-panel');
    const body = document.getElementById('nexus-panel-body');
    if (!panel || !body) return;

    panel.classList.add('open');
    panelOpen.value = true;

    const d = node.fullData;
    let html = '';

    if (d.type === 'Conversation') {
      html = `
        <div class="nexus-detail-chip ${d.type.toLowerCase()}">${d.type}</div>
        <div class="nexus-detail-field"><label>TITLE</label><div class="nexus-detail-val">${escHtml(d.title)}</div></div>
        <div class="nexus-detail-field"><label>CONVERSATION ID</label><div class="nexus-detail-val mono">${escHtml(d.id)}</div></div>
        ${d.updated ? `<div class="nexus-detail-field"><label>LAST UPDATED</label><div class="nexus-detail-val">${new Date(d.updated).toLocaleString()}</div></div>` : ''}
        ${d.tokens ? `<div class="nexus-detail-field"><label>MEMORY TOKENS</label><div class="nexus-detail-val">${d.tokens}</div></div>` : ''}
        ${d.summary ? `<div class="nexus-detail-field"><label>EPISODIC SUMMARY</label><div class="nexus-detail-summary">${escHtml(d.summary)}</div></div>` : ''}
      `;
    } else if (d.type === 'Topic/Entity') {
      const linkedConvs = (d.conversations || []).map(c => `<span class="nexus-tag">${escHtml(c)}</span>`).join('');
      html = `
        <div class="nexus-detail-chip topic">Topic / Entity</div>
        <div class="nexus-detail-field"><label>LABEL</label><div class="nexus-detail-val">${escHtml(d.label)}</div></div>
        ${linkedConvs ? `<div class="nexus-detail-field"><label>APPEARS IN</label><div class="nexus-tag-list">${linkedConvs}</div></div>` : ''}
      `;
    } else if (d.type === 'Working Memory') {
      html = `
        <div class="nexus-detail-chip fact">Working Memory</div>
        <div class="nexus-detail-field"><label>KEY</label><div class="nexus-detail-val mono">${escHtml(d.key)}</div></div>
        <div class="nexus-detail-field"><label>VALUE</label><div class="nexus-detail-summary">${escHtml(d.value)}</div></div>
      `;
    }

    // Relationships
    const connectedEdges = network.getConnectedEdges(nodeId).map(e => allEdges.get(e)).filter(Boolean);
    if (connectedEdges.length > 0) {
      const relItems = connectedEdges.slice(0, 8).map(e => {
        const isSrc = e.from === nodeId;
        const otherId = isSrc ? e.to : e.from;
        const other = allNodes.get(otherId);
        if (!other) return '';
        return `<div class="nexus-rel">
          <span class="nexus-rel-arrow ${isSrc ? 'out' : 'in'}">${isSrc ? '→' : '←'}</span>
          <span class="nexus-rel-type">${escHtml(e.label || '')}</span>
          <span class="nexus-rel-node">${escHtml(other.label)}</span>
        </div>`;
      }).join('');
      html += `<div class="nexus-detail-field"><label>CONNECTIONS (${connectedEdges.length})</label><div class="nexus-rels">${relItems}</div></div>`;
    }

    body.innerHTML = html || '<p class="nexus-panel-none">No details available</p>';

    // Highlight connected nodes
    network.selectNodes([nodeId]);
  }

  function closePanelIfEmpty() {
    document.getElementById('nexus-panel')?.classList.remove('open');
    panelOpen.value = false;
  }

  document.getElementById('nexus-panel-close')?.addEventListener('click', closePanelIfEmpty);

  // ── Search / filter ─────────────────────────────────────────────────────────
  function filterNodes(query) {
    if (!allNodes || !network) return;
    if (!query) {
      allNodes.forEach(n => allNodes.update({ id: n.id, opacity: 1, hidden: false }));
      return;
    }
    const q = query.toLowerCase();
    const matches = new Set();
    allNodes.forEach(n => {
      if ((n.label || '').toLowerCase().includes(q) || (n.title || '').toLowerCase().includes(q)) {
        matches.add(n.id);
      }
    });
    allNodes.forEach(n => {
      allNodes.update({ id: n.id, opacity: matches.has(n.id) ? 1 : 0.08 });
    });
    if (matches.size > 0) {
      network.fit({ nodes: [...matches], animation: { duration: 400, easingFunction: 'easeOutQuad' } });
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function updateStats(nodes, edges, convs, working) {
    setText('stat-nodes', nodes.length);
    setText('stat-edges', edges.length);
    setText('stat-convs', convs.length);
    setText('stat-facts', Object.keys(working).length);
  }

  function setStatus(label, ok) {
    const el = document.getElementById('nexus-status-badge');
    if (!el) return;
    el.textContent = `● ${label}`;
    el.className = `nexus-badge ${ok ? 'ok' : 'warn'}`;
  }

  function showLoading(on) {
    const el = document.getElementById('nexus-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  }

  function truncate(str, max) {
    return str && str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Wire refresh button ─────────────────────────────────────────────────────
  document.getElementById('nexus-refresh')?.addEventListener('click', loadAndRender);

  // ── Boot ────────────────────────────────────────────────────────────────────
  setTimeout(loadAndRender, 120);
}
