(function() {
  "use strict";

  // Sicherstellen, dass das BootNav-System geladen ist
  if (!window.BootNav) return;

  let totalSpeed = 0;
  let sampleCount = 0;
  let lastAvgSpeed = 0; // Speicherung in m/s

  // 1. HUD-Widget unten in die Leiste einfügen
  const hudCell = BootNav.addHudWidget('avg-speed', `
    <span class="bn-hud-label">Ø Speed</span>
    <span class="bn-hud-value">
      <span id="bn-val-avg-speed">0.0</span>
      <span class="bn-hud-unit" id="bn-unit-avg-speed">kn</span>
    </span>
  `);

  // HUD-Zelle klickbar machen
  if (hudCell) {
    hudCell.classList.add('bn-hud-clickable');
    hudCell.title = "Statistik anzeigen / zurücksetzen";
    hudCell.addEventListener('click', openAvgSpeedModal);
  }

  // Anzeige-Aktualisierung (inklusive Umrechnung)
  function updateDisplay() {
    const valEl = document.getElementById('bn-val-avg-speed');
    const unitEl = document.getElementById('bn-unit-avg-speed');
    const state = BootNav.getState();

    if (valEl) {
      const converted = BootNav.convertSpeed(lastAvgSpeed);
      valEl.textContent = converted.toFixed(1);
    }
    if (unitEl) {
      unitEl.textContent = state.speedUnit === 'kn' ? 'kn' : 'km/h';
    }
  }

  // Modal-Dialog für Statistiken & Reset
  function openAvgSpeedModal() {
    const state = BootNav.getState();
    const currentAvg = BootNav.convertSpeed(lastAvgSpeed).toFixed(1);
    const unitStr = state.speedUnit === 'kn' ? 'kn' : 'km/h';

    BootNav.openModal('Durchschnittsgeschwindigkeit', `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <p style="margin: 0;">Aktueller Durchschnitt: <strong>${currentAvg} ${unitStr}</strong></p>
        <p style="margin: 0;">Gemessene GPS-Punkte: <strong>${sampleCount}</strong></p>
        <button id="bn-reset-avg-btn" style="
          padding: 10px 16px;
          background: var(--bn-accent);
          color: #04211c;
          border: none;
          border-radius: var(--bn-radius-s);
          font-weight: bold;
          cursor: pointer;
        ">
          Statistik zurücksetzen
        </button>
      </div>
    `);

    setTimeout(() => {
      const btn = document.getElementById('bn-reset-avg-btn');
      if (btn) {
        btn.addEventListener('click', () => {
          totalSpeed = 0;
          sampleCount = 0;
          lastAvgSpeed = 0;
          updateDisplay();
          BootNav.showToast('Durchschnitt zurückgesetzt', 'success');
          BootNav.closeModal();
        });
      }
    }, 50);
  }

  // 2. Modul im Menü (Sidebar) registrieren
  BootNav.registerModule({
    id: 'avg-speed-module',
    name: 'Durchschnittsgeschwindigkeit',
    icon: '📊',
    description: 'Berechnet die durchschnittliche Fahrtgeschwindigkeit live über GPS.',
    onOpen: openAvgSpeedModal
  });

  // 3. GPS-Positionen verarbeiten
  BootNav.onPositionUpdate(function(pos) {
    if (pos && typeof pos.speed === 'number' && pos.speed > 0) {
      totalSpeed += pos.speed;
      sampleCount++;
      lastAvgSpeed = totalSpeed / sampleCount;
      updateDisplay();
    }
  });

  // 4. Automatische Umschaltung bei Einheitenwechsel (kn <-> km/h)
  const mainUnitEl = document.getElementById('bn-unit-speed');
  if (mainUnitEl) {
    const observer = new MutationObserver(() => {
      updateDisplay();
    });
    observer.observe(mainUnitEl, { childList: true, characterData: true, subtree: true });
  }

  // Zusätzliche Absicherung bei Klicks auf Schalter
  document.addEventListener('click', (e) => {
    if (e.target.closest('#bn-hud-speed') || e.target.closest('#bn-unit-toggle')) {
      setTimeout(updateDisplay, 20);
    }
  });

})();
