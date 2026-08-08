(function() {
  "use strict";

  if (!window.BootNav) return;

  let weatherData = null;
  let lastFetchLat = null;
  let lastFetchLon = null;
  let lastFetchTime = 0;
  const FETCH_INTERVAL_MS = 10 * 60 * 1000; // 10 Minuten Intervall
  const MIN_DIST_FETCH_KM = 2.0;

  // WMO Wettercodes Übersetzung & Symbolik
  function getWeatherInfo(code, isDay = 1) {
    const map = {
      0: { text: 'Klar / Sonnig', icon: isDay ? '☀️' : '🌙' },
      1: { text: 'Überwiegend klar', icon: isDay ? '🌤️' : '🌙' },
      2: { text: 'Teilweise bewölkt', icon: '⛅' },
      3: { text: 'Bedeckt', icon: '☁️' },
      45: { text: 'Nebel', icon: '🌫️' },
      48: { text: 'Rauhreifnebel', icon: '🌫️' },
      51: { text: 'Leichter Sprühregen', icon: '🌦️' },
      53: { text: 'Mäßiger Sprühregen', icon: '🌦️' },
      55: { text: 'Dichter Sprühregen', icon: '🌧️' },
      56: { text: 'Gefrierender Sprühregen', icon: '🌧️❄️' },
      57: { text: 'Dichter gefrierender Sprühregen', icon: '🌧️❄️' },
      61: { text: 'Leichter Regen', icon: '🌦️' },
      63: { text: 'Mäßiger Regen', icon: '🌧️' },
      65: { text: 'Starker Regen', icon: '🌧️' },
      66: { text: 'Gefrierender Regen', icon: '🌧️❄️' },
      67: { text: 'Starker gefrierender Regen', icon: '🌧️❄️' },
      71: { text: 'Leichter Schneefall', icon: '🌨️' },
      73: { text: 'Mäßiger Schneefall', icon: '❄️' },
      75: { text: 'Starker Schneefall', icon: '❄️' },
      77: { text: 'Schneegriesel', icon: '❄️' },
      80: { text: 'Leichte Regenschauer', icon: '🌦️' },
      81: { text: 'Mäßige Regenschauer', icon: '🌧️' },
      82: { text: 'Heftige Regenschauer', icon: '🌧️⚡' },
      85: { text: 'Leichte Schneeschauer', icon: '🌨️' },
      86: { text: 'Starke Schneeschauer', icon: '🌨️' },
      95: { text: 'Gewitter', icon: '⛈️' },
      96: { text: 'Gewitter mit leichtem Hagel', icon: '⛈️🌩️' },
      99: { text: 'Gewitter mit starkem Hagel', icon: '⛈️🚨' }
    };
    return map[code] || { text: 'Unbekannt', icon: '🌡️' };
  }

  function getWindDir(deg) {
    if (deg == null || isNaN(deg)) return '';
    const dirs = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round((deg % 360) / 22.5) % 16;
    return dirs[idx];
  }

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&wind_speed_unit=ms&timezone=auto`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('API-Fehler');
      weatherData = await res.json();
      lastFetchLat = lat;
      lastFetchLon = lon;
      lastFetchTime = Date.now();
      updateOverlayWidget();
    } catch (err) {
      console.warn('BootNav Wetter: Fehler beim Laden der Wetterdaten', err);
    }
  }

  function updateOverlayWidget() {
    if (!weatherData || !weatherData.current) {
      BootNav.addOverlayWidget('weather-pill', `
        <span style="cursor:pointer;" id="bn-weather-btn">🌤️ Wetter geladen…</span>
      `);
      return;
    }

    const curr = weatherData.current;
    const info = getWeatherInfo(curr.weather_code, curr.is_day);
    const state = BootNav.getState();
    const windConverted = BootNav.convertSpeed(curr.wind_speed_10m).toFixed(0);
    const windUnit = state.speedUnit === 'kn' ? 'kn' : 'km/h';

    const isStormy = curr.weather_code >= 95 || curr.wind_gusts_10m >= 13.8 || curr.wind_speed_10m >= 10.8;
    let alertBadge = '';
    if (curr.weather_code >= 95) {
      alertBadge = `<span style="background:var(--bn-danger); color:#fff; padding:2px 6px; border-radius:999px; font-size:10px; font-weight:bold; margin-left:4px;">⚠️ Gewitter</span>`;
    } else if (isStormy) {
      alertBadge = `<span style="background:var(--bn-accent-2); color:#000; padding:2px 6px; border-radius:999px; font-size:10px; font-weight:bold; margin-left:4px;">💨 Windwarnung</span>`;
    }

    const pillNode = BootNav.addOverlayWidget('weather-pill', `
      <div id="bn-weather-btn" style="display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none;">
        <span style="font-size:16px; line-height:1;">${info.icon}</span>
        <span style="font-weight:700;">${curr.temperature_2m.toFixed(1)}°C</span>
        <span style="color:var(--bn-fg-dim); font-size:11px;">💨 ${windConverted} ${windUnit}</span>
        ${alertBadge}
      </div>
    `);

    if (pillNode) {
      const btn = pillNode.querySelector('#bn-weather-btn');
      if (btn) btn.onclick = openWeatherModal;
    }
  }

  function openWeatherModal() {
    if (!weatherData) {
      BootNav.openModal('Wetterbericht', '<p>Keine Wetterdaten verfügbar. Warte auf GPS-Signal...</p>');
      return;
    }

    const curr = weatherData.current;
    const hourly = weatherData.hourly;
    const daily = weatherData.daily;
    const state = BootNav.getState();
    const speedUnit = state.speedUnit === 'kn' ? 'kn' : 'km/h';

    const currInfo = getWeatherInfo(curr.weather_code, curr.is_day);
    const currWind = BootNav.convertSpeed(curr.wind_speed_10m).toFixed(1);
    const currGusts = BootNav.convertSpeed(curr.wind_gusts_10m).toFixed(1);
    const currDir = getWindDir(curr.wind_direction_10m);

    // Stündlicher Verlauf (nächste 24h)
    let hourlyHtml = '';
    const nowIdx = new Date().getHours();
    for (let i = nowIdx; i < Math.min(nowIdx + 24, hourly.time.length); i++) {
      const timeStr = hourly.time[i].split('T')[1].substring(0, 5);
      const hInfo = getWeatherInfo(hourly.weather_code[i], 1);
      const hWind = BootNav.convertSpeed(hourly.wind_speed_10m[i]).toFixed(0);
      const hProb = hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0;

      hourlyHtml += `
        <div style="display:flex; flex-direction:column; align-items:center; min-width:64px; padding:10px 6px; background:rgba(255,255,255,0.03); border:1px solid var(--bn-line); border-radius:var(--bn-radius-m); text-align:center; flex-shrink:0;">
          <span style="font-size:11px; color:var(--bn-fg-faint); font-weight:600;">${timeStr}</span>
          <span style="font-size:22px; margin:4px 0;">${hInfo.icon}</span>
          <span style="font-weight:700; font-size:14px;">${hourly.temperature_2m[i].toFixed(0)}°</span>
          <span style="font-size:10.5px; color:var(--bn-info); margin-top:4px; font-weight:600;">💧 ${hProb}%</span>
          <span style="font-size:10px; color:var(--bn-fg-dim); margin-top:2px;">💨 ${hWind}</span>
        </div>
      `;
    }

    // 7-Tage Übersicht
    let dailyHtml = '';
    for (let d = 0; d < daily.time.length; d++) {
      const dateObj = new Date(daily.time[d]);
      const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const dInfo = getWeatherInfo(daily.weather_code[d], 1);
      const dWind = BootNav.convertSpeed(daily.wind_speed_10m_max[d]).toFixed(0);
      const dGusts = BootNav.convertSpeed(daily.wind_gusts_10m_max[d]).toFixed(0);

      dailyHtml += `
        <tr style="border-bottom: 1px solid var(--bn-line);">
          <td style="padding: 10px 6px; font-weight:600; white-space:nowrap;">${dayName}</td>
          <td style="padding: 10px 4px; text-align:center; font-size:20px;">${dInfo.icon}</td>
          <td style="padding: 10px 6px; font-size:12px; color:var(--bn-fg-dim);">${dInfo.text}</td>
          <td style="padding: 10px 6px; text-align:right; font-weight:700; white-space:nowrap;">${daily.temperature_2m_max[d].toFixed(0)}° <span style="color:var(--bn-fg-faint); font-weight:normal;">/ ${daily.temperature_2m_min[d].toFixed(0)}°</span></td>
          <td style="padding: 10px 6px; text-align:right; color:var(--bn-info); font-size:12px; white-space:nowrap;">💧 ${daily.precipitation_sum[d].toFixed(1)} mm</td>
          <td style="padding: 10px 6px; text-align:right; font-size:12px; white-space:nowrap;">💨 ${dWind} <span style="color:var(--bn-fg-faint);">(${dGusts})</span> <span style="font-size:10px; color:var(--bn-fg-faint);">${speedUnit}</span></td>
        </tr>
      `;
    }

    const modalContent = `
      <style>
        .bn-weather-hourly::-webkit-scrollbar { height: 5px; }
        .bn-weather-hourly::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 4px; }
        .bn-weather-hourly::-webkit-scrollbar-thumb { background: var(--bn-line-strong); border-radius: 4px; }
        .bn-weather-hourly::-webkit-scrollbar-thumb:hover { background: var(--bn-fg-faint); }
      </style>

      <div style="display:flex; flex-direction:column; gap:16px;">
        
        <!-- Aktueller Wetter-Kopf -->
        <div style="background:rgba(255,255,255,0.035); border:1px solid var(--bn-line-strong); padding:14px 16px; border-radius:var(--bn-radius-m); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <span style="font-size:44px; line-height:1;">${currInfo.icon}</span>
            <div>
              <div style="font-size:28px; font-weight:800; line-height:1;">${curr.temperature_2m.toFixed(1)} °C</div>
              <div style="font-size:12px; color:var(--bn-fg-dim); margin-top:4px;">Gefühlt ${curr.apparent_temperature.toFixed(1)} °C • ${currInfo.text}</div>
            </div>
          </div>
          <div style="font-size:12px; border-left:1px solid var(--bn-line); padding-left:14px; display:flex; flex-direction:column; gap:4px;">
            <div>💨 <strong>Wind:</strong> ${currWind} ${speedUnit} (${currDir} ${curr.wind_direction_10m}°)</div>
            <div>🌪️ <strong>Böen:</strong> ${currGusts} ${speedUnit}</div>
            <div>💧 <strong>Feuchte:</strong> ${curr.relative_humidity_2m}%</div>
            <div>☁️ <strong>Bewölkung:</strong> ${curr.cloud_cover}%</div>
          </div>
        </div>

        <!-- 24h Stündlicher Verlauf -->
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:var(--bn-fg-faint); margin-bottom:8px;">Nächste 24 Stunden</div>
          <div class="bn-weather-hourly" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:8px; scroll-behavior:smooth;">
            ${hourlyHtml}
          </div>
        </div>

        <!-- 7-Tage Vorschau -->
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:var(--bn-fg-faint); margin-bottom:8px;">7-Tage Vorhersage</div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead>
                <tr style="color:var(--bn-fg-faint); font-size:10.5px; text-transform:uppercase; border-bottom:1px solid var(--bn-line-strong);">
                  <th style="text-align:left; padding:6px;">Tag</th>
                  <th style="text-align:center; padding:6px;"></th>
                  <th style="text-align:left; padding:6px;">Wetter</th>
                  <th style="text-align:right; padding:6px;">Temp</th>
                  <th style="text-align:right; padding:6px;">Regen</th>
                  <th style="text-align:right; padding:6px;">Wind (Böen)</th>
                </tr>
              </thead>
              <tbody>
                ${dailyHtml}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    BootNav.openModal('⚓ Wetterbericht', modalContent);

    // Touch-Grip & Drag-down-to-close Logik aktivieren
    setTimeout(() => {
      const grip = document.querySelector('.bn-modal-grip');
      const head = document.querySelector('.bn-modal-head');
      const modal = document.getElementById('bn-modal');
      if (!modal) return;

      if (grip) {
        grip.style.cursor = 'grab';
        grip.style.padding = '8px 0'; // Größere Trefferfläche
        grip.title = 'Tippen oder nach unten streichen zum Schließen';
        grip.addEventListener('click', () => BootNav.closeModal());
      }

      let startY = 0;
      let currentY = 0;
      let isDragging = false;

      const onTouchStart = (e) => {
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        isDragging = true;
        modal.style.transition = 'none';
      };

      const onTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) {
          modal.style.transform = `translateY(${deltaY}px)`;
        }
      };

      const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        modal.style.transition = 'transform 0.25s cubic-bezier(.32,.72,.35,1)';
        const deltaY = currentY - startY;
        
        if (deltaY > 80) { // Mehr als 80px nach unten gezogen -> Schließen
          BootNav.closeModal();
          setTimeout(() => { modal.style.transform = ''; }, 300);
        } else {
          modal.style.transform = '';
        }
        startY = 0;
        currentY = 0;
      };

      const targets = [grip, head].filter(Boolean);
      targets.forEach(target => {
        target.addEventListener('touchstart', onTouchStart, { passive: true });
        target.addEventListener('touchmove', onTouchMove, { passive: true });
        target.addEventListener('touchend', onTouchEnd);
      });
    }, 50);
  }

  // Modul registrieren
  BootNav.registerModule({
    id: 'weather-module',
    name: 'Wetter & Unwetterwarnung',
    icon: '🌤️',
    description: 'Live-Wetter, Winddaten und 7-Tage-Vorhersage basierend auf der GPS-Position.',
    onOpen: openWeatherModal
  });

  // GPS-Position verarbeiten
  BootNav.onPositionUpdate(function(pos) {
    if (!pos || !pos.lat || !pos.lon) return;

    const now = Date.now();
    const needsTimeFetch = (now - lastFetchTime) > FETCH_INTERVAL_MS;
    const dist = (lastFetchLat && lastFetchLon) ? getDistanceKm(lastFetchLat, lastFetchLon, pos.lat, pos.lon) : 999;
    const needsDistFetch = dist > MIN_DIST_FETCH_KM;

    if (needsTimeFetch || needsDistFetch) {
      fetchWeather(pos.lat, pos.lon);
    }
  });

  // Einheiten-Umschaltung beobachten
  document.addEventListener('click', (e) => {
    if (e.target.closest('#bn-hud-speed') || e.target.closest('#bn-unit-toggle')) {
      setTimeout(updateOverlayWidget, 30);
    }
  });

  const initialPos = BootNav.getLastPosition();
  if (initialPos) {
    fetchWeather(initialPos.lat, initialPos.lon);
  } else {
    updateOverlayWidget();
  }

})();
