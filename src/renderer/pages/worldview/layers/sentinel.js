// layers/sentinel.js â€” Daily satellite imagery via NASA GIBS (no auth required)
//
// Source: NASA Global Imagery Browse Services (GIBS)
// Free, CORS-enabled, no API key needed.
// Data: MODIS Terra (250m/day) + VIIRS/Suomi-NPP (375m/day)
//
// What it does: overlays real recent satellite photography on the globe.
// Fly to any region, toggle on â€” the globe skin becomes actual imagery from orbit.
// Switch modes to see different spectral composites:
//   OPT   â€” True colour (what a camera sees)
//   NIR   â€” Near-infrared false colour (vegetation = red, urban = cyan)
//   SWIR  â€” Shortwave infrared (fire detection, burn scars, smoke)
//   VIIRS â€” Suomi-NPP sensor (375m, slightly different overpass time)

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.sentinel = (function () {

  var imageryLayer   = null;
  var activeMode     = 'OPT';
  var activeDate     = null;   // null = auto (3 days ago â€” GIBS processing lag)
  var _controlsBound = false;
  var _enabled       = false;

  // NASA GIBS WMS endpoint (EPSG:4326 â€” matches Cesium geographic tiling)
  var WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

  // Confirmed GIBS layer identifiers
  var MODES = {
    'OPT':  'MODIS_Terra_CorrectedReflectance_TrueColor',   // 250m, daily
    'NIR':  'MODIS_Terra_CorrectedReflectance_Bands721',    // 500m, NIR false colour
    'SWIR': 'MODIS_Terra_CorrectedReflectance_Bands367',    // 500m, SWIR false colour
    'VIIRS':'VIIRS_SNPP_CorrectedReflectance_TrueColor',    // 375m, daily
  };

  function _dateStr(d) {
    return d.toISOString().slice(0, 10);
  }

  // Default to 3 days ago â€” GIBS data has a 1-3 day processing pipeline
  function _getDefaultDate() {
    return _dateStr(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  }

  function _buildLayer(viewer) {
    var date  = activeDate || _getDefaultDate();
    var layer = MODES[activeMode] || MODES['OPT'];

    var il = viewer.imageryLayers.addImageryProvider(
      new Cesium.WebMapServiceImageryProvider({
        url:    WMS_URL,
        layers: layer,
        parameters: {
          TIME:        date,
          FORMAT:      'image/jpeg',
          TRANSPARENT: false,
        },
        tileWidth:    512,
        tileHeight:   512,
        minimumLevel: 1,
        maximumLevel: 9,    // MODIS max useful detail ~250m â‰ˆ zoom 9
        credit:       'NASA GIBS / MODIS Terra',
      })
    );
    il.alpha = 0.92;
    return il;
  }

  function _rebuild(viewer) {
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); imageryLayer = null; }
    if (!_enabled) return;
    imageryLayer = _buildLayer(viewer);
    var date = activeDate || _getDefaultDate();
    WV.Controls.setStatus('IMINT: ' + activeMode + ' Â· ' + date);
    WV.Controls.updateCount('sentinel', activeMode);
    viewer.scene.requestRender();
  }

  function _bindControls(viewer) {
    if (_controlsBound) return;
    _controlsBound = true;

    var btns = document.querySelectorAll('.sen-mode-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeMode = btn.getAttribute('data-sen-mode');
        if (_enabled) _rebuild(viewer);
      });
    });

    var dateInput = document.getElementById('sen-date');
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        activeDate = dateInput.value || null;
        if (_enabled) _rebuild(viewer);
      });
    }

    var clearBtn = document.getElementById('sen-date-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (dateInput) dateInput.value = '';
        activeDate = null;
        if (_enabled) _rebuild(viewer);
      });
    }
  }

  function _showControls() {
    var el = document.getElementById('sentinel-controls');
    if (el) el.style.display = 'block';
  }

  function _hideControls() {
    var el = document.getElementById('sentinel-controls');
    if (el) el.style.display = 'none';
  }

  function enable(viewer) {
    _enabled = true;
    _bindControls(viewer);
    _showControls();
    imageryLayer = _buildLayer(viewer);
    var date = activeDate || _getDefaultDate();
    WV.Controls.setStatus('IMINT: ' + activeMode + ' Â· ' + date);
    WV.Controls.updateCount('sentinel', activeMode);
    viewer.scene.requestRender();
    return Promise.resolve();
  }

  function disable(viewer) {
    _enabled = false;
    _hideControls();
    if (imageryLayer) { viewer.imageryLayers.remove(imageryLayer, true); imageryLayer = null; }
    WV.Controls.updateCount('sentinel', 'â€”');
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());

