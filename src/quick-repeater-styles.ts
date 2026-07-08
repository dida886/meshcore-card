export const QUICK_REPEATER_STYLES = `
  /* ============================================ */
  /* QUICK REPEATER – wszystkie klasy z prefiksem .qr- */
  /* ============================================ */

  .qr-repeater-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .qr-repeater-card {
    background: transparent;
    border: 1px solid var(--glass-border);
    border-radius: 22px;
    padding: 14px 16px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .qr-repeater-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.2);
  }

  /* ── HEADER ── */
  .qr-repeater-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    cursor: pointer;
  }

  .qr-status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
    display: inline-block;
  }
  .qr-status-dot.online {
    background: #46f58a;
    box-shadow: 0 0 10px rgba(70, 245, 138, 0.95);
  }
  .qr-status-dot.offline {
    background: var(--error-color, #f44336);
    box-shadow: 0 0 8px rgba(248, 113, 113, 0.6);
  }
  .qr-status-dot.warning {
    background: var(--mesh-orange);
    box-shadow: 0 0 8px rgba(251, 146, 60, 0.5);
  }

  .qr-repeater-name {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--primary-text-color);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .qr-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--secondary-text-color);
    white-space: nowrap;
  }

  .qr-header-battery {
    font-weight: 700;
    border-radius: 999px;
    padding: 4px 8px;
    background: transparent;
    border: none;
  }
  .qr-header-uptime {
    opacity: 0.78;
    border-radius: 999px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    font-family: var(--paper-font-code1_-_font-family, monospace);
  }

  /* ── METRYKI – POZIOM W JEDNEJ LINII ── */
  .qr-repeater-metrics {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-bottom: 8px;
    padding-left: 0px;
  }

  .qr-metrics-left {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
  }

  .qr-metrics-right {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    flex-shrink: 0;
    /* ✅ justify-content: space-between automatycznie przykleja do prawej */
  }

  .qr-metric {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .qr-metric ha-icon {
    --mdc-icon-size: 14px;
  }
  .qr-metric-value {
    font-weight: 500;
    color: var(--primary-text-color);
  }

  /* ── SĄSIEDZI ── */
  .qr-neighbors-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0 4px 0;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hub-section-text);
    cursor: pointer;
    user-select: none;
    margin-top: 6px;
    padding-top: 6px;
    border-top: none;
  }
  .qr-neighbors-header::after {
    content: "";
    flex: 1 1 auto;
    min-width: 16px;
    height: 1px;
    background: var(--hub-section-line);
  }
  .qr-neighbors-header:hover {
    color: var(--primary-text-color);
  }
  .qr-neighbors-header .qr-toggle-icon {
    transition: transform 0.2s;
    font-size: 16px;
  }
  .qr-neighbors-header .qr-toggle-icon.expanded {
    transform: rotate(90deg);
  }
  .qr-neighbors-count {
    background: rgba(128, 128, 128, 0.15);
    padding: 0 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .qr-neighbors-list {
    padding-left: 0px;
    margin-top: 4px;
    display: none;
    flex-direction: column;
    gap: 4px;
  }
  .qr-neighbors-list.expanded {
    display: flex;
  }

  /* ── WIERSZ SĄSIADA ── */
  .qr-neighbor-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 8px;
    border: 1px solid rgba(120, 150, 220, 0.14);
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    cursor: pointer;
  }
  .qr-neighbor-row:last-child {
    border-bottom: none;
  }

  .qr-neighbor-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .qr-neighbor-name {
    font-weight: 500;
    color: var(--primary-text-color);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ✅ SNR do prawej */
  .qr-neighbor-snr {
    font-weight: 600;
    padding: 0 4px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: auto;
  }
  .qr-neighbor-snr.green { color: #22c55e;  }
  .qr-neighbor-snr.yellow { color:  #eab308; }
  .qr-neighbor-snr.orange { color: #f97316; }
  .qr-neighbor-snr.red { color: #ef4444;  }

  /* ✅ Statystyki wyśrodkowane */
  .qr-neighbor-stats {
    display: flex;
    justify-content: left;
    gap: 12px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.7;
    flex-wrap: wrap;
  }

  .qr-neighbor-stat {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /* ── INNE ── */
  .qr-empty {
    text-align: center;
    padding: 30px 0;
    color: var(--secondary-text-color);
    font-size: 14px;
  }

  .qr-section-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--secondary-text-color);
    padding: 8px 0 4px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.1);
    margin-bottom: 10px;
  }

  /* ── RESPONSYWNOŚĆ – DLA TELEFONÓW ── */
  @media (max-width: 768px) {
    .qr-repeater-card {
      padding: 10px 12px;
    }

    .qr-repeater-header {
      flex-wrap: wrap;
      gap: 6px;
    }

    .qr-repeater-name {
      font-size: 0.9rem;
    }

    .qr-header-right {
      font-size: 11px;
      gap: 6px;
      margin-left: auto;
    }

    /* ✅ POZIOM – NIE ZMIENIAMY NA KOLUMNĘ */
    .qr-repeater-metrics {
      gap: 4px 10px;
      padding-left: 0px;
      font-size: 11px;
      flex-wrap: wrap;
    }

    .qr-metrics-left {
      gap: 4px 8px;
    }
    .qr-metrics-right {
      gap: 4px 8px;
    }

    .qr-metric ha-icon {
      --mdc-icon-size: 12px;
    }
    .qr-metric-value {
      font-size: 11px;
    }

    .qr-neighbors-header {
      font-size: 12px;
      padding: 3px 0 3px 0px;
      margin-top: 4px;
      padding-top: 6px;
    }
    .qr-neighbors-header .qr-toggle-icon {
      font-size: 14px;
    }
    .qr-neighbors-count {
      font-size: 10px;
    }

    .qr-neighbors-list {
      padding-left: 0px;
      gap: 2px;
    }

    .qr-neighbor-row {
      padding: 3px 4px;
    }

    .qr-neighbor-name {
      font-size: 12px;
    }

    .qr-neighbor-snr {
      font-size: 12px;
    }

    .qr-neighbor-stats {
      font-size: 10px;
      gap: 8px;
      justify-content: left;
    }

    .qr-neighbor-stat {
      font-size: 10px;
    }
  }

  /* ── RESPONSYWNOŚĆ – DLA BARDZO MAŁYCH EKRANÓW ── */
  @media (max-width: 400px) {
    .qr-repeater-card {
      padding: 8px 10px;
    }

    .qr-repeater-name {
      font-size: 0.85rem;
    }

    .qr-header-right {
      font-size: 10px;
      gap: 4px;
    }

    .qr-repeater-metrics {
      font-size: 10px;
      gap: 3px 8px;
      padding-left: 0px;
    }

    .qr-metrics-left {
      gap: 3px 6px;
    }
    .qr-metrics-right {
      gap: 3px 6px;
    }

    .qr-metric-value {
      font-size: 10px;
    }

    .qr-neighbors-header {
      font-size: 11px;
      padding-left: 0px;
    }

    .qr-neighbors-list {
      padding-left: 0px;
    }

    .qr-neighbor-name {
      font-size: 11px;
    }

    .qr-neighbor-snr {
      font-size: 11px;
    }

    .qr-neighbor-stats {
      font-size: 9px;
      gap: 6px;
      justify-content: left;
    }

    .qr-neighbor-stat {
      font-size: 9px;
    }
  }
  .qr-repeater-card.offline {
    opacity: 0.5;
    filter: grayscale(0.2);
  }
`;