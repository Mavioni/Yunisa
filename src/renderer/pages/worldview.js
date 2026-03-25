// ═══════════════════════════════════════════════════════
//  WORLDVIEW — OSINT Geospatial Intelligence Dashboard
//  Ported from capone8x/WorldView (Bilawal Sidhu)
//  Integrated into YUNISA as a dedicated screen
// ═══════════════════════════════════════════════════════

export function initWorldView() {
  const container = document.getElementById('worldview-screen');
  if (!container) return;

  // Inject the complete WorldView HTML shell
  container.innerHTML = `
    <div id="wv-app">

      <!-- Visual mode overlays -->
      <div id="wv-overlay-nvg"  class="wv-vfx-overlay"></div>
      <div id="wv-overlay-flir" class="wv-vfx-overlay"></div>
      <div id="wv-overlay-crt"  class="wv-vfx-overlay"></div>

      <!-- ── TOP BAR ── -->
      <header id="wv-topbar">
        <div class="wv-tb-main">
          <div class="wv-tb-left">
            <span class="wv-brand">WORLDVIEW</span>
            <span class="wv-brand-sub">// OSINT COMMAND CENTER</span>
          </div>
          <div class="wv-tb-center">
            <span class="wv-live-dot"></span>
            <span class="wv-live-label">LIVE</span>
            <span id="wv-clock" class="wv-clock">--:--:-- UTC</span>
          </div>
          <div class="wv-tb-right">
            <span class="wv-coord-item">LAT <span id="wv-coord-lat" class="wv-coord-val">--.---</span></span>
            <span class="wv-coord-sep">|</span>
            <span class="wv-coord-item">LON <span id="wv-coord-lon" class="wv-coord-val">--.---</span></span>
            <span class="wv-coord-sep">|</span>
            <span class="wv-coord-item">ALT <span id="wv-coord-alt" class="wv-coord-val">---</span> km</span>
          </div>
        </div>
        <div id="wv-tz-strip">
          <span class="wv-tz-item" data-tz="America/New_York"><span class="wv-tz-label">NYC</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="America/Sao_Paulo"><span class="wv-tz-label">SAO</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Europe/London"><span class="wv-tz-label">LON</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Europe/Paris"><span class="wv-tz-label">PAR</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Europe/Moscow"><span class="wv-tz-label">MSK</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Asia/Tehran"><span class="wv-tz-label">TRN</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Asia/Dubai"><span class="wv-tz-label">DXB</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Asia/Kolkata"><span class="wv-tz-label">DEL</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Asia/Shanghai"><span class="wv-tz-label">BEI</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Asia/Tokyo"><span class="wv-tz-label">TOK</span><span class="wv-tz-time">--:--</span></span>
          <span class="wv-tz-sep">·</span>
          <span class="wv-tz-item" data-tz="Australia/Sydney"><span class="wv-tz-label">SYD</span><span class="wv-tz-time">--:--</span></span>
        </div>
      </header>

      <!-- ── LEFT PANEL: DATA LAYERS ── -->
      <aside id="wv-panel-layers">
        <div class="wv-panel-header">
          <span class="wv-panel-title">DATA LAYERS</span>
          <span class="wv-panel-badge" id="wv-badge-active">0 ACTIVE</span>
        </div>
        <div class="wv-layer-list">
          <div class="wv-layer-row" data-layer="satellites">
            <div class="wv-layer-toggle" id="wv-toggle-satellites"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">SATELLITES</span><span class="wv-layer-src">CelesTrak TLE</span></div>
            <span class="wv-layer-count" id="wv-count-satellites">0</span>
          </div>
          <div class="wv-layer-row" data-layer="flights">
            <div class="wv-layer-toggle" id="wv-toggle-flights"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">COMM FLIGHTS</span><span class="wv-layer-src">OpenSky</span></div>
            <span class="wv-layer-count" id="wv-count-flights">0</span>
          </div>
          <div class="wv-layer-row" data-layer="military">
            <div class="wv-layer-toggle" id="wv-toggle-military"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">MIL FLIGHTS</span><span class="wv-layer-src">adsb.lol</span></div>
            <span class="wv-layer-count" id="wv-count-military">0</span>
          </div>
          <div class="wv-layer-row" data-layer="maritime">
            <div class="wv-layer-toggle" id="wv-toggle-maritime"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">MARITIME</span><span class="wv-layer-src">AIS Stream</span></div>
            <span class="wv-layer-count" id="wv-count-maritime">0</span>
          </div>
          <div class="wv-layer-row" data-layer="sentinel">
            <div class="wv-layer-toggle" id="wv-toggle-sentinel"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">SENTINEL IMINT</span><span class="wv-layer-src">Copernicus / ESA</span></div>
            <span class="wv-layer-count" id="wv-count-sentinel">—</span>
          </div>
          <div id="wv-sentinel-controls">
            <div class="wv-sen-date-row">
              <span class="wv-sen-label">DATE</span>
              <input type="date" id="wv-sen-date" class="wv-sen-date-input">
              <button id="wv-sen-date-clear" class="wv-sen-clear-btn">CLR</button>
            </div>
            <div class="wv-sen-mode-grid">
              <button class="wv-sen-mode-btn active" data-sen-mode="OPT">OPT</button>
              <button class="wv-sen-mode-btn" data-sen-mode="NIR">NIR</button>
              <button class="wv-sen-mode-btn" data-sen-mode="SWIR">SWIR</button>
              <button class="wv-sen-mode-btn" data-sen-mode="VIIRS">VIIRS</button>
            </div>
          </div>
          <div class="wv-layer-row" data-layer="jamming">
            <div class="wv-layer-toggle" id="wv-toggle-jamming"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">GPS JAMMING</span><span class="wv-layer-src">GPSJam.org</span></div>
            <span class="wv-layer-count" id="wv-count-jamming">0</span>
          </div>
          <div class="wv-layer-row" data-layer="seismic">
            <div class="wv-layer-toggle" id="wv-toggle-seismic"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">SEISMIC</span><span class="wv-layer-src">USGS Feed</span></div>
            <span class="wv-layer-count" id="wv-count-seismic">0</span>
          </div>
          <div class="wv-layer-row" data-layer="weather">
            <div class="wv-layer-toggle" id="wv-toggle-weather"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">WEATHER</span><span class="wv-layer-src">Iowa State NEXRAD</span></div>
            <span class="wv-layer-count" id="wv-count-weather">—</span>
          </div>
          <div class="wv-layer-row" data-layer="traffic">
            <div class="wv-layer-toggle" id="wv-toggle-traffic"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">STREET TRAFFIC</span><span class="wv-layer-src">OpenStreetMap</span></div>
            <span class="wv-layer-count" id="wv-count-traffic">0</span>
          </div>
          <div class="wv-layer-row" data-layer="cctv">
            <div class="wv-layer-toggle" id="wv-toggle-cctv"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">CCTV FEEDS</span><span class="wv-layer-src">TfL + AMOS Global</span></div>
            <span class="wv-layer-count" id="wv-count-cctv">0</span>
          </div>
          <div class="wv-layer-row" data-layer="ports">
            <div class="wv-layer-toggle" id="wv-toggle-ports"><span class="wv-toggle-pip"></span></div>
            <div class="wv-layer-meta"><span class="wv-layer-name">GLOBAL PORTS</span><span class="wv-layer-src">HDX / NGA WPI</span></div>
            <span class="wv-layer-count" id="wv-count-ports">0</span>
          </div>
        </div>
        <div class="wv-panel-footer">
          <span class="wv-total-label">TRACKED</span>
          <span id="wv-total-objects" class="wv-total-val">0</span>
        </div>
      </aside>

      <!-- ── CESIUM GLOBE ── -->
      <div id="wv-cesiumContainer"></div>

      <!-- ── RIGHT PANEL ── -->
      <aside id="wv-panel-right">
        <div class="wv-panel-header"><span class="wv-panel-title">MAP VIEW</span></div>
        <div class="wv-mode-grid">
          <button class="wv-scene-btn active" id="wv-btn-scene-3d">3D GLOBE</button>
          <button class="wv-scene-btn" id="wv-btn-scene-2d">2D MAP</button>
        </div>

        <!-- Token setup if no Cesium token -->
        <div id="wv-token-setup" style="display:none; padding:8px;">
          <div class="wv-panel-header" style="margin-bottom:6px"><span class="wv-panel-title">CESIUM TOKEN</span></div>
          <input id="wv-cesium-input" type="password" placeholder="Paste Cesium Ion token…"
            style="width:100%;background:transparent;border:1px solid var(--wv-panel-border);color:var(--wv-text);font-family:var(--wv-font);font-size:9px;padding:5px;letter-spacing:0.05em;margin-bottom:4px;box-sizing:border-box;">
          <button id="wv-cesium-save"
            style="width:100%;background:rgba(0,255,65,0.1);border:1px solid rgba(0,255,65,0.4);color:#00ff41;font-family:var(--wv-font);font-size:9px;letter-spacing:0.12em;padding:5px;cursor:pointer;">
            SAVE &amp; INIT GLOBE
          </button>
          <div style="margin-top:6px;font-size:8px;color:rgba(0,255,65,0.35);letter-spacing:0.06em;line-height:1.4;">
            Free token at ion.cesium.com<br>Required for 3D globe rendering.
          </div>
        </div>

        <div class="wv-panel-header" style="margin-top:12px"><span class="wv-panel-title">DISPLAY MODE</span></div>
        <div class="wv-mode-grid">
          <button class="wv-mode-btn active" data-mode="normal">NORMAL</button>
          <button class="wv-mode-btn" data-mode="nvg">NVG</button>
          <button class="wv-mode-btn" data-mode="flir">FLIR</button>
          <button class="wv-mode-btn" data-mode="crt">CRT</button>
        </div>

        <div class="wv-panel-header" style="margin-top:12px"><span class="wv-panel-title">PRESETS</span></div>
        <div class="wv-preset-grid">
          <button class="wv-preset-btn" data-preset="globe">GLOBE</button>
          <button class="wv-preset-btn active" data-preset="middle-east">MID EAST</button>
          <button class="wv-preset-btn" data-preset="us">US / DC</button>
          <button class="wv-preset-btn" data-preset="europe">EUROPE</button>
          <button class="wv-preset-btn" data-preset="china">CHINA</button>
          <button class="wv-preset-btn" data-preset="russia">RUSSIA</button>
          <button class="wv-preset-btn" data-preset="hormuz">HORMUZ</button>
          <button class="wv-preset-btn" data-preset="little-st-james">J.ISLE</button>
        </div>

        <div class="wv-panel-header" style="margin-top:12px"><span class="wv-panel-title">CITIES</span></div>
        <div class="wv-preset-grid wv-cities-grid">
          <button class="wv-preset-btn" data-preset="new-york">NYC</button>
          <button class="wv-preset-btn" data-preset="washington">DC</button>
          <button class="wv-preset-btn" data-preset="chicago">CHICAGO</button>
          <button class="wv-preset-btn" data-preset="los-angeles">LA</button>
          <button class="wv-preset-btn" data-preset="london">LONDON</button>
          <button class="wv-preset-btn" data-preset="paris">PARIS</button>
          <button class="wv-preset-btn" data-preset="berlin">BERLIN</button>
          <button class="wv-preset-btn" data-preset="kyiv">KYIV</button>
          <button class="wv-preset-btn" data-preset="moscow">MOSCOW</button>
          <button class="wv-preset-btn" data-preset="istanbul">ISTANBUL</button>
          <button class="wv-preset-btn" data-preset="tel-aviv">TEL AVIV</button>
          <button class="wv-preset-btn" data-preset="tehran">TEHRAN</button>
          <button class="wv-preset-btn" data-preset="baghdad">BAGHDAD</button>
          <button class="wv-preset-btn" data-preset="riyadh">RIYADH</button>
          <button class="wv-preset-btn" data-preset="dubai">DUBAI</button>
          <button class="wv-preset-btn" data-preset="cairo">CAIRO</button>
          <button class="wv-preset-btn" data-preset="beijing">BEIJING</button>
          <button class="wv-preset-btn" data-preset="pyongyang">P.YANG</button>
          <button class="wv-preset-btn" data-preset="seoul">SEOUL</button>
          <button class="wv-preset-btn" data-preset="tokyo">TOKYO</button>
          <button class="wv-preset-btn" data-preset="taipei">TAIPEI</button>
          <button class="wv-preset-btn" data-preset="singapore">SINGAPORE</button>
          <button class="wv-preset-btn" data-preset="mumbai">MUMBAI</button>
          <button class="wv-preset-btn" data-preset="sydney">SYDNEY</button>
        </div>

        <div class="wv-panel-header" style="margin-top:12px"><span class="wv-panel-title">INTEL FEED</span></div>
        <div id="wv-intel-panel">
          <div class="wv-intel-placeholder">
            <span>[ SELECT OBJECT ]</span>
            <span>Click any tracked</span>
            <span>entity to inspect</span>
          </div>
        </div>
      </aside>

      <!-- ── BOTTOM STATUS BAR ── -->
      <footer id="wv-statusbar">
        <span class="wv-sb-item">MODE: <span id="wv-sb-mode" class="wv-sb-val">NORMAL</span></span>
        <span class="wv-sb-sep">///</span>
        <span class="wv-sb-item">LAYERS: <span id="wv-sb-layers" class="wv-sb-val">0</span> ACTIVE</span>
        <span class="wv-sb-sep">///</span>
        <span class="wv-sb-item">OBJECTS: <span id="wv-sb-objects" class="wv-sb-val">0</span> TRACKED</span>
        <span class="wv-sb-sep">///</span>
        <span class="wv-sb-item" id="wv-sb-status">SYSTEM READY</span>
      </footer>
    </div>
  `;

  // ── Boot sequence ───────────────────────────────────────
  setTimeout(bootWorldView, 100);
}

