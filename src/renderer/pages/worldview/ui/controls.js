// ui/controls.js â€” Visual mode switching + layer toggle management

window.WV = window.WV || {};

WV.Controls = (function () {

  var activeLayers    = {};
  var currentMode     = 'normal';
  var _camRefreshTimer = null; // for CCTV snapshot auto-refresh

  function init() {
    _bindModeButtons();
    _bindLayerToggles();
    setMode('normal');
  }

  // â”€â”€ VISUAL MODES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function setMode(mode) {
    currentMode = mode;
    document.getElementById('wv-app').dataset.wvmode = mode;
    document.querySelectorAll('.wv-mode-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    var sbMode = document.getElementById('wv-sb-mode');
    if (sbMode) sbMode.textContent = mode.toUpperCase();
  }

  function _bindModeButtons() {
    document.querySelectorAll('.wv-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });
  }

  // â”€â”€ LAYER TOGGLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function _bindLayerToggles() {
    document.querySelectorAll('.wv-layer-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var layer  = row.dataset.layer;
        var toggle = document.getElementById('wv-toggle-' + layer);
        if (!toggle) return;
        var isOn = toggle.classList.contains('on');
        toggle.classList.toggle('on',  !isOn);
        toggle.classList.toggle('off',  isOn);
        activeLayers[layer] = !isOn;
        _updateActiveCount();
        window.dispatchEvent(new CustomEvent('wv:layerToggle', {
          detail: { layer: layer, active: !isOn }
        }));
      });
    });
  }

  function _updateActiveCount() {
    var count = Object.values(activeLayers).filter(Boolean).length;
    var badge = document.getElementById('wv-badge-active');
    var sbLayers = document.getElementById('wv-sb-layers');
    if (badge) badge.textContent = count + ' ACTIVE';
    if (sbLayers) sbLayers.textContent = count;
  }

  function updateCount(layer, n) {
    var el = document.getElementById('wv-count-' + layer);
    if (el) el.textContent = n;
    var total = 0;
    document.querySelectorAll('.wv-layer-count').forEach(function (c) {
      total += parseInt(c.textContent, 10) || 0;
    });
    var sbObjects = document.getElementById('wv-sb-objects');
    var totalEl   = document.getElementById('wv-total-objects');
    if (sbObjects) sbObjects.textContent = total;
    if (totalEl)   totalEl.textContent   = total;
  }

  function setStatus(msg) {
    var el = document.getElementById('wv-sb-status');
    if (el) el.textContent = msg;
  }

  // â”€â”€ INTEL PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // rows: [{key, val}, ...]
  // Special key: '_CAM_IMG' â€” renders a live camera snapshot widget below the rows

  function showIntel(rows) {
    var panel = document.getElementById('wv-intel-panel');
    if (!panel) return;

    // Stop any previous cam refresh
    if (_camRefreshTimer) { clearInterval(_camRefreshTimer); _camRefreshTimer = null; }

    panel.innerHTML = '';
    var camImgUrl = null;

    rows.forEach(function (r) {
      if (r.key === '_CAM_IMG') { camImgUrl = r.val; return; } // handle below

      var div = document.createElement('div');
      div.className = 'intel-row';
      div.innerHTML =
        '<span class="wv-intel-key">' + r.key + '</span>' +
        '<span class="wv-intel-val">' + r.val + '</span>';
      panel.appendChild(div);
    });

    // Camera snapshot widget
    if (camImgUrl) {
      var wrap = document.createElement('div');
      wrap.className = 'intel-cam-wrap';
      wrap.innerHTML =
        '<div class="wv-intel-cam-label">LIVE SNAPSHOT â”€ 8s REFRESH</div>' +
        '<img id="wv-cam-snapshot" class="wv-intel-cam-img"' +
        ' src="' + camImgUrl + '?t=' + Date.now() + '"' +
        ' onerror="this.onerror=null;this.style.display=\'none\';' +
          'document.getElementById(\'cam-offline\').style.display=\'flex\'">' +
        '<div id="wv-cam-offline" class="wv-intel-cam-offline" style="display:none">FEED OFFLINE</div>';
      panel.appendChild(wrap);

      // Refresh every 8 seconds â€” reset offline state and retry
      _camRefreshTimer = setInterval(function () {
        var img     = document.getElementById('wv-cam-snapshot');
        var offline = document.getElementById('wv-cam-offline');
        if (!img) return;
        if (offline) offline.style.display = 'none';
        img.style.display = '';
        img.onerror = function () {
          this.onerror = null;
          this.style.display = 'none';
          if (offline) offline.style.display = 'flex';
        };
        img.src = camImgUrl + '?t=' + Date.now();
      }, 8000);
    }
  }

  function clearIntel() {
    if (_camRefreshTimer) { clearInterval(_camRefreshTimer); _camRefreshTimer = null; }
    var panel = document.getElementById('wv-intel-panel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="wv-intel-placeholder">' +
        '<span>[ SELECT OBJECT ]</span>' +
        '<span>Click any tracked</span>' +
        '<span>entity to inspect</span>' +
      '</div>';
  }

  return {
    init:         init,
    setMode:      setMode,
    updateCount:  updateCount,
    setStatus:    setStatus,
    showIntel:    showIntel,
    clearIntel:   clearIntel,
  };

}());

