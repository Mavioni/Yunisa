// layers/flights.js â€” OpenSky Network live commercial flights
// NOTE: Basic Auth via Authorization header causes CORS preflight block from browser.
// Anonymous API returns ~400 aircraft globally â€” sufficient for demo.

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.flights = (function () {

  var pointCollection = null;
  var labelCollection = null;
  var updateTimer     = null;
  var enabled         = false;

  var posHistory  = {};
  var trackedIcao = null;
  var pathEntity  = null;
  var MAX_HIST    = 30;
  var FOLLOW_ALT  = 280000;

  var BASE_URL   = 'https://opensky-network.org/api';
  var REFRESH_MS = 20000;

  var IDX = {
    icao24: 0, callsign: 1, origin: 2,
    lon: 5, lat: 6, baro_alt: 7, on_ground: 8,
    velocity: 9, heading: 10, squawk: 14,
  };

  // â”€â”€ PLANE ICON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Top-down aircraft silhouette, pointing up (north = 0Â°).
  // Billboard rotation property applies heading offset per-aircraft.
  function _makePlane(color, sz) {
    var c   = document.createElement('canvas');
    c.width = sz; c.height = sz;
    var ctx = c.getContext('2d');
    var mx  = sz / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx,             sz * 0.05);  // nose
    ctx.lineTo(mx + sz * 0.12, sz * 0.38);  // right fuselage
    ctx.lineTo(sz * 0.92,      sz * 0.50);  // right wingtip
    ctx.lineTo(mx + sz * 0.12, sz * 0.62);  // right wingâ€“tail join
    ctx.lineTo(mx + sz * 0.18, sz * 0.92);  // right tail tip
    ctx.lineTo(mx,             sz * 0.78);  // center tail
    ctx.lineTo(mx - sz * 0.18, sz * 0.92);  // left tail tip
    ctx.lineTo(mx - sz * 0.12, sz * 0.62);  // left wingâ€“tail join
    ctx.lineTo(sz * 0.08,      sz * 0.50);  // left wingtip
    ctx.lineTo(mx - sz * 0.12, sz * 0.38);  // left fuselage
    ctx.closePath();
    ctx.fill();
    return c;
  }

  var _planeImg        = _makePlane('rgba(255,255,255,0.85)', 16);
  var _planeImgTracked = _makePlane('#ffffff', 22);

  // â”€â”€ PATH DRAWING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function drawPath(viewer, points) {
    if (pathEntity) { viewer.entities.remove(pathEntity); pathEntity = null; }
    if (!points || points.length < 2) return;
    pathEntity = viewer.entities.add({
      polyline: {
        positions: points.map(function (p) {
          return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.alt || 0) + 200);
        }),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color:     Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.80),
          dashLength: 16,
          gapColor:  Cesium.Color.TRANSPARENT,
        }),
      },
    });
    viewer.scene.requestRender();
  }

  // â”€â”€ OPENSKY TRACK ENDPOINT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function fetchTrack(icao24) {
    return fetch(BASE_URL + '/tracks/all?icao24=' + icao24 + '&time=0')
      .then(function (r) {
        if (!r.ok) throw new Error('track ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.path || data.path.length < 2) return null;
        return data.path
          .filter(function (wp) { return wp[1] && wp[2]; })
          .map(function (wp) { return { lat: wp[1], lon: wp[2], alt: wp[3] || 0 }; });
      });
  }

  // â”€â”€ SELECT / TRACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function select(icao24) {
    trackedIcao = icao24;
    var v = WV.viewer;
    if (!v) return;

    var hist = posHistory[icao24];
    if (hist && hist.length > 0) {
      var p = hist[hist.length - 1];
      v.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt || 0), 0),
        { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), FOLLOW_ALT), duration: 1.8 }
      );
    }

    WV.Controls.setStatus('FETCHING FLIGHT TRACK...');
    fetchTrack(icao24)
      .then(function (track) {
        var points = (track && track.length >= 2) ? track : (posHistory[icao24] || []);
        drawPath(v, points);
        WV.Controls.setStatus('TRACKING: ' + icao24.toUpperCase() + ' â€” CLICK GLOBE TO RELEASE');
      })
      .catch(function () {
        drawPath(v, posHistory[icao24] || []);
        WV.Controls.setStatus('TRACKING: ' + icao24.toUpperCase() + ' â€” CLICK GLOBE TO RELEASE');
      });
  }

  function clearTracking() {
    trackedIcao = null;
    if (pathEntity && WV.viewer) { WV.viewer.entities.remove(pathEntity); pathEntity = null; }
  }

  // â”€â”€ FETCH + RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function fetchAndRender(viewer) {
    if (!enabled) return Promise.resolve();

    // No Authorization header â€” avoids CORS preflight block from browser
    return fetch(BASE_URL + '/states/all')
      .then(function (r) {
        if (!r.ok) throw new Error('OpenSky ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!enabled) return;

        var states = (data.states || []).filter(function (s) {
          return s[IDX.lon] !== null && s[IDX.lat] !== null &&
                 s[IDX.baro_alt] !== null && !s[IDX.on_ground];
        });

        states.forEach(function (s) {
          var icao = s[IDX.icao24];
          if (!icao) return;
          if (!posHistory[icao]) posHistory[icao] = [];
          posHistory[icao].push({ lon: s[IDX.lon], lat: s[IDX.lat], alt: s[IDX.baro_alt] || 0 });
          if (posHistory[icao].length > MAX_HIST) posHistory[icao].shift();
        });

        if (pointCollection) viewer.scene.primitives.remove(pointCollection);
        if (labelCollection) viewer.scene.primitives.remove(labelCollection);
        pointCollection = viewer.scene.primitives.add(new Cesium.BillboardCollection());
        labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

        states.forEach(function (s) {
          var icao      = s[IDX.icao24];
          var isTracked = (icao === trackedIcao);
          var hdg       = s[IDX.heading];
          pointCollection.add({
            position: Cesium.Cartesian3.fromDegrees(s[IDX.lon], s[IDX.lat], (s[IDX.baro_alt] || 0) + 100),
            image:    isTracked ? _planeImgTracked : _planeImg,
            // rotation is CCW in radians; heading is CW degrees from north â†’ negate
            rotation: hdg !== null ? -Cesium.Math.toRadians(hdg) : 0,
            scale:    1.0,
            id: {
              _wvType: 'flight',
              _wvIcao: icao,
              _wvMeta: [
                { key: 'TYPE',     val: 'COMM FLIGHT' },
                { key: 'CALLSIGN', val: (s[IDX.callsign] || '').trim() || icao },
                { key: 'ICAO24',   val: icao },
                { key: 'ORIGIN',   val: s[IDX.origin] || '---' },
                { key: 'ALT',      val: Math.round(s[IDX.baro_alt] || 0) + ' m' },
                { key: 'SPEED',    val: s[IDX.velocity] ? Math.round(s[IDX.velocity]) + ' m/s' : '---' },
                { key: 'HEADING',  val: s[IDX.heading]  ? Math.round(s[IDX.heading])  + 'Â°'   : '---' },
                { key: 'SQUAWK',   val: s[IDX.squawk] || '---' },
              ],
            },
          });
          var callsign = (s[IDX.callsign] || '').trim() || s[IDX.icao24];
          labelCollection.add({
            position: Cesium.Cartesian3.fromDegrees(s[IDX.lon], s[IDX.lat], (s[IDX.baro_alt] || 0) + 100),
            text:     callsign,
            font:     '9px "Courier New"',
            fillColor:    Cesium.Color.fromCssColorString('#00ccff').withAlpha(0.92),
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
            outlineWidth: 2,
            style:              Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset:        new Cesium.Cartesian2(10, -6),
            horizontalOrigin:   Cesium.HorizontalOrigin.LEFT,
            verticalOrigin:     Cesium.VerticalOrigin.BOTTOM,
            scaleByDistance:        new Cesium.NearFarScalar(150000, 1.0, 3000000, 0.0),
            translucencyByDistance: new Cesium.NearFarScalar(150000, 1.0, 2500000, 0.0),
          });
        });

        WV.Controls.updateCount('flights', states.length);
        WV.Controls.setStatus('LIVE: ' + states.length + ' flights tracked');

        if (trackedIcao && posHistory[trackedIcao]) {
          var hist = posHistory[trackedIcao];
          var p = hist[hist.length - 1];
          if (p) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, FOLLOW_ALT),
              duration: 3.5,
            });
          }
        }

        viewer.scene.requestRender();
      })
      .catch(function (err) {
        console.error('flights:', err);
        WV.Controls.setStatus('FLIGHTS: OpenSky unreachable â€” retrying in 20s');
      });
  }

  function enable(viewer) {
    enabled = true;
    WV.Controls.setStatus('FETCHING FLIGHT DATA...');
    return fetchAndRender(viewer).then(function () {
      if (enabled) updateTimer = setInterval(function () { fetchAndRender(viewer); }, REFRESH_MS);
    });
  }

  function disable(viewer) {
    enabled = false;
    clearTracking();
    if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
    if (labelCollection) { viewer.scene.primitives.remove(labelCollection); labelCollection = null; }
    if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
    posHistory = {};
    WV.Controls.updateCount('flights', 0);
  }

  return { enable: enable, disable: disable, select: select, clearTracking: clearTracking };

}());

