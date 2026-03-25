// layers/cctv.js â€” Public CCTV camera feeds
// TfL JamCam API: ~1000 real London cameras, free, no key
// Click any camera: live snapshot loads in the INTEL FEED panel

window.WV = window.WV || {};
WV.layers = WV.layers || {};

WV.layers.cctv = (function () {

  var pointCollection = null;
  var TFL_API   = 'https://api.tfl.gov.uk/Place/Type/JamCam';
  var AMOS_URL  = 'https://gist.githubusercontent.com/golanlevin/5e752579c781b624e52261a2c3feeadb/raw/amos_cams_7800.csv';

  // Fallback hardcoded cameras (used if all APIs fail)
  var FALLBACK = [
    { name: 'Austin â€” 6th & Congress',    lat: 30.2672, lon: -97.7431, city: 'Austin TX',
      img: 'https://cctv.austintexas.gov/cameras/media/cam030.jpg' },
    { name: 'Austin â€” IH-35 & Oltorf',     lat: 30.2369, lon: -97.7395, city: 'Austin TX',
      img: 'https://cctv.austintexas.gov/cameras/media/cam002.jpg' },
    { name: 'NYC â€” Times Square Cam',      lat: 40.7580, lon: -73.9855, city: 'New York',
      img: 'https://webcams.nyctmc.org/api/cameras/a81bc2f3-0e68-4f41-b862-2d5d6ad1bc54/image' },
    { name: 'NYC â€” Holland Tunnel North',  lat: 40.7267, lon: -74.0094, city: 'New York',
      img: 'https://webcams.nyctmc.org/api/cameras/c0f59f1e-9e2f-4d1a-8e9a-6c8e7a3b2d1f/image' },
  ];

  // Build canvas camera pin icon
  function makePinCanvas() {
    var c = document.createElement('canvas');
    c.width = c.height = 18;
    var ctx = c.getContext('2d');
    ctx.beginPath(); ctx.arc(9, 9, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ff41'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(9, 9, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,255,65,0.12)'; ctx.fill();
    ctx.beginPath(); ctx.arc(9, 9, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff41'; ctx.fill();
    return c;
  }

  function buildCollection(viewer, cameras) {
    if (pointCollection) viewer.scene.primitives.remove(pointCollection);
    pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());

    var pin = makePinCanvas();
    cameras.forEach(function (cam) {
      pointCollection.add({
        position:  Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 30),
        color:     Cesium.Color.fromCssColorString('#00ff41').withAlpha(0.9),
        pixelSize: 5,
        id: {
          _wvType: 'cctv',
          _wvImg:  cam.img,
          _wvMeta: [
            { key: 'TYPE',  val: 'CCTV CAMERA' },
            { key: 'NAME',  val: cam.name },
            { key: 'CITY',  val: cam.city || 'London' },
            { key: '_CAM_IMG', val: cam.img },
          ],
        },
      });
    });

    WV.Controls.updateCount('cctv', cameras.length);
    WV.Controls.setStatus('CCTV: ' + cameras.length + ' feeds â€” click pin for live snapshot');
    viewer.scene.requestRender();
  }

  function parseTflCameras(data) {
    return data
      .filter(function (c) { return c.lat && c.lon; })
      .map(function (c) {
        var imgUrl = '';
        var props = c.additionalProperties || [];
        for (var i = 0; i < props.length; i++) {
          if (props[i].key === 'imageUrl') { imgUrl = props[i].value; break; }
        }
        return {
          name: c.commonName || c.id,
          lat:  c.lat,
          lon:  c.lon,
          city: 'London',
          img:  imgUrl,
        };
      })
      .filter(function (c) { return c.img; });
  }

  // Parse amos_cams_7800.csv â€” columns: id,name,url,lat,lon,width,height,hash
  function parseAmosCsv(text) {
    var lines = text.split('\n');
    var cams  = [];
    for (var i = 1; i < lines.length; i++) {   // skip header
      var cols = lines[i].split(',');
      if (cols.length < 5) continue;
      var lat = parseFloat(cols[3]);
      var lon = parseFloat(cols[4]);
      var url = (cols[2] || '').trim();
      if (isNaN(lat) || isNaN(lon) || !url) continue;
      cams.push({
        name: (cols[1] || '').trim() || 'CAM ' + cols[0],
        lat:  lat,
        lon:  lon,
        city: 'Global',
        img:  url,
      });
    }
    return cams;
  }

  function fetchAmos() {
    return fetch(AMOS_URL)
      .then(function (r) { return r.ok ? r.text() : Promise.reject('AMOS ' + r.status); })
      .then(parseAmosCsv)
      .catch(function () { return []; });
  }

  function enable(viewer) {
    WV.Controls.setStatus('CCTV: Fetching camera directories...');

    var tflPromise = fetch(TFL_API)
      .then(function (r) {
        if (!r.ok) throw new Error('TfL ' + r.status);
        return r.json();
      })
      .then(parseTflCameras)
      .catch(function () { return []; });

    return Promise.all([tflPromise, fetchAmos()])
      .then(function (results) {
        var cameras = results[0].concat(results[1]);
        if (!cameras.length) cameras = FALLBACK;
        buildCollection(viewer, cameras);
      });
  }

  function disable(viewer) {
    if (pointCollection) { viewer.scene.primitives.remove(pointCollection); pointCollection = null; }
    WV.Controls.updateCount('cctv', 0);
    viewer.scene.requestRender();
  }

  return { enable: enable, disable: disable };

}());

