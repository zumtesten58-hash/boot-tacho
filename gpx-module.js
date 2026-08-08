(function() {
  "use strict";

  if (!window.BootNav) return;

  // Modul-Status
  let isRecording = false;
  let recordedPoints = [];
  let recordStartTime = null;
  let totalDistanceMeters = 0;

  let loadedTrack = null; // { name, points: [{lat, lon, ele}] }

  // MapLibre Layer-IDs
  const REC_SOURCE_ID = 'bn-gpx-rec-source';
  const REC_LAYER_ID = 'bn-gpx-rec-layer';
  const LOADED_SOURCE_ID = 'bn-gpx-loaded-source';
  const LOADED_LAYER_ID = 'bn-gpx-loaded-layer';

  // Haversine-Formel zur Distanzberechnung in Metern
  function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Karten-Layer für Live-Aufzeichnung und importierte Route initialisieren
  function initMapLayers() {
    const map = BootNav.getMap();
    if (!map) return;

    // Aufgezeichnete Route (Rote durchgezogene Linie)
    if (!map.getSource(REC_SOURCE_ID)) {
      map.addSource(REC_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
      });
      map.addLayer({
        id: REC_LAYER_ID,
        type: 'line',
        source: REC_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ff5d5d', 'line-width': 4 }
      });
    }

    // Importierte Route zum Nachfahren (Blaue gestrichelte Linie)
    if (!map.getSource(LOADED_SOURCE_ID)) {
      map.addSource(LOADED_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
      });
      map.addLayer({
        id: LOADED_LAYER_ID,
        type: 'line',
        source: LOADED_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#4fb3ff', 'line-width': 4, 'line-dasharray': [2, 1] }
      });
    }
  }

  const map = BootNav.getMap();
  if (map.isStyleLoaded()) {
    initMapLayers();
  } else {
    map.on('style.load', initMapLayers);
  }

  // GPX-XML Generierung
  function generateGPX(points, trackName) {
    const isoTime = new Date().toISOString();
    let trkpts = '';

    points.forEach(p => {
      const timeIso = new Date(p.time).toISOString();
      const eleXml = (p.ele != null && !isNaN(p.ele)) ? `<ele>${p.ele}</ele>` : '';
      trkpts += `      <trkpt lat="${p.lat}" lon="${p.lon}">${eleXml}<time>${timeIso}</time></trkpt>\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BootNav Marine Navigation" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    <time>${isoTime}</time>
  </metadata>
  <trk>
    <name>${trackName}</name>
    <trkseg>
${trkpts}    </trkseg>
  </trk>
</gpx>`;
  }

  function downloadFile(filename, text) {
    const blob = new Blob([text], { type: 'application/gpx+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // GPX-Parser für importierte Dateien
  function parseGPX(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('Ungültiges GPX-Format');

    const nameNode = xml.querySelector('trk > name, rte > name, name');
    const trackName = nameNode ? nameNode.textContent : 'Importierte Route';

    const nodes = xml.querySelectorAll('trkpt, rtept, wpt');
    const points = [];

    nodes.forEach(node => {
      const lat = parseFloat(node.getAttribute('lat'));
      const lon = parseFloat(node.getAttribute('lon'));
      const eleNode = node.querySelector('ele');
      const ele = eleNode ? parseFloat(eleNode.textContent) : null;
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon, ele });
      }
    });

    return { name: trackName, points };
  }

  function updateRecordingMapLine() {
    const map = BootNav.getMap();
    if (!map || !map.getSource(REC_SOURCE_ID)) return;
    const coords = recordedPoints.map(p => [p.lon, p.lat]);
    map.getSource(REC_SOURCE_ID).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords }
    });
  }

  function updateLoadedMapLine() {
    const map = BootNav.getMap();
    if (!map || !map.getSource(LOADED_SOURCE_ID)) return;
    const coords = loadedTrack ? loadedTrack.points.map(p => [p.lon, p.lat]) : [];
    map.getSource(LOADED_SOURCE_ID).setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords }
    });
  }

  function zoomToLoadedTrack() {
    if (!loadedTrack || loadedTrack.points.length === 0) return;
    const map = BootNav.getMap();
    if (!map) return;

    const bounds = new maplibregl.LngLatBounds();
    loadedTrack.points.forEach(p => bounds.extend([p.lon, p.lat]));
    map.fitBounds(bounds, { padding: 40, duration: 600 });
  }

  // Overlay-Pille oben rechts auf der Karte
  function updateOverlayWidget() {
    let content = '';
    if (isRecording) {
      const distKm = (totalDistanceMeters / 1000).toFixed(2);
      content = `
        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" id="bn-gpx-btn">
          <span style="color:var(--bn-danger); animation:bn-pulse 1s infinite;">🔴</span>
          <strong>REC</strong>
          <span style="color:var(--bn-fg-dim); font-size:11px;">${distKm} km</span>
        </div>`;
    } else if (loadedTrack) {
      content = `
        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" id="bn-gpx-btn">
          <span style="color:var(--bn-info);">📍</span>
          <strong>Route aktiv</strong>
        </div>`;
    } else {
      BootNav.removeOverlayWidget('gpx-pill');
      return;
    }

    const pill = BootNav.addOverlayWidget('gpx-pill', content);
    if (pill) {
      const btn = pill.querySelector('#bn-gpx-btn');
      if (btn) btn.onclick = openGPXModal;
    }
  }

  // Modales Fenster zur Steuerung & Import/Export
  function openGPXModal() {
    const ptCount = recordedPoints.length;
    const distKm = (totalDistanceMeters / 1000).toFixed(2);

    let durationStr = '00:00:00';
    if (recordStartTime) {
      const diffSec = Math.floor((Date.now() - recordStartTime) / 1000);
      const hrs = String(Math.floor(diffSec / 3600)).padStart(2, '0');
      const mins = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
      const secs = String(diffSec % 60).padStart(2, '0');
      durationStr = `${hrs}:${mins}:${secs}`;
    }

    const loadedInfo = loadedTrack
      ? `<div style="background:rgba(79,179,255,0.1); border:1px solid var(--bn-info); padding:10px 12px; border-radius:var(--bn-radius-m); margin-bottom:12px;">
          <div style="font-weight:bold; color:var(--bn-info); font-size:12px;">🗺️ AKTIVE ROUTE (NACHFAHREN)</div>
          <div style="font-size:14px; font-weight:bold; margin-top:2px;">${loadedTrack.name}</div>
          <div style="font-size:11px; color:var(--bn-fg-dim);">${loadedTrack.points.length} Wegpunkte geladen</div>
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button id="bn-gpx-zoom-btn" style="flex:1; padding:6px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.05); color:var(--bn-fg); cursor:pointer; font-size:12px;">🎯 Auf Route zentrieren</button>
            <button id="bn-gpx-clear-btn" style="padding:6px 12px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-danger); background:rgba(255,93,93,0.1); color:var(--bn-danger); cursor:pointer; font-size:12px;">Entfernen</button>
          </div>
        </div>`
      : '';

    const modalHtml = `
      <div style="display:flex; flex-direction:column; gap:14px;">
        ${loadedInfo}

        <!-- Track-Aufzeichnung -->
        <div style="background:rgba(255,255,255,0.035); border:1px solid var(--bn-line); padding:14px; border-radius:var(--bn-radius-m);">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--bn-fg-faint); margin-bottom:10px;">
            📍 Track-Aufzeichnung (GPS-Recorder)
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center; margin-bottom:12px;">
            <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9.5px; color:var(--bn-fg-faint);">DISTANZ</div>
              <div style="font-size:15px; font-weight:bold; color:var(--bn-accent);">${distKm} km</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9.5px; color:var(--bn-fg-faint);">DAUER</div>
              <div style="font-size:15px; font-weight:bold;">${durationStr}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:8px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9.5px; color:var(--bn-fg-faint);">PUNKTE</div>
              <div style="font-size:15px; font-weight:bold;">${ptCount}</div>
            </div>
          </div>

          <div style="display:flex; gap:8px;">
            ${isRecording ? `
              <button id="bn-gpx-toggle-rec" style="flex:1; padding:10px; border-radius:var(--bn-radius-s); border:none; background:var(--bn-danger); color:#fff; font-weight:bold; cursor:pointer;">⏹️ Aufzeichnung Stoppen</button>
            ` : `
              <button id="bn-gpx-toggle-rec" style="flex:1; padding:10px; border-radius:var(--bn-radius-s); border:none; background:var(--bn-accent); color:#04211c; font-weight:bold; cursor:pointer;">▶️ Aufzeichnung Starten</button>
            `}
            <button id="bn-gpx-export-btn" ${ptCount === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="padding:10px 14px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.08); color:var(--bn-fg); font-weight:bold; cursor:pointer;">💾 GPX Export</button>
          </div>
        </div>

        <!-- GPX-Import -->
        <div style="background:rgba(255,255,255,0.035); border:1px solid var(--bn-line); padding:14px; border-radius:var(--bn-radius-m);">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--bn-fg-faint); margin-bottom:6px;">
            📂 GPX Importieren & Nachfahren
          </div>
          <p style="font-size:12px; color:var(--bn-fg-dim); margin:0 0 10px 0;">
            Lade eine GPX-Datei hoch, um die Route auf der Karte anzuzeigen.
          </p>
          <input type="file" id="bn-gpx-file-input" accept=".gpx" style="display:none;">
          <button id="bn-gpx-import-btn" style="width:100%; padding:10px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-info); background:rgba(79,179,255,0.12); color:var(--bn-info); font-weight:bold; cursor:pointer;">
            📁 GPX-Datei öffnen
          </button>
        </div>
      </div>
    `;

    BootNav.openModal('📍 GPX Track & Routen-Manager', modalHtml);

    // Event-Listener im Modal binden
    setTimeout(() => {
      const recBtn = document.getElementById('bn-gpx-toggle-rec');
      if (recBtn) {
        recBtn.onclick = () => {
          if (isRecording) {
            isRecording = false;
            BootNav.showToast('Aufzeichnung pausiert', 'warn');
          } else {
            if (recordedPoints.length === 0) recordStartTime = Date.now();
            isRecording = true;
            BootNav.showToast('Aufzeichnung gestartet', 'success');
          }
          updateOverlayWidget();
          openGPXModal();
        };
      }

      const exportBtn = document.getElementById('bn-gpx-export-btn');
      if (exportBtn && ptCount > 0) {
        exportBtn.onclick = () => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const gpxXml = generateGPX(recordedPoints, `BootNav Track ${dateStr}`);
          downloadFile(`BootNav_Track_${dateStr}.gpx`, gpxXml);
          BootNav.showToast('GPX-Datei heruntergeladen', 'success');
        };
      }

      const importBtn = document.getElementById('bn-gpx-import-btn');
      const fileInput = document.getElementById('bn-gpx-file-input');
      if (importBtn && fileInput) {
        importBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const trackData = parseGPX(evt.target.result);
              if (trackData.points.length === 0) {
                BootNav.showToast('Keine Wegpunkte in der GPX-Datei gefunden', 'warn');
                return;
              }
              loadedTrack = trackData;
              updateLoadedMapLine();
              zoomToLoadedTrack();
              updateOverlayWidget();
              BootNav.showToast(`Route "${trackData.name}" geladen`, 'success');
              openGPXModal();
            } catch (err) {
              BootNav.showToast('Fehler beim Lesen der GPX-Datei', 'error');
            }
          };
          reader.readAsText(file);
        };
      }

      const zoomBtn = document.getElementById('bn-gpx-zoom-btn');
      if (zoomBtn) {
        zoomBtn.onclick = () => {
          zoomToLoadedTrack();
          BootNav.closeModal();
        };
      }

      const clearBtn = document.getElementById('bn-gpx-clear-btn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          loadedTrack = null;
          updateLoadedMapLine();
          updateOverlayWidget();
          BootNav.showToast('Geladene Route entfernt', 'warn');
          openGPXModal();
        };
      }
    }, 50);
  }

  // GPS-Positionsupdates verarbeiten
  BootNav.onPositionUpdate(function(pos) {
    if (!pos || !pos.lat || !pos.lon) return;

    if (isRecording) {
      if (recordedPoints.length > 0) {
        const lastP = recordedPoints[recordedPoints.length - 1];
        const dist = getDistanceMeters(lastP.lat, lastP.lon, pos.lat, pos.lon);
        // Mindestabstand von 3m zur Rauschunterdrückung
        if (dist >= 3) {
          totalDistanceMeters += dist;
          recordedPoints.push({
            lat: pos.lat,
            lon: pos.lon,
            ele: pos.ele || null,
            time: pos.timestamp || Date.now(),
            speed: pos.speed
          });
          updateRecordingMapLine();
          updateOverlayWidget();
        }
      } else {
        recordedPoints.push({
          lat: pos.lat,
          lon: pos.lon,
          ele: pos.ele || null,
          time: pos.timestamp || Date.now(),
          speed: pos.speed
        });
        updateRecordingMapLine();
        updateOverlayWidget();
      }
    }
  });

  // Modul in BootNav registrieren
  BootNav.registerModule({
    id: 'gpx-module',
    name: 'GPX Recorder & Navigator',
    icon: '📍',
    description: 'Tracks aufzeichnen, als GPX exportieren sowie Routen importieren und nachfahren.',
    onOpen: openGPXModal
  });

})();