async function bootWorldView() {
  // Load and normalise WorldView config tokens
  let cfg = {};
  try { cfg = (await window.yunisa.config.get()) || {}; } catch(_) {}
  const cesiumToken = cfg.CESIUM_TOKEN || '';

  // Show token setup if no Cesium token
  if (!cesiumToken || cesiumToken === 'YOUR_CESIUM_ION_TOKEN_HERE') {
    document.getElementById('wv-token-setup').style.display = 'block';
    document.getElementById('wv-cesium-save')?.addEventListener('click', async () => {
      const val = document.getElementById('wv-cesium-input')?.value?.trim();
      if (!val) return;
      await window.yunisa.config.set('CESIUM_TOKEN', val);
      document.getElementById('wv-token-setup').style.display = 'none';
      initCesium(val, cfg);
    });
    return;
  }

  initCesium(cesiumToken, cfg);
}

function initCesium(cesiumToken, cfg) {
  if (typeof Cesium === 'undefined') {
    document.getElementById('wv-sb-status').textContent = 'ERROR: Cesium.js not loaded';
    return;
  }

  // Setup global WV namespace matching WorldView's module conventions
  window.WV = window.WV || {};
  window.WV.config = {
    CESIUM_TOKEN:         cesiumToken,
    AISSTREAM_KEY:        cfg.AISSTREAM_KEY        || '',
    OPENSKY_USER:         cfg.OPENSKY_USER         || '',
    OPENSKY_PASS:         cfg.OPENSKY_PASS         || '',
    SENTINEL_INSTANCE_ID: cfg.SENTINEL_INSTANCE_ID || '',
  };

  // Remap all WorldView DOM IDs to wv-prefixed equivalents
  // (so they don't conflict with YUNISA's own IDs)
  patchWVModulesForYUNISA();

  Cesium.Ion.defaultAccessToken = cesiumToken;

  try {
    const viewer = new Cesium.Viewer('wv-cesiumContainer', {
      animation:           false,
      baseLayerPicker:     false,
      fullscreenButton:    false,
      geocoder:            false,
      homeButton:          false,
      infoBox:             false,
      navigationHelpButton:false,
      sceneModePicker:     false,
      selectionIndicator:  false,
      timeline:            false,
      shadows:             false,
      terrainProvider:     undefined,
    });

    // Store viewer globally for layer modules
    window.WV.viewer = viewer;

    // Boot WorldView modules
    WV.Presets.init(viewer);
    WV.Controls.init(viewer);

    // Clock
    startClock();
    startTzStrip();
    startCoordTracker(viewer);

    // Fly to Middle East (default preset)
    WV.Presets.flyTo('middle-east');

    document.getElementById('wv-sb-status').textContent = 'GLOBE ONLINE';
  } catch(e) {
    console.error('[WorldView] Cesium init failed:', e);
    document.getElementById('wv-sb-status').textContent = 'CESIUM INIT FAILED — CHECK TOKEN';
  }
}

