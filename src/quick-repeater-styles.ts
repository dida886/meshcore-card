export const QUICK_REPEATER_STYLES = `
  /* ============================================ */
  /* QUICK REPEATER – wszystkie klasy z prefiksem .qr- */
  /* ============================================ */

  .qr-repeater-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .qr-repeater-card {
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(128, 128, 128, 0.1);
    border-radius: 18px;
    padding: 12px 14px;
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }
  .qr-repeater-card:hover {
    transform: translateY(-1px);
    background: rgba(128, 128, 128, 0.07);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .qr-repeater-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
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
    background: var(--mesh-green);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  }
  .qr-status-dot.offline {
    background: var(--secondary-text-color);
    opacity: 0.4;
  }
  .qr-status-dot.warning {
    background: var(--mesh-orange);
    box-shadow: 0 0 8px rgba(251, 146, 60, 0.5);
  }

  .qr-repeater-name {
    font-weight: 600;
    font-size: 1rem;
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
    font-weight: 600;
  }
  .qr-header-uptime {
    opacity: 0.7;
  }

  .qr-repeater-metrics {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-bottom: 6px;
    padding-left: 4px;
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
    padding: 4px 0 4px 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--secondary-text-color);
    cursor: pointer;
    user-select: none;
    border-top: 1px solid rgba(128, 128, 128, 0.1);
    margin-top: 6px;
    padding-top: 8px;
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
    padding-left: 4px;
    margin-top: 4px;
    display: none;
    flex-direction: column;
    gap: 4px;
  }
  .qr-neighbors-list.expanded {
    display: flex;
  }

  .qr-neighbor-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.05);
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
    max-width: 300px;
  }

  .qr-neighbor-snr {
    font-weight: 600;
    padding: 0 4px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .qr-neighbor-snr.green { color: var(--mesh-green); }
  .qr-neighbor-snr.yellow { color: var(--mesh-orange); }
  .qr-neighbor-snr.orange { color: #f97316; }
  .qr-neighbor-snr.red { color: var(--error-color); }

  .qr-neighbor-stats {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.7;
    padding-left: 0px;
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

  /* ── RESPONSYWNOŚĆ ── */
  @media (max-width: 500px) {
    .qr-repeater-header {
      flex-wrap: wrap;
    }
    .qr-header-right {
      margin-left: auto;
      font-size: 11px;
    }
    .qr-repeater-metrics {
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
    }
    .qr-metrics-left, .qr-metrics-right {
      justify-content: flex-start;
    }
    .qr-metrics-right {
      justify-content: flex-start;
    }
    .qr-neighbors-list {
      padding-left: 4px;
    }
    .qr-neighbor-stats {
      font-size: 10px;
      gap: 8px;
      flex-wrap: wrap;
    }
    .qr-repeater-card {
      padding: 10px 12px;
    }
  }
`;