// layers/traffic.js â€” Street traffic particle simulation via OpenStreetMap Overpass API

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.traffic = (function () {

  var billboardCollection = null;
  var particles           = [];
  var segments            = [];
  var animTimer           = null;
  var enabled             = false;
  var PARTICLE_COUNT      = 400;

  var MAX_ALT_METERS = 400000;

  // Only overpass-api.de and openstreetmap.fr have browser-friendly CORS headers
  var OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.openstreetmap.fr/api/interpreter',
  ];

  // â”€â”€ CAR ICON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function _makeCar() {
    var cw = 8, ch = 13;
    var c  = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    var r   = 2;

    ctx.fillStyle = '#ffe033';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(cw - r, 0);
    ctx.arcTo(cw, 0, cw, r, r);
    ctx.lineTo(cw, ch - r);
    ctx.arcTo(cw, ch, cw - r, ch, r);
    ctx.lineTo(r, ch);
    ctx.arcTo(0, ch, 0, ch - r, r);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(40,140,220,0.70)';
    ctx.fillRect(1, 1, cw - 2, 3);
    ctx.fillRect(1, ch - 4, cw - 2, 3);

    return c;
  }

  var _carImg = _makeCar();

  // "out geom;" returns geometry inline on each way â€” no node expansion needed,
  // dramatically faster than (._;>;);out body;
  function buildQuery(s, w, n, e) {
    return '[out:json][timeout:18];'
      + 'way["highway"~"motorway|trunk|primary"]'
      + '(' + s + ',' + w + ',' + n + ',' + e + ');'
      + 'out geom;';
  }

  function queryOverpass(url, query) {
    return fetch(url, {
      method:  'POST',
      body:    'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function queryWithFallback(query) {
    var chain = Promise.reject(new Error('init'));
    OVERPASS_URLS.forEach(function (url) {
      chain = chain.catch(function () { return queryOverpass(url, query); });
    });
    return chain;
  }

  // "out geom;" includes geometry[] array directly on each way element
  function parseRoads(data) {
    var segs = [];
    (data.elements || []).forEach(function (el) {
      if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
        for (var i = 0; i < el.geometry.length - 1; i++) {
          var a = el.geometry[i];
          var b = el.geometry[i + 1];
          if (a && b && a.lat !== null && b.lat !== null) {
            segs.push([{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }]);
          }
        }
      }
    });
    return segs;
  }

  function spawnParticles(segs, count) {
    var pts = [];
    for (var i = 0; i < count; i++) {
      pts.push({
        seg:   segs[Math.floor(Math.random() * segs.length)],
        t:     Math.random(),
        speed: 0.0003 + Math.random() * 0.0005,
      });
    }
    return pts;
  }

  function particlePos(p) {
    var a = p.seg[0], b = p.seg[1];
    return {
      lon: a.lon + (b.lon - a.lon) * p.t,
      lat: a.lat + (b.lat - a.lat) * p.t,
      alt: 30,
    };
  }

  function tick() {
    if (!billboardCollection || particles.length === 0 || segments.length === 0) return;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.t += p.speed;
      if (p.t > 1) {
        p.t   = 0;
        p.seg = segments[Math.floor(Math.random() * segments.length)];
      }
      if (!p.seg) continue;
      var pos = particlePos(p);
      billboardCollection.get(i).position =
        Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
    }
    if (WV.viewer) WV.viewer.scene.requestRender();
  }

  function getCameraBbox() {
    if (!WV.viewer) return null;
    var cart = WV.viewer.camera.positionCartographic;
    if (!cart) return null;
    var lat = Cesium.Math.toDegrees(cart.latitude);
    var lon = Cesium.Math.toDegrees(cart.longitude);
    var r   = 0.3;  // Â±0.3Â° (~65km) â€” small enough for fast Overpass response
    return { s: lat - r, w: lon - r, n: lat + r, e: lon + r };
  }

  function getCameraAlt() {
    if (!WV.viewer) return Infinity;
    var cart = WV.viewer.camera.positionCartographic;
    return cart ? cart.height : Infinity;
  }

  function enable(viewer) {
    enabled = true;

    var alt = getCameraAlt();
    if (alt > MAX_ALT_METERS) {
      WV.Controls.setStatus('TRAFFIC: zoom in to a city first (< 400 km)');
      WV.Controls.updateCount('traffic', 0);
      return Promise.resolve();
    }

    var bbox = getCameraBbox();
    if (!bbox) return Promise.reject(new Error('No camera position'));

    WV.Controls.setStatus('TRAFFIC: Fetching road network...');

    return queryWithFallback(buildQuery(bbox.s, bbox.w, bbox.n, bbox.e))
      .then(function (data) {
        if (!enabled) return;

        segments = parseRoads(data);
        if (segments.length === 0) {
          WV.Controls.setStatus('TRAFFIC: no roads found in view');
          return;
        }

        particles           = spawnParticles(segments, PARTICLE_COUNT);
        billboardCollection = viewer.scene.primitives.add(
          new Cesium.BillboardCollection()
        );

        particles.forEach(function (p) {
          var pos = particlePos(p);
          billboardCollection.add({
            position:         Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt),
            image:            _carImg,
            width:            8,
            height:           13,
            verticalOrigin:   Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          });
        });

        WV.Controls.updateCount('traffic', particles.length);
        WV.Controls.setStatus('TRAFFIC: ' + segments.length + ' segments Â· ' + particles.length + ' vehicles');
        viewer.scene.requestRender();

        animTimer = setInterval(tick, 50);
      })
      .catch(function (err) {
        console.error('traffic layer:', err);
        WV.Controls.setStatus('TRAFFIC: Overpass unavailable â€” try again shortly');
      });
  }

  function disable(viewer) {
    enabled = false;
    if (animTimer)           { clearInterval(animTimer); animTimer = null; }
    if (billboardCollection) { viewer.scene.primitives.remove(billboardCollection); billboardCollection = null; }
    particles = [];
    segments  = [];
    WV.Controls.updateCount('traffic', 0);
  }

  return { enable: enable, disable: disable };

}());