function patchWVModulesForYUNISA() {
  // WorldView modules use bare IDs like "toggle-satellites".
  // We serve them in the wv- namespace. Patch WV.Controls to use our IDs.
  const orig = document.getElementById.bind(document);
  // Intercept getElementById so layers can still find their elements
  // using old un-prefixed IDs by transparently looking for wv- versions
  const WV_ID_MAP = {
    'badge-active': 'wv-badge-active',
    'total-objects': 'wv-total-objects',
    'statusbar': 'wv-sb-status', // status text only
    'intel-panel': 'wv-intel-panel',
    'sentinel-controls': 'wv-sentinel-controls',
    'sen-date': 'wv-sen-date',
    'coord-lat': 'wv-coord-lat',
    'coord-lon': 'wv-coord-lon',
    'coord-alt': 'wv-coord-alt',
    'sb-mode': 'wv-sb-mode',
    'sb-layers': 'wv-sb-layers',
    'sb-objects': 'wv-sb-objects',
    'sb-status': 'wv-sb-status',
    'cesiumContainer': 'wv-cesiumContainer',
  };
  // Add count / toggle mappings
  ['satellites','flights','military','maritime','jamming','seismic','weather','traffic','cctv','sentinel','ports'].forEach(l => {
    WV_ID_MAP[`count-${l}`]  = `wv-count-${l}`;
    WV_ID_MAP[`toggle-${l}`] = `wv-toggle-${l}`;
  });
  // Patch WV.Controls.updateCount etc. to look in our namespace
  window._WV_ID_MAP = WV_ID_MAP;

  const _origGetEl = Document.prototype.getElementById;
  Document.prototype.getElementById = function(id) {
    const mapped = window._WV_ID_MAP?.[id];
    if (mapped) {
      const found = _origGetEl.call(this, mapped);
      if (found) return found;
    }
    return _origGetEl.call(this, id);
  };
}

