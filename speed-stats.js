(function() {
  "use strict";

  if (!window.BootNav) return;

  // Speicher für Statistiken (in Basiseinheit m/s und ms)
  let maxSpeed = 0;          // m/s
  let totalSpeed = 0;        // m/s
  let sampleCount = 0;       // Anzahl Messungen
  let avgSpeed = 0;          // m/s
  
  let lastSpeed = null;      // m/s
  let lastTime = null;       // Timestamp (ms)
  let currentAccel = 0;      // m/s²
  let maxAccel = 0;          // m/s²

  // 1. HUD-Widget unten in der Leiste einfügen
  const hudCell = BootNav.addHudWidget('speed-stats', `
    <span class="bn-hud-label">Ø / Max Speed</span>
    <span class="bn-hud-value">
      <span id="bn-val-hud-avg">0.0</span> / <span id="bn-val-hud-max">0.0</span>
      <span class="bn-hud-unit" id="bn-unit-hud-stats">kn</span>
    </span>
  `);

  if (hudCell) {
    hudCell.classList.add('bn-hud-clickable');
    hudCell.title = "Geschwindigkeits-Statistiken anzeigen / zurücksetzen";
    hudCell.addEventListener('click', openStatsModal);
  }

  // Formatierung der Beschleunigung je nach gewählter Einheit
  function formatAccel(accelMS2, unit) {
    if (unit === 'kn') {
      const knPerSec = accelMS2 * 1.94384;
      return `${knPerSec >= 0 ? '+' : ''}${knPerSec.toFixed(2)} kn/s`;
    } else {
      const kmhPerSec = accelMS2 * 3.6;
      return `${kmhPerSec >= 0 ? '+' : ''}${kmhPerSec.toFixed(2)} (km/h)/s`;
    }
  }

  // Live-Anzeige im HUD aktualisieren
  function updateDisplay() {
    const state = BootNav.getState();
    const unitStr = state.speedUnit === 'kn' ? 'kn' : 'km/h';
    
    const avgEl = document.getElementById('bn-val-hud-avg');
    const maxEl = document.getElementById('bn-val-hud-max');
    const unitEl = document.getElementById('bn-unit-hud-stats');

    if (avgEl) avgEl.textContent = BootNav.convertSpeed(avgSpeed).toFixed(1);
    if (maxEl) maxEl.textContent = BootNav.convertSpeed(maxSpeed).toFixed(1);
    if (unitEl) unitEl.textContent = unitStr;
  }

  // Modal-Dialog für Details & Zurücksetzen
  function openStatsModal() {
    const state = BootNav.getState();
    const unitStr = state.speedUnit === 'kn' ? 'kn' : 'km/h';

    const convertedAvg = BootNav.convertSpeed(avgSpeed).toFixed(1);
    const convertedMax = BootNav.convertSpeed(maxSpeed).toFixed(1);
    const formattedAccel = formatAccel(currentAccel, state.speedUnit);
    const formattedMaxAccel = formatAccel(maxAccel, state.speedUnit);

    BootNav.openModal('🚀 Geschwindigkeits-Analyse', `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="background: rgba(255,255,255,0.035); padding: 12px; border-radius: var(--bn-radius-m); border: 1px solid var(--bn-line);">
            <div style="font-size: 11px; color: var(--bn-fg-dim); font-weight: 600;">Ø GESCHWINDIGKEIT</div>
            <div style="font-size: 22px; font-weight: 800; margin-top: 4px;">${convertedAvg} <span style="font-size: 12px; color: var(--bn-fg-dim);">${unitStr}</span></div>
          </div>
          <div style="background: rgba(255,255,255,0.035); padding: 12px; border-radius: var(--bn-radius-m); border: 1px solid var(--bn-line);">
            <div style="font-size: 11px; color: var(--bn-fg-dim); font-weight: 600;">MAX. GESCHWINDIGKEIT</div>
            <div style="font-size: 22px; font-weight: 800; margin-top: 4px; color: var(--bn-accent, #3498db);">${convertedMax} <span style="font-size: 12px; color: var(--bn-fg-dim);">${unitStr}</span></div>
          </div>
          <div style="background: rgba(255,255,255,0.035); padding: 12px; border-radius: var(--bn-radius-m); border: 1px solid var(--bn-line);">
            <div style="font-size: 11px; color: var(--bn-fg-dim); font-weight: 600;">BESCHLEUNIGUNG</div>
            <div style="font-size: 16px; font-weight: 700; margin-top: 4px;">${formattedAccel}</div>
          </div>
          <div style="background: rgba(255,255,255,0.035); padding: 12px; border-radius: var(--bn-radius-m); border: 1px solid var(--bn-line);">
            <div style="font-size: 11px; color: var(--bn-fg-dim); font-weight: 600;">MAX. BESCHLEUNIGUNG</div>
            <div style="font-size: 16px; font-weight: 700; margin-top: 4px;">${formattedMaxAccel}</div>
          </div>
        </div>

        <div style="font-size: 11px; color: var(--bn-fg-faint); text-align: right;">Erfasste GPS-Punkte: ${sampleCount}</div>

        <button id="bn-reset-speed-stats-btn" style="
          padding: 12px;
          background: var(--bn-danger, #e74c3c);
          color: #fff;
          border: none;
          border-radius: var(--bn-radius-s);
          font-weight: bold;
          cursor: pointer;
          transition: opacity 0.2s;
        ">
          🔄 Statistik zurücksetzen
        </button>
      </div>
    `);

    setTimeout(() => {
      const btn = document.getElementById('bn-reset-speed-stats-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          maxSpeed = 0;
          totalSpeed = 0;
          sampleCount = 0;
          avgSpeed = 0;
          lastSpeed = null;
          lastTime = null;
          currentAccel = 0;
          maxAccel = 0;
          updateDisplay();
          BootNav.showToast('Geschwindigkeitsdaten zurückgesetzt', 'success');
          BootNav.closeModal();
        });
      }
    }, 50);
  }

  // 2. Modul in der Sidebar registrieren
  BootNav.registerModule({
    id: 'speed-stats-module',
    name: 'Geschwindigkeits-Analyse',
    icon: '🚀',
    description: 'Erfasst Höchstgeschwindigkeit, Durchschnitt und Beschleunigung live.',
    onOpen: openStatsModal
  });

  // 3. GPS-Positionen auswerten
  BootNav.onPositionUpdate(function(pos) {
    if (!pos || typeof pos.speed !== 'number') return;

    const speed = Math.max(0, pos.speed); // m/s
    const now = pos.timestamp || Date.now();

    // Durchschnitt & Höchstgeschwindigkeit
    totalSpeed += speed;
    sampleCount++;
    avgSpeed = totalSpeed / sampleCount;

    if (speed > maxSpeed) {
      maxSpeed = speed;
    }

    // Beschleunigung berechnen (a = Δv / Δt)
    if (lastSpeed !== null && lastTime !== null) {
      const deltaTime = (now - lastTime) / 1000;
      if (deltaTime > 0.2) {
        const deltaSpeed = speed - lastSpeed;
        currentAccel = deltaSpeed / deltaTime;
        if (currentAccel > maxAccel) {
          maxAccel = currentAccel;
        }
      }
    }

    lastSpeed = speed;
    lastTime = now;

    updateDisplay();
  });

  // 4. Automatische Umschaltung bei Einheitenwechsel (kn <-> km/h)
  const mainUnitEl = document.getElementById('bn-unit-speed');
  if (mainUnitEl) {
    const observer = new MutationObserver(() => {
      updateDisplay();
    });
    observer.observe(mainUnitEl, { childList: true, characterData: true, subtree: true });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#bn-hud-speed') || e.target.closest('#bn-unit-toggle')) {
      setTimeout(updateDisplay, 20);
    }
  });

})();
