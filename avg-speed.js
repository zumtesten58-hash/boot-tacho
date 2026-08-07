(function() {
  "use strict";

  // Sicherstellen, dass das BootNav-System geladen ist
  if (!window.BootNav) return;

  let totalSpeed = 0;
  let sampleCount = 0;

  // 1. HUD-Widget unten in die Leiste einfügen
  BootNav.addHudWidget('avg-speed', `
    <span class="bn-hud-label">Ø Speed</span>
    <span class="bn-hud-value">
      <span id="bn-val-avg-speed">0.0</span>
      <span class="bn-hud-unit" id="bn-unit-avg-speed">kn</span>
    </span>
  `);

  // 2. Modul in der Seitenleiste (Burger-Menü) registrieren
  BootNav.registerModule({
    id: 'avg-speed-module',
    name: 'Durchschnittsgeschwindigkeit',
    icon: '📊',
    description: 'Berechnet die durchschnittliche Fahrtgeschwindigkeit seit dem Start.',
    onOpen: function() {
      // Öffnet ein Modal mit Statistiken und Reset-Button
      BootNav.openModal('Durchschnittsgeschwindigkeit', `
        <p style="margin-bottom: 12px;">Messungen: <strong>${sampleCount}</strong></p>
        <button id="bn-reset-avg-btn" style="
          padding: 8px 14px;
          background: var(--bn-accent);
          color: #04211c;
          border: none;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
        ">
          Statistik zurücksetzen
        </button>
      `);

      // Event-Listener für den Reset-Button setzen
      setTimeout(() => {
        const btn = document.getElementById('bn-reset-avg-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            totalSpeed = 0;
            sampleCount = 0;
            updateDisplay(0);
            BootNav.showToast('Durchschnitt zurückgesetzt', 'success');
            BootNav.closeModal();
          });
        }
      }, 50);
    }
  });

  // Hilfsfunktion zur Anzeigeaktualisierung
  function updateDisplay(avgMs) {
    const valEl = document.getElementById('bn-val-avg-speed');
    const unitEl = document.getElementById('bn-unit-avg-speed');
    
    if (valEl) {
      const converted = BootNav.convertSpeed(avgMs);
      valEl.textContent = converted.toFixed(1);
    }
    if (unitEl) {
      const state = BootNav.getState();
      unitEl.textContent = state.speedUnit === 'kn' ? 'kn' : 'km/h';
    }
  }

  // 3. Auf GPS-Positionsupdates reagieren
  BootNav.onPositionUpdate(function(pos) {
    if (pos && typeof pos.speed === 'number' && pos.speed > 0) {
      totalSpeed += pos.speed;
      sampleCount++;
      const avg = totalSpeed / sampleCount;
      updateDisplay(avg);
    }
  });

})();
