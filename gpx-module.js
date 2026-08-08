(function() {
  "use strict";

  if (!window.BootNav) return;

  // Modul-Status
  let isRecording = false;
  let recordedPoints = [];
  let recordStartTime = null;
  let totalDistanceMeters = 0;

  let loadedTrack = null; // { name, points: [{lat, lon, ele}] }
  let navStartIndex = 0;
  let isNavigating = false;
  let isSelectingStartPoint = false;
  let lastPos = null;
  let startMarker = null;

  // MapLibre Layer-IDs
  const REC_SOURCE_ID = 'bn-gpx-rec-source';
  const REC_LAYER_ID = 'bn-gpx-rec-layer';
  const LOADED_SOURCE_ID = 'bn-gpx-loaded-source';
  const LOADED_LAYER_ID = 'bn-gpx-loaded-layer';
  const NAV_SOURCE_ID = 'bn-gpx-nav-source';
  const NAV_LAYER_ID = 'bn-gpx-nav-layer';

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

  // Peilung / Kompasskurs (Bearing) berechnen
  function getBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Restdistanz ab einem bestimmten Index berechnen
  function getRemainingDistance(points, startIndex) {
    let dist = 0;
    for (let i = startIndex; i < points.length - 1; i++) {
      dist += getDistanceMeters(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
    }
    return dist;
  }

  // Nächstgelegenen Wegpunkt in der Route finden
  function findNearestPointIndex(points, lat, lon) {
    let minDist = Infinity;
    let closestIndex = 0;
    points.forEach((p, idx) => {
      const d = getDistanceMeters(lat, lon, p.lat, p.lon);
      if (d < minDist) {
        minDist = d;
        closestIndex = idx;
      }
    });
    return closestIndex;
  }

  // Karten-Layer initialisieren
  function initMapLayers() {
    const map = BootNav.getMap();
    if (!map) return;

    // Aufgezeichnete Route (Rot)
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

    // Importierte Gesamtroute (Dunkelblau/Gedimmt)
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
        paint: { 'line-color': '#335577', 'line-width': 4, 'line-opacity': 0.6 }
      });
    }

    // Aktive Nachfahr-Route (Aktiv Leuchtend Grün/Türkis)
    if (!map.getSource(NAV_SOURCE_ID)) {
      map.addSource(NAV_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
      });
      map.addLayer({
        id: NAV_LAYER_ID,
        type: 'line',
        source: NAV_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#00e676', 'line-width': 6 }
      });
    }

    // Map-Click Listener für Startpunkt-Auswahl
    map.on('click', (e) => {
      if (!isSelectingStartPoint || !loadedTrack) return;
      
      const clickLat = e.lngLat.lat;
      const clickLon = e.lngLat.lng;
      navStartIndex = findNearestPointIndex(loadedTrack.points, clickLat, clickLon);
      
      isSelectingStartPoint = false;
      map.getCanvas().style.cursor = '';
      
      updateNavStartMarker();
      updateNavMapLine();
      BootNav.showToast(`Startpunkt gesetzt (Punkt ${navStartIndex + 1} von ${loadedTrack.points.length})`, 'success');
      openGPXModal();
    });
  }

  const map = BootNav.getMap();
  if (map.isStyleLoaded()) {
    initMapLayers();
  } else {
    map.on('style.load', initMapLayers);
  }

  function updateNavStartMarker() {
    const map = BootNav.getMap();
    if (!map || !loadedTrack || navStartIndex >= loadedTrack.points.length) {
      if (startMarker) { startMarker.remove(); startMarker = null; }
      return;
    }

    const p = loadedTrack.points[navStartIndex];
    if (!startMarker) {
      const el = document.createElement('div');
      el.innerHTML = '🚩';
      el.style.fontSize = '24px';
      el.style.cursor = 'pointer';
      startMarker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    } else {
      startMarker.setLngLat([p.lon, p.lat]);
    }
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

  function updateNavMapLine() {
    const map = BootNav.getMap();
    if (!map || !map.getSource(NAV_SOURCE_ID)) return;
    const coords = (loadedTrack && navStartIndex < loadedTrack.points.length) 
      ? loadedTrack.points.slice(navStartIndex).map(p => [p.lon, p.lat]) 
      : [];
    map.getSource(NAV_SOURCE_ID).setData({
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

  // Karten-Overlay (Status-Pille oben rechts)
  function updateOverlayWidget() {
    let content = '';
    if (isNavigating && loadedTrack) {
      const remDistKm = (getRemainingDistance(loadedTrack.points, navStartIndex) / 1000).toFixed(2);
      content = `
        <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" id="bn-gpx-btn">
          <span style="color:#00e676; animation:bn-pulse 1s infinite;">🧭</span>
          <strong>NACHFAHREN</strong>
          <span style="color:var(--bn-fg-dim); font-size:11px;">${remDistKm} km übrig</span>
        </div>`;
    } else if (isRecording) {
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
          <strong>Route geladen</strong>
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

  // Modales Fenster zur Steuerung
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

    let loadedInfo = '';
    if (loadedTrack) {
      const remDistM = getRemainingDistance(loadedTrack.points, navStartIndex);
      const remDistKm = (remDistM / 1000).toFixed(2);

      loadedInfo = `
        <div style="background:rgba(79,179,255,0.08); border:1px solid var(--bn-info); padding:12px; border-radius:var(--bn-radius-m); margin-bottom:12px;">
          <div style="font-weight:bold; color:var(--bn-info); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">
            🗺️ Aktive Route (Nachfahren)
          </div>
          <div style="font-size:14px; font-weight:bold; margin-top:2px; word-break:break-all;">${loadedTrack.name}</div>
          <div style="font-size:11px; color:var(--bn-fg-dim); margin-top:2px;">
            ${loadedTrack.points.length} Punkte | Ab Startpunkt: ${remDistKm} km
          </div>

          <!-- Nachfahr-Steuerung & Startpunkt-Wahl -->
          <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.15); display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; gap:6px;">
              <button id="bn-gpx-pick-nearest" style="flex:1; padding:6px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.06); color:var(--bn-fg); cursor:pointer; font-size:11px;">📍 Nächsten GPS-Punkt als Start</button>
              <button id="bn-gpx-pick-map" style="flex:1; padding:6px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.06); color:var(--bn-fg); cursor:pointer; font-size:11px;">🎯 Start auf Karte tippen</button>
            </div>

            <div style="display:flex; gap:6px;">
              ${isNavigating ? `
                <button id="bn-gpx-toggle-nav" style="flex:2; padding:8px; border-radius:var(--bn-radius-s); border:none; background:#ff9800; color:#000; font-weight:bold; cursor:pointer; font-size:12px;">⏸️ Nachfahren Stoppen</button>
              ` : `
                <button id="bn-gpx-toggle-nav" style="flex:2; padding:8px; border-radius:var(--bn-radius-s); border:none; background:#00e676; color:#04211c; font-weight:bold; cursor:pointer; font-size:12px;">🧭 Nachfahren Starten</button>
              `}
              <button id="bn-gpx-zoom-btn" style="flex:1; padding:8px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.05); color:var(--bn-fg); cursor:pointer; font-size:12px;">🎯 Zentrieren</button>
              <button id="bn-gpx-clear-btn" style="padding:8px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-danger); background:rgba(255,93,93,0.1); color:var(--bn-danger); cursor:pointer; font-size:12px;">Entfernen</button>
            </div>
          </div>
        </div>`;
    }

    const modalHtml = `
      <!-- Funktionaler Drag-Handle / Schließ-Balken (_) ganz oben -->
      <div id="bn-modal-drag-handle" title="Schließen" style="width:48px; height:5px; background:rgba(255,255,255,0.4); border-radius:3px; margin:-6px auto 12px auto; cursor:pointer;"></div>

      <div style="display:flex; flex-direction:column; gap:12px;">
        ${loadedInfo}

        <!-- Track-Aufzeichnung -->
        <div style="background:rgba(255,255,255,0.035); border:1px solid var(--bn-line); padding:12px; border-radius:var(--bn-radius-m);">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--bn-fg-faint); margin-bottom:8px;">
            📍 Track-Aufzeichnung (GPS-Recorder)
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; text-align:center; margin-bottom:10px;">
            <div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9px; color:var(--bn-fg-faint);">DISTANZ</div>
              <div style="font-size:14px; font-weight:bold; color:var(--bn-accent);">${distKm} km</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9px; color:var(--bn-fg-faint);">DAUER</div>
              <div style="font-size:14px; font-weight:bold;">${durationStr}</div>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:var(--bn-radius-s);">
              <div style="font-size:9px; color:var(--bn-fg-faint);">PUNKTE</div>
              <div style="font-size:14px; font-weight:bold;">${ptCount}</div>
            </div>
          </div>

          <div style="display:flex; gap:8px;">
            ${isRecording ? `
              <button id="bn-gpx-toggle-rec" style="flex:1; padding:9px; border-radius:var(--bn-radius-s); border:none; background:var(--bn-danger); color:#fff; font-weight:bold; cursor:pointer;">⏹️ Aufzeichnung Stoppen</button>
            ` : `
              <button id="bn-gpx-toggle-rec" style="flex:1; padding:9px; border-radius:var(--bn-radius-s); border:none; background:var(--bn-accent); color:#04211c; font-weight:bold; cursor:pointer;">▶️ Aufzeichnung Starten</button>
            `}
            <button id="bn-gpx-export-btn" ${ptCount === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} style="padding:9px 12px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-line); background:rgba(255,255,255,0.08); color:var(--bn-fg); font-weight:bold; cursor:pointer;">💾 Export</button>
          </div>
        </div>

        <!-- GPX-Import -->
        <div style="background:rgba(255,255,255,0.035); border:1px solid var(--bn-line); padding:12px; border-radius:var(--bn-radius-m);">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--bn-fg-faint); margin-bottom:4px;">
            📂 GPX Importieren
          </div>
          <p style="font-size:11px; color:var(--bn-fg-dim); margin:0 0 8px 0;">
            Lade eine GPX-Datei hoch, um die Route auf der Karte anzuzeigen und nachzufahren.
          </p>
          <input type="file" id="bn-gpx-file-input" accept=".gpx" style="display:none;">
          <button id="bn-gpx-import-btn" style="width:100%; padding:9px; border-radius:var(--bn-radius-s); border:1px solid var(--bn-info); background:rgba(79,179,255,0.12); color:var(--bn-info); font-weight:bold; cursor:pointer;">
            📁 GPX-Datei öffnen
          </button>
        </div>
      </div>
    `;

    BootNav.openModal('📍 GPX Track & Routen-Manager', modalHtml);

    setTimeout(() => {
      // Functional Drag Handle '_' Listener zum Schließen
      const handleEl = document.getElementById('bn-modal-drag-handle');
      if (handleEl) {
        handleEl.onclick = () => BootNav.closeModal();
      }

      // Startpunkt auf Karte tippen
      const pickMapBtn = document.getElementById('bn-gpx-pick-map');
      if (pickMapBtn) {
        pickMapBtn.onclick = () => {
          isSelectingStartPoint = true;
          const mapInstance = BootNav.getMap();
          if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
          BootNav.closeModal();
          BootNav.showToast('Klicke/Tippe auf die Route auf der Karte, um den Startpunkt zu wählen', 'info');
        };
      }

      // Nächstgelegenen GPS Punkt wählen
      const pickNearestBtn = document.getElementById('bn-gpx-pick-nearest');
      if (pickNearestBtn) {
        pickNearestBtn.onclick = () => {
          if (!lastPos || !loadedTrack) {
            BootNav.showToast('Keine aktuelle GPS-Position verfügbar', 'warn');
            return;
          }
          navStartIndex = findNearestPointIndex(loadedTrack.points, lastPos.lat, lastPos.lon);
          updateNavStartMarker();
          updateNavMapLine();
          BootNav.showToast(`Startpunkt auf nächstes Signal gesetzt (Punkt ${navStartIndex + 1})`, 'success');
          openGPXModal();
        };
      }

      // Nachfahren Toggle
      const navBtn = document.getElementById('bn-gpx-toggle-nav');
      if (navBtn) {
        navBtn.onclick = () => {
          isNavigating = !isNavigating;
          if (isNavigating) {
            updateNavMapLine();
            updateNavStartMarker();
            BootNav.showToast('Nachfahren der Route gestartet', 'success');
          } else {
            BootNav.showToast('Nachfahren pausiert', 'warn');
          }
          updateOverlayWidget();
          openGPXModal();
        };
      }

      // Record Toggle
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

      // Export Button
      const exportBtn = document.getElementById('bn-gpx-export-btn');
      if (exportBtn && ptCount > 0) {
        exportBtn.onclick = () => {
          const dateStr = new Date().toISOString().slice(0, 10);
          const gpxXml = generateGPX(recordedPoints, `BootNav Track ${dateStr}`);
          downloadFile(`BootNav_Track_${dateStr}.gpx`, gpxXml);
          BootNav.showToast('GPX-Datei heruntergeladen', 'success');
        };
      }

      // Import Button
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
              navStartIndex = 0;
              isNavigating = false;
              updateLoadedMapLine();
              updateNavMapLine();
              updateNavStartMarker();
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

      // Zoom Button
      const zoomBtn = document.getElementById('bn-gpx-zoom-btn');
      if (zoomBtn) {
        zoomBtn.onclick = () => {
          zoomToLoadedTrack();
          BootNav.closeModal();
        };
      }

      // Clear Button
      const clearBtn = document.getElementById('bn-gpx-clear-btn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          loadedTrack = null;
          navStartIndex = 0;
          isNavigating = false;
          updateLoadedMapLine();
          updateNavMapLine();
          updateNavStartMarker();
          updateOverlayWidget();
          BootNav.showToast('Route entfernt', 'warn');
          openGPXModal();
        };
      }
    }, 50);
  }

  // GPS Live Update Verarbeitung
  BootNav.onPositionUpdate(function(pos) {
    if (!pos || !pos.lat || !pos.lon) return;
    lastPos = pos;

    // 1. Logik zum Nachfahren
    if (isNavigating && loadedTrack && loadedTrack.points.length > 0) {
      // Finde den nächstgelegenen Punkt in der verbleibenden Route
      let searchIdx = navStartIndex;
      let minD = Infinity;
      let targetIdx = navStartIndex;

      // Suche vorwärts ab dem aktuellen Startindex
      for (let i = searchIdx; i < Math.min(searchIdx + 20, loadedTrack.points.length); i++) {
        const d = getDistanceMeters(pos.lat, pos.lon, loadedTrack.points[i].lat, loadedTrack.points[i].lon);
        if (d < minD) {
          minD = d;
          targetIdx = i;
        }
      }

      // Wenn wir uns einem Wegpunkt auf unter 20 Meter genähert haben, rücken wir vor
      if (minD < 20 && targetIdx > navStartIndex) {
        navStartIndex = targetIdx;
        updateNavMapLine();
        updateNavStartMarker();
      }

      // Off-Track Warnung wenn mehr als 100 Meter von der Route entfernt
      if (minD > 100) {
        BootNav.showToast(`Off-Track: ${Math.round(minD)}m abseits der Route!`, 'warn');
      }

      // Ziel erreicht Check
      if (navStartIndex >= loadedTrack.points.length - 1 && minD < 30) {
        isNavigating = false;
        BootNav.showToast('🎉 Ziel erreicht! Route abgeschlossen.', 'success');
        updateOverlayWidget();
      } else {
        // Kompasskurs zum nächsten Wegpunkt berechnen
        const nextPt = loadedTrack.points[Math.min(navStartIndex + 1, loadedTrack.points.length - 1)];
        const targetBearing = Math.round(getBearing(pos.lat, pos.lon, nextPt.lat, nextPt.lon));
        
        // Navigation HUD auf Karte anzeigen/aktualisieren
        const remDistKm = (getRemainingDistance(loadedTrack.points, navStartIndex) / 1000).toFixed(2);
        const hudHtml = `
          <div style="font-size:12px; font-weight:bold; color:#00e676; display:flex; gap:10px; align-items:center;">
            <span>🧭 Kurs: ${targetBearing}°</span>
            <span>📏 Rest: ${remDistKm} km</span>
            <span>📍 Punkt: ${navStartIndex + 1}/${loadedTrack.points.length}</span>
          </div>`;
        BootNav.addOverlayWidget('gpx-nav-hud', hudHtml);
      }
    } else {
      BootNav.removeOverlayWidget('gpx-nav-hud');
    }

    // 2. Logik zur Live Track-Aufzeichnung
    if (isRecording) {
      if (recordedPoints.length > 0) {
        const lastP = recordedPoints[recordedPoints.length - 1];
        const dist = getDistanceMeters(lastP.lat, lastP.lon, pos.lat, pos.lon);
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

  // Registrierung in BootNav
  BootNav.registerModule({
    id: 'gpx-module',
    name: 'GPX Recorder & Navigator',
    icon: '📍',
    description: 'Tracks aufzeichnen, als GPX exportieren sowie Routen importieren und nachfahren.',
    onOpen: openGPXModal
  });

})();
