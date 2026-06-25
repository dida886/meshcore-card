export const MESSAGE_STYLES: string = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  ha-card {
    padding: 20px;
    font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif);
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
    background: transparent;
    box-shadow: none;
  }

  .section-header {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    margin: 14px 0 8px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.2);
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    opacity: 0.7;
  }
  .section-header:first-of-type {
    margin-top: 0;
  }

  .radio-group {
    display: flex;
    gap: 12px;
    margin: 12px 0 16px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border-radius: 24px;
    padding: 4px;
    border: 1px solid rgba(128, 128, 128, 0.1);
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    padding: 8px 12px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    color: var(--secondary-text-color);
  }
  .radio-option:hover {
    background: rgba(128, 128, 128, 0.08);
  }
  .radio-option.selected {
    background: rgba(74, 222, 128, 0.12);
    color: var(--mesh-green);
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.3);
  }
  .radio-option input {
    margin: 0;
    cursor: pointer;
    accent-color: var(--mesh-green);
  }

  .input-group {
    margin-bottom: 16px;
  }
  .label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 500;
    color: var(--secondary-text-color);
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }
  select, textarea {
    width: 100%;
    padding: 10px 14px;
    border-radius: 16px;
    border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
    background: var(--ha-card-background, var(--card-background-color, #2c2c3a));
    color: var(--primary-text-color);
    font-family: inherit;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  select option {
    background: var(--ha-card-background, var(--card-background-color, #2c2c3a));
    color: var(--primary-text-color);
  }
  select:focus, textarea:focus {
    outline: none;
    border-color: var(--mesh-green);
  }
  textarea {
    resize: vertical;
  }

  button {
    width: 100%;
    padding: 12px 16px;
    border: none;
    border-radius: 24px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
    font-size: 14px;
    background: linear-gradient(135deg, var(--mesh-green), #3b8c3e);
    color: white;
    margin: 16px 0 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  button:hover {
    transform: translateY(-1px);
    background: linear-gradient(135deg, #5ee090, #2f6e32);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .status {
    font-size: 12px;
    text-align: center;
    padding: 8px;
    border-radius: 20px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    margin: 12px 0 8px;
  }

  .messages-section {
    margin-top: 20px;
    border-top: 1px solid rgba(128, 128, 128, 0.15);
    padding-top: 12px;
  }
  .messages-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--secondary-text-color);
    margin-bottom: 12px;
  }
  .refresh-btn {
    margin-left: auto;
    cursor: pointer;
    padding: 6px;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.05);
    transition: all 0.2s ease;
  }
  .refresh-btn:hover {
    background: rgba(128, 128, 128, 0.15);
    transform: rotate(15deg);
  }

  .message-link {
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
    text-decoration: underline;
    transition: color 0.2s;
  }
  .message-link:hover {
    color: var(--accent-color, #1e88e5);
    text-decoration: none;
  }
  .message-link:active {
    opacity: 0.7;
  }

  /* ---------- Mention highlight ---------- */
  .mention {
    background: rgba(255, 215, 0, 0.2);
    color: #ffd700;
    padding: 1px 6px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
  }

  .messages-list {
    max-height: 300px;
    overflow-y: auto;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.02);
    backdrop-filter: blur(2px);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px 4px;
  }

  /* ---------- NOWA KARTA WIADOMOŚCI ---------- */
  .message-item {
    cursor: default;
    transition: transform 0.15s ease;
  }
  .message-item:hover {
    transform: translateY(-1px);
  }

  .message-card {
    background: var(--ha-card-background, var(--card-background-color, #2c2c3a));
    border-radius: 20px;
    padding: 10px 10px 10px;
    border: 1px solid rgba(128, 128, 128, 0.1);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
    backdrop-filter: blur(10px);
  }
  .message-card:hover {
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
    border-color: rgba(128, 128, 128, 0.15);
  }

  /* ---------- Nagłówek ---------- */
  .message-header {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.08);
  }

  /* Dla odebranych: nadawca po lewej, czas po prawej (domyślnie) */
  .message-card.received .message-header {
    flex-direction: row-reverse;
    justify-content: space-between;
  }

  /* Dla wysłanych: nadawca po prawej, czas po lewej */
  .message-card.sent .message-header {
    flex-direction: row;
    justify-content: space-between;
  }

  .message-time {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.6;
    flex-shrink: 0;
  }
  .message-time ha-icon {
    --mdc-icon-size: 14px;
  }

  .message-sender {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .message-sender.sent {
    color: var(--mesh-green);
  }
  .message-sender.received {
    color: var(--mesh-blue);
  }
  .message-sender ha-icon {
    --mdc-icon-size: 20px;
  }

  /* ---------- Treść wiadomości ---------- */
  .message-body {
    display: flex;
    padding: 4px 0 4px 0;
  }

  /* Wiadomości odebrane – dymek po lewej */
  .message-card.received .message-body {
    justify-content: flex-start;
  }

  /* Wiadomości wysłane – dymek po prawej */
  .message-card.sent .message-body {
    justify-content: flex-end;
  }

  .message-bubble {
    background: rgba(128, 128, 128, 0.06);
    border-radius: 16px;
    padding: 10px 18px;
    max-width: 85%;
    border: 1px solid rgba(128, 128, 128, 0.08);
    transition: background 0.2s ease;
  }
  .message-bubble:hover {
    background: rgba(128, 128, 128, 0.1);
  }

  /* Wysłane wiadomości – zielonkawy dymek */
  .message-card.sent .message-bubble {
    background: rgba(74, 222, 128, 0.08);
    border-color: rgba(74, 222, 128, 0.15);
  }
  .message-card.sent .message-bubble:hover {
    background: rgba(74, 222, 128, 0.12);
  }

  /* Odebrane wiadomości – niebieskawy dymek */
  .message-card.received .message-bubble {
    background: rgba(96, 165, 250, 0.06);
    border-color: rgba(96, 165, 250, 0.1);
  }
  .message-card.received .message-bubble:hover {
    background: rgba(96, 165, 250, 0.1);
  }

  .message-bubble .message-text {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
    color: var(--primary-text-color);
    word-break: break-word;
  }

  /* ---------- Metryki ---------- */
  .message-metrics {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-top: 5px;
    padding-top: 10px;
    border-top: 1px solid rgba(128, 128, 128, 0.08);
    cursor: pointer;
    user-select: none;
    border-radius: 0;
    background: transparent;
    transition: opacity 0.2s ease;
    min-width: 0;
  }
  .message-metrics:hover {
    opacity: 1;
  }

  .metrics-group {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .metric-item {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(128, 128, 128, 0.04);
    padding: 3px 8px;
    border-radius: 8px;
    transition: background 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .metric-item:hover {
    background: rgba(128, 128, 128, 0.08);
  }

  .metric-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .metric-icon svg {
    width: 14px;
    height: 14px;
    opacity: 0.5;
  }

  .metric-value {
    font-size: 12px;
    font-weight: 600;
    font-family: var(--paper-font-code1_-_font-family, monospace);
    color: var(--primary-text-color);
    opacity: 0.7;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .message-metrics .metric-toggle {
    flex-shrink: 0;
    font-size: 16px;
    font-weight: 700;
    opacity: 0.5;
    padding: 0 4px;
    margin-left: 8px;
    transition: transform 0.3s ease, opacity 0.2s ease;
    color: var(--secondary-text-color);
  }
  .message-metrics .metric-toggle:hover {
    opacity: 0.8;
  }
  .message-metrics.expanded .metric-toggle {
    transform: rotate(90deg);
  }

  /* ---------- Path ---------- */
  .message-path {
    display: none;
    margin-top: 4px;
    padding: 6px 12px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.6;
    background: rgba(128, 128, 128, 0.03);
    border-radius: 8px;
    border-left: 2px solid rgba(128, 128, 128, 0.15);
    word-break: break-all;
    transition: opacity 0.25s ease;
    text-align: center;
    width: 100%;
  }
  .message-path.expanded {
    display: block;
    opacity: 0.8;
  }
  .message-path .path-value {
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: var(--primary-text-color);
  }

  /* ---------- Puste / błędy ---------- */
  .empty-messages {
    text-align: center;
    padding: 32px 20px;
    color: var(--secondary-text-color);
    font-size: 12px;
  }

  .author-info {
    font-size: 10px;
    color: var(--secondary-text-color);
    text-align: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(128, 128, 128, 0.12);
    opacity: 0.6;
  }

  /* ---------- Scrollbar ---------- */
  .messages-list::-webkit-scrollbar {
    width: 6px;
  }
  .messages-list::-webkit-scrollbar-track {
    background: rgba(128, 128, 128, 0.05);
    border-radius: 3px;
  }
  .messages-list::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.2);
    border-radius: 3px;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .loading-spinner ha-icon {
    animation: spin 1s linear infinite;
  }

  /* ---------- Responsywność ---------- */
  @media (max-width: 480px) {
    .message-card {
      padding: 8px 8px 8px;
    }
    .message-bubble .message-text {
      font-size: 14px;
    }
    .message-bubble {
      padding: 8px 12px;
      max-width: 90%;
    }
    .metric-value {
      font-size: 11px;
    }
    .metrics-group {
      gap: 4px;
    }
    .metric-item {
      padding: 2px 6px;
    }
    .metric-icon svg {
      width: 12px;
      height: 12px;
    }
    .metric-toggle {
      margin-left: 4px;
    }
    .message-sender {
      font-size: 12px;
    }
    .message-time {
      font-size: 10px;
    }
  }

  @media (max-width: 380px) {
    .message-header {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 4px;
    }
    .message-card.sent .message-header {
      align-items: flex-end !important;
    }
    .message-sender {
      align-self: flex-start;
    }
    .message-card.sent .message-sender {
      align-self: flex-end;
    }
    .metrics-group {
      flex-wrap: wrap;
      gap: 4px;
    }
    .metric-item {
      white-space: normal;
      font-size: 10px;
    }
  }
`;