// ── Clock & timezone strip ──────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getUTCHours()).padStart(2,'0');
    const m = String(now.getUTCMinutes()).padStart(2,'0');
    const s = String(now.getUTCSeconds()).padStart(2,'0');
    const el = document.getElementById('wv-clock');
    if (el) el.textContent = `${h}:${m}:${s} UTC`;
  }
  tick();
  setInterval(tick, 1000);
}

function startTzStrip() {
  function update() {
    document.querySelectorAll('#wv-tz-strip .wv-tz-item').forEach(item => {
      const tz = item.dataset.tz;
      const el = item.querySelector('.wv-tz-time');
      if (el && tz) {
        try {
          el.textContent = new Date().toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
          });
        } catch(_) {}
      }
    });
  }
  update();
  setInterval(update, 30000);
}

function startCoordTracker(viewer) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(movement => {
    const ray = viewer.camera.getPickRay(movement.endPosition);
    if (!ray) return;
    const pos = viewer.scene.globe.pick(ray, viewer.scene);
    if (!pos) return;
    const carto = Cesium.Cartographic.fromCartesian(pos);
    const lat = Cesium.Math.toDegrees(carto.latitude).toFixed(3);
    const lon = Cesium.Math.toDegrees(carto.longitude).toFixed(3);
    const alt = (viewer.camera.positionCartographic.height / 1000).toFixed(0);
    const latEl = document.getElementById('wv-coord-lat');
    const lonEl = document.getElementById('wv-coord-lon');
    const altEl = document.getElementById('wv-coord-alt');
    if (latEl) latEl.textContent = lat;
    if (lonEl) lonEl.textContent = lon;
    if (altEl) altEl.textContent = alt;
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}
