export const STYLES: string = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ============================================ */
  /* GLOBALNE ZMIENNE I KOLORY */
  /* ============================================ */
  :host {
    --mesh-green: #4ade80;
    --mesh-blue: #60a5fa;
    --mesh-orange: #fb923c;
    --mesh-red: #f87171;
    --mesh-purple: #a78bfa;
    --glass-border: rgba(128, 128, 128, 0.15);
    --glass-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    --glass-shadow-hover: 0 6px 16px rgba(0, 0, 0, 0.1);
    --hub-tech-text: var(--primary-text-color);
    --hub-secondary-text: var(--secondary-text-color);
    --hub-section-text: var(--secondary-text-color);
    --hub-section-line: linear-gradient(90deg, rgba(92, 122, 160, 0.38), rgba(92, 122, 160, 0.08));
    --hub-location-bg: linear-gradient(165deg, #081122, #0a1529 52%, #09111e);
    --hub-location-grid-line: rgba(82, 124, 171, 0.15);
    --hub-location-grid-line-2: rgba(82, 124, 171, 0.12);
    --hub-location-preview-border: rgba(88, 118, 160, 0.28);
  }

  ha-card {
    padding: 20px;
    font-family: var(--paper-font-body1_-_font-family, var(--primary-font-family, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, sans-serif));
    font-size: var(--paper-font-body1_-_font-size, 14px);
    color: var(--primary-text-color);
    background: transparent;
    box-shadow: none;
  }

  /* Hub / Node shared */
  .hw-info { 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    opacity: 0.65;
    margin: 4px 0 6px; 
    letter-spacing: -0.01em;
  }

  /* ===== ZMIANA: Hub name – teraz taki sam jak node-name ===== */
  .hub-name {
    font-size: 1.38rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    display: inline-block;
    position: relative;
    z-index: 1;
    filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.28));
  }
  .node-name,
  .hub-name {
    text-transform: none;
  }
  .node-name::first-letter,
  .hub-name::first-letter {
    text-transform: uppercase;
  }
  
  .count-badge {
    font-size: 10px;
    font-weight: 600;
    background: transparent;
    padding: 2px 10px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    color: var(--secondary-text-color);
    letter-spacing: -0.01em;
    transition: all 0.2s ease;
  }
  .count-badge:hover {
    transform: scale(1.02);
  }
  
  .node-key { 
    font-family: var(--paper-font-code1_-_font-family, 'SF Mono', 'JetBrains Mono', monospace); 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    opacity: 0.6;
  }

  /* Status dots */
  .status-dot { 
    width: 11px; 
    height: 11px; 
    border-radius: 50%; 
    flex-shrink: 0; 
    display: inline-block;
    position: relative;
    overflow: visible;
    transition: box-shadow 0.3s ease;
  }
  .dot-online  { 
    background: #46f58a;
    box-shadow: 0 0 10px rgba(70, 245, 138, 0.95);
  }
  .dot-online::before,
  .dot-online::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    border: 2px solid rgba(70, 245, 138, 0.62);
    transform: translate(-50%, -50%) scale(1);
    opacity: 0;
    pointer-events: none;
  }
  .dot-online::before {
    animation: radar-pulse 1.9s ease-out infinite;
  }
  .dot-online::after {
    animation: radar-pulse 1.9s ease-out infinite 0.95s;
  }
  .dot-offline { 
    background: var(--secondary-text-color); 
    opacity: 0.4;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.8); }
  }
  @keyframes radar-pulse {
    0% {
      transform: translate(-50%, -50%) scale(1);
      opacity: 0.7;
    }
    70% {
      opacity: 0.2;
    }
    100% {
      transform: translate(-50%, -50%) scale(2.8);
      opacity: 0;
    }
  }

  /* Status text */
  .status-text {
    font-size: var(--paper-font-body1_-_font-size, 14px);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .status-text.online {
    color: #46f58a;
    text-shadow: 0 0 8px rgba(70, 245, 138, 0.5);
  }
  .status-text.offline { color: var(--secondary-text-color); opacity: 0.6; }

  /* Progress bars */
  .bar-row { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    margin: 12px 0 4px; 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
  }
  .bar-label { 
    display: flex; 
    align-items: center; 
    gap: 5px; 
    color: var(--secondary-text-color);
    opacity: 0.7;
  }
  .bar-label-right { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
  }
  .bar-val { 
    font-weight: 700; 
    color: var(--primary-text-color);
  }
  .bar-track { 
    height: 8px; 
    border-radius: 999px; 
    background: var(--glass-border);
    overflow: hidden; 
    margin-bottom: 8px; 
  }
  .bar-fill { 
    height: 100%; 
    border-radius: 999px; 
    transition: width 0.6s cubic-bezier(0.2, 0.9, 0.4, 1.1);
    box-shadow: 0 0 6px rgba(74, 222, 128, 0.3);
  }

  /* Hub battery */
  .hub-battery-panel {
    --hub-battery-color: #38ef7d;
    margin: 10px 0 8px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(56, 239, 125, 0.28);
    background: transparent;
    box-shadow:
      inset 0 0 28px rgba(56, 239, 125, 0.1),
      0 6px 18px rgba(0, 0, 0, 0.28);
    display: grid;
    grid-template-columns: minmax(84px, auto) minmax(0, 1fr);
    align-items: center;
    gap: 14px;
  }
  .hub-battery-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .hub-battery-label {
    font-size: 11px;
    color: var(--hub-secondary-text);
    letter-spacing: 0.02em;
  }
  .hub-battery-percent {
    font-size: 34px;
    line-height: 1;
    font-weight: 800;
    color: var(--hub-battery-color);
    text-shadow: 0 0 10px rgba(56, 239, 125, 0.6);
  }
  .hub-battery-voltage {
    font-size: 12px;
    font-family: var(--paper-font-code1_-_font-family, monospace);
    color: var(--hub-secondary-text);
  }
  .hub-battery-shell {
    position: relative;
    height: 34px;
    border-radius: 10px;
    padding: 3px;
    border: 1px solid rgba(136, 255, 197, 0.06);
    background: linear-gradient(180deg, rgba(13, 23, 34, 0.72), rgba(7, 14, 22, 0.72));
    box-shadow:
      inset 0 0 8px rgba(56, 239, 125, 0.06),
      inset 0 0 0 1px rgba(255, 255, 255, 0.02),
      0 0 6px rgba(56, 239, 125, 0.04);
    overflow: visible;
    display: flex;
    align-items: center;
  }
  .hub-battery-fill-wrap {
    position: relative;
    height: 100%;
    width: 100%;
    flex: 1 1 auto;
    border-radius: 7px;
    overflow: hidden;
    background: rgba(2, 8, 14, 0.28);
  }
  .hub-battery-fill {
    position: absolute;
    inset: 0 auto 0 0;
    min-width: 0;
    border-radius: 7px;
    background:
      linear-gradient(90deg, rgba(69, 255, 165, 0.18) 0%, rgba(69, 255, 165, 0.78) 45%, rgba(153, 255, 205, 0.96) 100%);
    box-shadow:
      inset 0 0 10px rgba(231, 255, 244, 0.3),
      0 0 8px rgba(69, 255, 165, 0.5);
    transition: width 1s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: width;
  }
  .hub-battery-fill::before {
    content: "";
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      90deg,
      rgba(173, 255, 220, 0) 0,
      rgba(173, 255, 220, 0.38) 7px,
      rgba(173, 255, 220, 0) 14px
    );
    background-size: 14px 100%;
    animation: hub-battery-streak 2.4s linear infinite;
    opacity: 0.9;
  }
  .hub-battery-fill::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: -12px;
    width: 14px;
    background: radial-gradient(circle at center, rgba(222, 255, 241, 0.92), rgba(222, 255, 241, 0));
    filter: blur(0.3px);
  }
  .hub-battery-tip {
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
    width: 5px;
    height: 14px;
    border-radius: 0 4px 4px 0;
    background: linear-gradient(180deg, rgba(92, 102, 114, 0.96), rgba(42, 49, 57, 0.96));
    border: 1px solid rgba(255, 255, 255, 0.34);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.12),
      0 0 4px rgba(0, 0, 0, 0.14);
  }
  @keyframes hub-battery-streak {
    from { background-position: 0 0; }
    to { background-position: 14px 0; }
  }

  /* Chips */
  .chip-row, .node-chip-row { 
    display: flex; 
    flex-wrap: wrap; 
    gap: 8px; 
    margin: 6px 0; 
  }
  .chip {
    display: inline-flex; 
    align-items: center; 
    gap: 4px;
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    font-weight: 500;
    background: transparent;
    padding: 6px 14px; 
    border-radius: 20px;
    color: var(--primary-text-color);
    border: 1px solid var(--glass-border);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .chip:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
  .chip-label { 
    color: var(--secondary-text-color); 
    font-weight: 400; 
    opacity: 0.7;
  }

  /* RF chips */
  .rf-row { 
    display: flex; 
    justify-content: center;
    flex-wrap: nowrap;
    gap: 12px; 
    margin: 6px 0 8px;
    overflow-x: auto;
    padding: 2px 0 6px 0;
  }
  .rf-chip { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    padding: 4px 8px; 
    border-radius: 16px; 
    background: transparent;
    color: var(--secondary-text-color);
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.2s ease;
    border: 1px solid var(--glass-border);
  }
  .rf-chip:hover {
    transform: translateY(-1px);
  }

  .hub-tech-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: stretch;
    border-bottom: 1px solid rgba(120, 150, 220, 0.14);
    margin-top: 6px;
    padding: 2px 0 4px;
    background: transparent;
  }
  .hub-tech-row::before,
  .hub-tech-row::after {
    content: "";
    grid-column: 1 / -1;
    height: 1px;
    opacity: 0;
  }
  .hub-tech-item {
    min-width: 0;
    padding: 8px 10px 7px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: transparent;
    border-radius: 12px;
    border: 1px solid rgba(120, 150, 220, 0.14);
    box-shadow:
      0 8px 18px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    transform: translateY(0);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .hub-tech-item + .hub-tech-item {
    border-left: 1px solid rgba(120, 150, 220, 0.16);
  }
  .hub-tech-item:hover {
    transform: translateY(-2px);
    border-color: rgba(120, 150, 220, 0.22);
    box-shadow:
      0 12px 24px rgba(0, 0, 0, 0.16),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }
  .hub-tech-main {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .hub-tech-main ha-icon {
    --mdc-icon-size: 14px;
    color: #9fc8ff;
    opacity: 0.8;
  }
  .hub-tech-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--hub-tech-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--paper-font-code1_-_font-family, monospace);
  }
  .hub-tech-label {
    margin-left: 20px;
    font-size: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--hub-tech-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* MQTT pills */
  .mqtt-row { 
    display: flex; 
    flex-wrap: wrap; 
    align-items: center; 
    justify-content: center;
    gap: 6px; 
    margin: 6px 0; 
  }
  .mqtt-label { 
    font-size: 10px; 
    color: var(--secondary-text-color); 
    font-weight: 600; 
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .mqtt-pill { 
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 16px;
    font-weight: 500; 
    text-transform: capitalize;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    border: 1px solid var(--glass-border);
    white-space: nowrap;
    background: transparent;
    position: relative;
    z-index: 1;
    box-shadow:
      0 8px 18px rgba(0, 0, 0, 0.10),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  }
  .mqtt-pill:hover {
    transform: translateY(-1px);
  }
  .mqtt-pill.ok.clickable {
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.14),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    background: rgba(18, 28, 21, 0.5);
  }
  .mqtt-pill.ok  { 
    color: var(--mesh-green); 
    border-color: rgba(74, 222, 128, 0.4);
  }
  .mqtt-pill.err { 
    color: var(--mesh-red); 
    border-color: rgba(248, 113, 113, 0.4);
  }

  /* Color helpers */
  .green  { color: var(--mesh-green); }
  .yellow { color: var(--mesh-orange); }
  .red    { color: var(--mesh-red); }
  .blue   { color: var(--mesh-blue); }
  .orange { color: var(--mesh-orange); }
  .dim    { color: var(--secondary-text-color); opacity: 0.5; }

  /* Clickable */
  .clickable { cursor: pointer; transition: opacity 0.2s ease; }
  .clickable:hover { opacity: 0.7; }

  /* Sections */
  .section-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--hub-section-text);
    margin: 8px 0 8px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--glass-border);
    opacity: 0.88;
  }
  .section-header:first-of-type {
    margin-top: 0;
  }
  .hub-section-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    width: 100%;
    border-bottom: none;
    text-shadow: 0 0 0 black;
  }
  .hub-section-header::after {
    content: "";
    flex: 1 1 auto;
    min-width: 16px;
    height: 1px;
    background: var(--hub-section-line);
  }
  .hub-tech-header {
    color: var(--hub-section-text);
  }
  .hub-tech-header ha-icon {
    --mdc-icon-size: 12px;
    color: #2fe28f;
    filter: drop-shadow(0 0 4px rgba(47, 226, 143, 0.45));
  }

  /* Nodes section */
  .nodes-section { margin-top: 8px; }
  .section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--secondary-text-color);
    padding: 8px 2px 6px;
    text-transform: uppercase;
    opacity: 0.7;
  }

  /* Node block - systemowe tło */
  .node-block { 
    padding: 16px 18px 14px; 
    border-radius: 24px; 
    margin-bottom: 18px; 
    background: transparent;
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    position: relative;
    animation: hub-card-breathe 5.2s ease-in-out infinite;
  }
  .node-block:hover {
    transform: translateY(-2px);
    box-shadow: var(--glass-shadow-hover);
  }
  
  .node-offline { 
    opacity: 0.5;
    filter: grayscale(0.2);
  }

  .node-header { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    flex-wrap: wrap; 
    gap: 10px; 
  }
  .node-left { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    flex-wrap: wrap; 
    flex: 1; 
    min-width: 0; 
  }
  .node-right { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    flex-wrap: wrap; 
  }
  .hub-hero {
    display: block;
    border: none;
    border-radius: 26px;
    padding: 14px;
    background: transparent;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }
  .hub-hero-left {
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    align-items: center;
  }
  .hub-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .node-top-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    flex-wrap: nowrap;
    width: fit-content;
    margin: 0 auto;
  }
  .node-top-left,
  .node-top-right {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .node-top-left {
    flex: 0 0 auto;
  }
  .node-top-right {
    justify-content: flex-end;
    flex: 0 0 auto;
  }
  .node-temp-pill {
    white-space: nowrap;
  }
  .hub-online-pill {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    padding: 6px 12px;
    background: rgba(13, 37, 29, 0.65);
    border: 1px solid rgba(70, 245, 138, 0.22);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    animation: hub-levitate-a 3.8s ease-in-out infinite;
  }
  .hub-uptime-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 11px;
    line-height: 1;
    color: #c8d8ea;
    background: transparent;
    border: none;
    white-space: nowrap;
    font-family: var(--paper-font-code1_-_font-family, monospace);
  }
  .hub-main-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
    padding: 0px 0px 0px 4px;
  }
  .hub-title-line {
    animation: hub-levitate-b 4.2s ease-in-out infinite;
  }
  .hub-title-line {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .hub-id-pill {
    font-size: 11px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 999px;
    border: none;
    color: rgba(184, 201, 224, 0.88);
    background: transparent;
    font-family: var(--paper-font-code1_-_font-family, monospace);
    animation: hub-levitate-b 4.4s ease-in-out infinite;
  }
  .hub-meta-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-left: 0;
    justify-content: center;
  }
  .hub-meta-pill {
    font-size: 11px;
    padding: 5px 9px;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: #b9cce4;
    animation: hub-levitate-c 4.1s ease-in-out infinite;
  }
  .hub-type-pill {
    font-size: 13px;
    font-weight: 700;
    color: #f6a432;
    border: 1px solid rgba(246, 164, 50, 0.5);
    border-radius: 999px;
    padding: 6px 14px;
    background: rgba(27, 20, 7, 0.6);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    animation: hub-levitate-d 3.6s ease-in-out infinite;
  }
  .node-name {
    font-size: 1.15rem;
    font-weight: 900;
    letter-spacing: -0.02em;
    text-transform: none;
    word-break: break-word;
    flex: 1;
    min-width: 0;
    display: inline-block;
    position: relative;
    z-index: 1;
    text-shadow:
      0 6px 14px rgba(0, 0, 0, 0.55),
      0 1px 0 rgba(255, 255, 255, 0.04);
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35));
  }
  .type-badge {
    font-size: var(--paper-font-caption_-_font-size, 11px);
    color: var(--mesh-orange);
    background: transparent;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 700;
    border: 1px solid rgba(251, 146, 60, 0.3);
    transition: all 0.2s ease;
  }
  .type-badge:hover {
    transform: translateY(-1px);
  }
  .node-header-badge {
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 20px;
    background: transparent;
    white-space: nowrap;
    font-weight: 500;
    letter-spacing: -0.01em;
    border: 1px solid var(--glass-border);
  }

  .badge { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    padding: 3px 10px; 
    border-radius: 20px; 
    background: transparent;
    color: var(--secondary-text-color); 
    font-weight: 500; 
    border: 1px solid var(--glass-border);
  }
  .badge.green  { color: var(--mesh-green); border-color: rgba(74, 222, 128, 0.3); }
  .badge.yellow { color: var(--mesh-orange); border-color: rgba(251, 146, 60, 0.3); }
  .badge.red    { color: var(--mesh-red); border-color: rgba(248, 113, 113, 0.3); }

  .node-route { 
    font-size: var(--paper-font-caption_-_font-size, 11px); 
    color: var(--secondary-text-color); 
    padding-left: 14px; 
    font-family: var(--paper-font-code1_-_font-family, monospace); 
    margin: 4px 0 8px; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    white-space: nowrap;
    opacity: 0.6;
  }

  /* Signal row */
  .signal-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 8px 0 6px;
    padding: 8px 12px;
    background: rgba(128, 128, 128, 0.03);
    border-radius: 16px;
    border: 1px solid rgba(128, 128, 128, 0.06);
    gap: 20px;
    flex-wrap: wrap;
  }

  .signal-left {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
  }

  .signal-right {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .signal-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 13px;
  }
  .signal-label {
    font-weight: 500;
    color: var(--secondary-text-color);
    opacity: 0.7;
  }
  .signal-value {
    font-weight: 700;
    font-family: monospace;
    font-size: 14px;
  }

  /* Hub signal cards */
  .hub-signal-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
    background: transparent;
    border: none;
    padding: 0;
    margin-top: 10px;
  }
  .signal-card {
    border-radius: 12px;
    border: 1px solid rgba(120, 150, 220, 0.16);
    background: transparent;
    padding: 10px;
    display: flex;
    flex-direction: column;
    min-width: 0;
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    transform: translateY(0);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .signal-card:hover {
    transform: translateY(-2px);
    border-color: rgba(120, 150, 220, 0.24);
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }
  .signal-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }
  .signal-card .signal-label {
    font-size: 9px;
    letter-spacing: 0.03em;
    opacity: 0.9;
  }
  .signal-gauge-wrap {
    position: relative;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .signal-gauge {
    width: 100%;
    height: 72px;
  }
  .signal-gauge-track {
    fill: none;
    stroke: rgba(200, 214, 255, 0.18);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .signal-gauge-progress {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
    transition: stroke-dasharray 0.45s ease;
    filter: drop-shadow(0 0 4px currentColor);
  }
  .signal-gauge.rssi .signal-gauge-progress,
  .signal-sparkline.rssi polyline {
    stroke: #35e27d;
    color: #35e27d;
  }
  .signal-gauge.snr .signal-gauge-progress,
  .signal-sparkline.snr polyline {
    stroke: #2dd4ff;
    color: #2dd4ff;
  }
  .signal-gauge.noise .signal-gauge-progress,
  .signal-sparkline.noise polyline {
    stroke: #8b5cf6;
    color: #8b5cf6;
  }
  .signal-gauge-value {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    line-height: 1;
    white-space: nowrap;
    transform: translateY(15px);
  }
  .signal-gauge-number {
    font-size: 16px;
    font-weight: 800;
    color: var(--primary-text-color);
  }
  .signal-gauge-unit {
    margin-top: 2px;
    font-size: 9px;
    color: var(--secondary-text-color);
    opacity: 0.85;
  }
  .signal-sparkline {
    width: 100%;
    height: 20px;
    margin-top: 2px;
  }
  .signal-sparkline polyline {
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .signal-quality {
    margin-top: 4px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    opacity: 0.95;
  }
  .signal-quality.rssi { color: #35e27d; }
  .signal-quality.snr { color: #2dd4ff; }
  .signal-quality.noise { color: #8b5cf6; }

  /* Traffic grid - kolory dla wartości */
  .traffic-grid {
    display: flex;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .traffic-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: transparent;
    padding: 8px 18px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    min-width: 120px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .traffic-item:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }
  .traffic-label {
    font-size: 11px;
    color: var(--secondary-text-color);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .traffic-value {
    font-weight: 800;
    font-size: 14px;
    color: var(--mesh-blue);
  }
  .traffic-item:first-child .traffic-value {
    color: var(--mesh-green);
  }

  .hub-traffic-panel {
    border-top: 1px solid rgba(120, 150, 220, 0.2);
    border-bottom: 1px solid rgba(120, 150, 220, 0.12);
    padding: 8px 0 6px;
    background: transparent;
  }
  .hub-traffic-top-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 58px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .hub-traffic-stat {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: transparent;
    border-radius: 12px;
    border: 1px solid rgba(120, 150, 220, 0.14);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    padding: 8px 10px;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .hub-traffic-stat:hover {
    transform: translateY(-2px);
    border-color: rgba(120, 150, 220, 0.22);
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }
  .hub-traffic-label {
    font-size: 12px;
    color: var(--hub-secondary-text);
    opacity: 0.9;
  }
  .hub-traffic-value {
    font-size: 38px;
    font-weight: 700;
    line-height: 1;
    font-family: var(--paper-font-code1_-_font-family, monospace);
  }
  .hub-traffic-stat.sent .hub-traffic-value { color: #2be27a; }
  .hub-traffic-stat.recv .hub-traffic-value { color: #8b5cf6; }
  .hub-traffic-center {
    position: relative;
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background:
      radial-gradient(circle at 50% 50%, rgba(88, 166, 255, 0.14) 0 34%, rgba(88, 166, 255, 0.04) 35% 52%, transparent 53%),
      rgba(6, 14, 26, 0.45);
    box-shadow:
      0 14px 28px rgba(0, 0, 0, 0.26),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    transform: translateY(0);
    animation: hub-traffic-float 3.2s ease-in-out infinite;
  }
  .hub-traffic-center-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    animation: hub-traffic-ring-breathe 2.8s ease-in-out infinite;
  }
  .hub-traffic-center-ring::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background:
      conic-gradient(from 0deg,
        rgba(88, 166, 255, 0) 0deg,
        rgba(88, 166, 255, 0.12) 28deg,
        rgba(88, 166, 255, 1) 78deg,
        rgba(45, 212, 255, 1) 120deg,
        rgba(139, 92, 246, 0.95) 170deg,
        rgba(88, 166, 255, 0.14) 232deg,
        rgba(88, 166, 255, 0) 360deg);
    -webkit-mask: radial-gradient(circle, transparent 0 60%, #000 61% 100%);
    mask: radial-gradient(circle, transparent 0 60%, #000 61% 100%);
    filter: drop-shadow(0 0 10px rgba(88, 166, 255, 0.45));
    animation: hub-traffic-ring-spin 1.2s linear infinite;
  }
  .hub-traffic-center ha-icon {
    --mdc-icon-size: 18px;
    color: #e7f4ff;
    filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.75));
  }
  .hub-traffic-center-arrows {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  .hub-traffic-center-arrow {
    position: absolute;
    --mdc-icon-size: 18px;
    color: #e7f4ff;
    filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.75));
    top: 50%;
    transform: translate(-50%, -50%);
  }
  .hub-traffic-center-arrow.left {
    left: calc(50% - 10px);
    animation: hub-traffic-arrow-down 2.4s ease-in-out infinite;
  }
  .hub-traffic-center-arrow.right {
    left: calc(50% + 10px);
    animation: hub-traffic-arrow-up 2.4s ease-in-out infinite;
  }
  @keyframes hub-traffic-ring-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes hub-traffic-ring-breathe {
    0%, 100% { opacity: 0.72; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.06); }
  }
  @keyframes hub-traffic-icon-pulse {
    0%, 100% { transform: scale(1); opacity: 0.92; }
    50% { transform: scale(1.12); opacity: 1; }
  }
  @keyframes hub-traffic-arrow-up {
    0%, 100% { transform: translate(-50%, -50%) translateY(4px); opacity: 0.9; }
    50% { transform: translate(-50%, -50%) translateY(-4px); opacity: 1; }
  }
  @keyframes hub-traffic-arrow-down {
    0%, 100% { transform: translate(-50%, -50%) translateY(-4px); opacity: 0.9; }
    50% { transform: translate(-50%, -50%) translateY(4px); opacity: 1; }
  }
  @keyframes hub-traffic-icon-rotate {
    from { filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.75)); }
    50% { filter: drop-shadow(0 0 14px rgba(88, 166, 255, 1)); }
    to { filter: drop-shadow(0 0 8px rgba(88, 166, 255, 0.75)); }
  }
  @keyframes hub-traffic-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @keyframes hub-levitate-a {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @keyframes hub-levitate-b {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  @keyframes hub-card-breathe {
    0%, 100% {
      box-shadow:
        0 2px 8px rgba(0, 0, 0, 0.05),
        0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    }
    50% {
      box-shadow:
        0 10px 24px rgba(0, 0, 0, 0.11),
        0 0 0 1px rgba(255, 255, 255, 0.03) inset;
    }
  }
  @keyframes hub-levitate-c {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @keyframes hub-levitate-d {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .hub-traffic-bottom-row {
    margin-top: 8px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .hub-traffic-chip {
    font-size: 12px;
    color: var(--hub-secondary-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: transparent;
    border: none;
    text-align: center;
  }
  .hub-traffic-error {
    color: #f85149;
    font-weight: 700;
  }
  .hub-traffic-delivery {
    margin-top: 8px;
    text-align: center;
    font-size: 12px;
    color: var(--hub-secondary-text);
    background: transparent;
  }

  /* Advanced chips */
  .advanced-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0 6px;
    justify-content: center;
  }
  .advanced-chip {
    font-size: 10px;
    padding: 4px 12px;
    background: rgba(128, 128, 128, 0.03);
    border-radius: 20px;
    color: var(--secondary-text-color);
    border: 1px solid var(--glass-border);
    transition: all 0.2s ease;
  }
  .advanced-chip:hover {
    background: rgba(128, 128, 128, 0.08);
    transform: translateY(-1px);
    box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  }

  /* Loc row */
  .loc-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 8px 0;
    flex-wrap: wrap;
  }
  .loc-coords {
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 11px;
    background: transparent;
    padding: 4px 12px;
    border-radius: 20px;
    border: 1px solid var(--glass-border);
    color: var(--primary-text-color);
  }
  .map-link {
    font-size: 11px;
    font-weight: 500;
    color: var(--mesh-blue);
    text-decoration: none;
    padding: 4px 12px;
    border-radius: 20px;
    background: transparent;
    white-space: nowrap;
    border: 1px solid rgba(96, 165, 250, 0.3);
    transition: all 0.2s ease;
  }
  .map-link:hover {
    transform: translateY(-1px);
  }

  .hub-location-panel {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) minmax(0, 1.6fr);
    gap: 10px;
    border: 1px solid rgba(96, 130, 175, 0.2);
    border-radius: 12px;
    padding: 8px;
    background: transparent;
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }
  .hub-location-panel:hover {
    transform: translateY(-2px);
    border-color: rgba(96, 130, 175, 0.28);
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }
  .hub-location-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    min-width: 0;
  }
  .hub-location-coords {
    display: inline-flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--hub-secondary-text);
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 14px;
    line-height: 1.2;
    background: transparent;
  }
  .hub-location-coords ha-icon {
    --mdc-icon-size: 16px;
    color: var(--hub-secondary-text);
    margin-top: 1px;
  }
  .hub-location-btn {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--hub-secondary-text);
    text-decoration: none;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid rgba(115, 143, 182, 0.35);
    background: transparent;
  }
  .hub-location-btn ha-icon {
    --mdc-icon-size: 13px;
    color: inherit;
    opacity: 0.9;
  }
  .hub-location-preview {
    position: relative;
    min-height: 82px;
    border-radius: 10px;
    border: 1px solid var(--hub-location-preview-border);
    background: var(--hub-location-bg);
    overflow: hidden;
    text-decoration: none;
  }
  .hub-location-grid {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(0deg, var(--hub-location-grid-line) 0 1px, transparent 1px 20px),
      repeating-linear-gradient(90deg, var(--hub-location-grid-line-2) 0 1px, transparent 1px 24px);
    opacity: 0.5;
    transform: perspective(260px) rotateX(22deg) scale(1.08);
    transform-origin: center;
  }
  .hub-location-rings {
    position: absolute;
    width: 74px;
    height: 74px;
    right: 38%;
    top: 50%;
    transform: translate(50%, -50%);
    border-radius: 50%;
    background:
      radial-gradient(circle, rgba(59, 255, 169, 0.18) 0 18%, transparent 20% 100%);
    box-shadow:
      0 0 0 10px rgba(59, 255, 169, 0.12),
      0 0 0 22px rgba(59, 255, 169, 0.08),
      0 0 0 34px rgba(59, 255, 169, 0.04);
  }
  .hub-location-pin {
    position: absolute;
    width: 12px;
    height: 12px;
    right: 38%;
    top: 50%;
    transform: translate(50%, -50%);
    border-radius: 50%;
    background: #38f39f;
    box-shadow: 0 0 14px rgba(56, 243, 159, 0.95);
  }
  .hub-location-preview:hover {
    border-color: rgba(93, 133, 183, 0.44);
  }

  .empty { 
    text-align: center; 
    color: var(--secondary-text-color); 
    font-size: var(--paper-font-caption_-_font-size, 12px); 
    padding: 32px 20px; 
    line-height: 1.7;
    background: transparent;
    border-radius: 24px;
    border: 1px solid var(--glass-border);
  }

  /* Grid row constraint */
  ha-card.grid-rows { height: 100%; overflow: hidden; }

  /* Neighbors section */
  .neighbors-section {
    margin-top: 12px;
    padding-top: 8px;
  }

  .neighbors-header {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--hub-section-text);
    margin: 8px 0 6px 0;
    padding-bottom: 6px;
    border-bottom: none;
    opacity: 0.88;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-shadow: 0 0 0 black;
  }
  .neighbors-header::after {
    content: "";
    flex: 1 1 auto;
    min-width: 16px;
    height: 1px;
    background: var(--hub-section-line);
  }

  .neighbors-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }

  .neighbor-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    padding: 8px 10px;
    background: transparent;
    border-radius: 12px;
    border: 1px solid rgba(120, 150, 220, 0.14);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 255, 255, 0.02) inset;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }
  .neighbor-row:hover {
    transform: translateY(-2px);
    border-color: rgba(120, 150, 220, 0.22);
    box-shadow:
      0 14px 30px rgba(0, 0, 0, 0.22),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }

  .neighbor-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  }
  .neighbor-name {
    font-family: var(--paper-font-code1_-_font-family, monospace);
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-text-color);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .neighbor-snr {
    padding: 2px 10px;
    border-radius: 14px;
    font-size: 12px;
    font-weight: 700;
    backdrop-filter: blur(4px);
    transition: all 0.2s ease;
  }
  .neighbor-snr.green { 
    color: #22c55e; 
    border: 1px solid rgba(34, 197, 94, 0.35);
  }
  .neighbor-snr.yellow { 
    color: #eab308; 
    border: 1px solid rgba(234, 179, 8, 0.35);
  }
  .neighbor-snr.orange { 
    color: #f97316; 
    border: 1px solid rgba(249, 115, 22, 0.35);
  }
  .neighbor-snr.red { 
    color: #ef4444; 
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
  .neighbor-snr.dim { 
    color: var(--secondary-text-color); 
    opacity: 0.5; 
    font-weight: normal; 
    background: transparent;
    border: 1px solid var(--glass-border);
    backdrop-filter: none;
  }

  .neighbor-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    margin-top: 6px;
    justify-content: flex-start;
  }
  .neighbor-stat {
    font-size: 10px;
    color: var(--secondary-text-color);
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0.6;
  }

  .neighbor-name.clickable, .neighbor-snr.clickable {
    cursor: pointer;
  }
  .neighbor-name.clickable:hover {
    color: var(--mesh-blue);
    text-decoration: underline;
  }
  .neighbor-snr.clickable:hover {
    opacity: 0.7;
  }

  /* Node title row */
  .node-title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
    margin-bottom: 6px;
    text-align: left;
  }
  .node-title-row .hub-name,
  .node-title-row .node-key {
    display: inline-flex;
    align-items: center;
  }
  .node-title-row .prefix {
    margin-left: auto;
    font-size: var(--paper-font-caption_-_font-size, 11px);
    opacity: 0.6;
    font-family: var(--paper-font-code1_-_font-family, monospace);
  }

  /* Szare, neutralne tło – bez niebieskiego odcienia */
  .node-block {
    background: rgba(128, 128, 128, 0.05);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(128, 128, 128, 0.12);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
    margin-bottom: 18px;
  }
  .node-block:hover {
    background: rgba(128, 128, 128, 0.08);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
  }

  .chip,
  .mqtt-pill,
  .neighbor-row,
  .traffic-item,
  .advanced-chip,
  .node-header-badge,
  .badge {
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(128, 128, 128, 0.1);
  }

  .chip:hover,
  .mqtt-pill:hover,
  .neighbor-row:hover,
  .traffic-item:hover,
  .advanced-chip:hover {
    background: rgba(128, 128, 128, 0.07);
  }

  .bar-track {
    background: rgba(128, 128, 128, 0.15);
  }

  .section-header,
  .neighbors-header {
    border-bottom-color: rgba(128, 128, 128, 0.2);
  }

  /* Dark theme */
  @media (prefers-color-scheme: dark) {
    :host {
      --glass-border: rgba(255, 255, 255, 0.1);
    }
  }

  /* Light theme */
  @media (prefers-color-scheme: light) {
    :host {
      --glass-border: rgba(15, 23, 42, 0.12);
      --glass-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
      --glass-shadow-hover: 0 6px 16px rgba(15, 23, 42, 0.12);
      --hub-tech-text: #1f2937;
      --hub-secondary-text: #334155;
      --hub-section-text: #1f2937;
      --hub-section-line: linear-gradient(90deg, rgba(15, 23, 42, 0.32), rgba(15, 23, 42, 0.06));
      --hub-light-text: #1f2937;
    }

    ha-card,
    .section-label,
    .hw-info,
    .node-name,
    .hub-name,
    .node-key,
    .count-badge,
    .node-route,
    .signal-label,
    .signal-value,
    .badge,
    .loc-coords,
    .map-link,
    .advert-btn,
    .advert-feedback,
    .hub-battery-label,
    .hub-battery-voltage,
    .hub-id-pill,
    .hub-meta-pill,
    .hub-type-pill,
    .hub-uptime-pill,
    .hub-tech-label,
    .hub-tech-value,
    .hub-location-coords,
    .hub-location-btn,
    .hub-traffic-label,
    .hub-traffic-chip,
    .hub-traffic-delivery,
    .signal-gauge-number,
    .hub-tech-item,
    .status-text,
    .empty {
      color: var(--hub-light-text);
    }

    .hub-tech-item {
      border-color: rgba(15, 23, 42, 0.1);
    }

    .hub-online-pill,
    .hub-type-pill,
    .hub-id-pill,
    .hub-meta-pill,
    .hub-uptime-pill,
    .signal-card,
    .hub-tech-item,
    .hub-location-panel,
    .hub-traffic-panel,
    .hub-battery-panel {
      box-shadow:
        0 8px 20px rgba(15, 23, 42, 0.08),
        0 0 0 1px rgba(255, 255, 255, 0.4) inset;
    }

    .hub-hero,
    .signal-card,
    .hub-tech-item,
    .hub-location-panel,
    .hub-traffic-panel,
    .hub-battery-shell,
    .hub-battery-fill-wrap {
      background: rgba(255, 255, 255, 0.72);
    }

    .hub-tech-item {
      box-shadow:
        0 6px 14px rgba(15, 23, 42, 0.06),
        0 0 0 1px rgba(255, 255, 255, 0.45) inset;
    }

    .hub-tech-item:hover {
      box-shadow:
        0 10px 20px rgba(15, 23, 42, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    }

    .hub-battery-shell {
      border-color: rgba(15, 23, 42, 0.08);
    }
  }

  /* ---------- Advert buttons ---------- */
  .advert-buttons {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid var(--divider-color);
    justify-content: center;
  }

  .advert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    background: var(--secondary-background-color);
    color: var(--primary-text-color);
    transition: background 0.2s, color 0.2s;
    flex: 1;
    min-width: 0;
    max-width: 180px;
    position: relative;
    z-index: 1;
    box-shadow:
      0 12px 26px rgba(0, 0, 0, 0.16),
      0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  }

  .advert-btn ha-icon {
    --mdc-icon-size: 18px;
  }

  /* Advert Zero – niebieski */
  .advert-zero {
    border: 1px solid var(--primary-color);
  }
  .advert-zero:hover {
    background: var(--primary-color);
    color: var(--text-primary-color);
  }

  /* Advert Flood – żółty (warning) */
  .advert-flood {
    border: 1px solid var(--warning-color);
  }
  .advert-flood:hover {
    background: var(--warning-color);
    color: var(--text-primary-color);
  }
  .advert-feedback {
    text-align: center;
    margin-top: 6px;
    font-size: 12px;
    font-weight: 500;
    transition: opacity 0.3s;
  }

  @media (max-width: 500px) {
    ha-card {
      padding: 12px;
    }
    .hub-hero {
      padding: 10px;
      border-radius: 18px;
    }
    .hub-top-row {
      flex-wrap: nowrap;
      gap: 8px;
    }
    .node-top-row {
      flex-wrap: nowrap;
      gap: 8px;
    }
    .hub-main-row {
      align-items: center;
      flex-wrap: nowrap;
      gap: 8px;
    }
    .hub-title-line {
      flex: 1 1 auto;
      min-width: 0;
      flex-wrap: nowrap;
    }
    .hub-name {
      font-size: 1.3rem;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hub-meta-row {
      margin-left: auto;
      width: auto;
      flex-wrap: nowrap;
      justify-content: flex-end;
      gap: 6px;
      flex-shrink: 0;
    }
    .hub-id-pill,
    .hub-meta-pill {
      white-space: nowrap;
    }
    .hub-type-pill {
      font-size: 11px;
      padding: 4px 10px;
    }
    .hub-uptime-pill {
      font-size: 10px;
      padding: 4px 8px;
    }
    .hub-id-pill {
      font-size: 10px;
    }
    .hub-meta-pill {
      font-size: 11px;
      padding: 4px 8px;
    }
    .hub-tech-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      overflow: hidden;
      gap: 0;
    }
    .hub-tech-item {
      padding: 6px 4px 5px;
    }
    .hub-tech-main {
      gap: 4px;
      justify-content: center;
    }
    .hub-tech-main ha-icon {
      --mdc-icon-size: 12px;
    }
    .hub-tech-value {
      font-size: 10px;
      text-align: center;
    }
    .hub-tech-label {
      font-size: 7px;
      margin-left: 0;
      text-align: center;
    }
    .hub-location-panel {
      grid-template-columns: minmax(96px, 0.9fr) minmax(0, 1.1fr);
      gap: 8px;
      padding: 7px;
    }
    .hub-location-preview {
      min-height: 72px;
    }
    .hub-location-coords {
      font-size: 12px;
    }
    .hub-location-btn {
      font-size: 10px;
      padding: 5px 8px;
    }
    .hub-traffic-top-row {
      grid-template-columns: minmax(0, 1fr) 46px minmax(0, 1fr);
      gap: 6px;
    }
    .hub-traffic-value {
      font-size: 28px;
    }
    .hub-traffic-label,
    .hub-traffic-chip,
    .hub-traffic-delivery {
      font-size: 10px;
    }
    .hub-traffic-center {
      width: 46px;
      height: 46px;
    }
    .hub-traffic-center ha-icon {
      --mdc-icon-size: 18px;
    }
    .hub-traffic-bottom-row {
      gap: 6px;
    }
    .hub-battery-panel {
      grid-template-columns: minmax(66px, 84px) minmax(0, 1fr);
      gap: 8px;
      padding: 8px 10px;
    }
    .hub-battery-info {
      gap: 1px;
    }
    .hub-battery-label {
      font-size: 10px;
    }
    .hub-battery-percent {
      font-size: 24px;
    }
    .hub-battery-voltage {
      font-size: 10px;
    }
    .hub-battery-shell {
      height: 28px;
      padding: 2px;
      min-width: 0;
    }
    .hub-battery-tip {
      height: 12px;
      right: -6px;
    }

    /* signal-row – w jednej linii */
    .signal-row {
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: space-between;
      gap: 6px;
      padding: 4px 8px;
      font-size: 11px;
    }
    .signal-left {
      display: flex;
      gap: 8px;
      flex-wrap: nowrap;
    }
    .signal-right {
      flex-shrink: 0;
    }
    .signal-item {
      font-size: 10px;
      gap: 3px;
    }
    .signal-label {
      font-size: 9px;
    }
    .signal-value {
      font-size: 11px;
    }

    /* traffic-grid – w jednej linii */
    .traffic-grid {
      flex-wrap: nowrap;
      gap: 6px;
      justify-content: center;
      overflow-x: auto;
      padding: 4px 0;
    }
    .traffic-item {
      min-width: 70px;
      padding: 4px 8px;
      gap: 4px;
    }
    .traffic-label {
      font-size: 8px;
    }
    .traffic-value {
      font-size: 11px;
    }

    /* Pozostałe elementy – dostosowanie dla małych ekranów */
    .node-block {
      padding: 10px 10px 8px;
      margin-bottom: 8px;
    }
    .node-header {
      gap: 4px;
    }
    .node-left {
      gap: 4px;
    }
    .node-right {
      gap: 4px;
    }
    .node-name, .hub-name {
      font-size: 1.3rem;
    }
    .node-header-badge {
      font-size: 8px;
      padding: 2px 6px;
    }
    .type-badge {
      font-size: 8px;
      padding: 2px 6px;
    }
    .status-text {
      font-size: 11px;
    }
    .bar-row {
      font-size: 9px;
      margin: 6px 0 2px;
    }
    .bar-label {
      gap: 3px;
    }
    .bar-val {
      font-size: 10px;
    }
    .rf-row {
      gap: 4px;
      padding: 0 0 4px 0;
    }
    .rf-chip {
      font-size: 8px;
      padding: 2px 6px;
    }
    .mqtt-pill {
      font-size: 8px;
      padding: 2px 6px;
    }
    .chip {
      font-size: 9px;
      padding: 3px 8px;
    }
    .advanced-chip {
      font-size: 8px;
      padding: 2px 6px;
    }
    .loc-coords {
      font-size: 8px;
      padding: 2px 6px;
    }
    .map-link {
      font-size: 8px;
      padding: 2px 6px;
    }
    .neighbors-header {
      margin: 4px 0 4px 0;
    }
    .neighbor-row {
      padding: 6px 8px;
    }
    .neighbor-name {
      font-size: 10px;
      max-width: 100px;
    }
    .neighbor-snr {
      font-size: 10px;
      padding: 1px 6px;
    }
    .neighbor-stats {
      gap: 6px;
      font-size: 8px;
      justify-content: flex-start;
    }
    .neighbor-stat {
      font-size: 8px;
    }
    .advert-btn {
      font-size: 9px;
      padding: 4px 6px;
      max-width: 120px;
    }
    .advert-btn ha-icon {
      --mdc-icon-size: 14px;
    }
    .hub-signal-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }
    .hub-signal-row .signal-card {
      padding: 7px 6px;
      min-width: 0;
      flex: initial;
    }
    .hub-signal-row .signal-gauge {
      height: 54px;
    }
    .hub-signal-row .signal-gauge-wrap {
      height: 56px;
    }
    .hub-signal-row .signal-gauge-number {
      font-size: 15px;
    }
    .hub-signal-row .signal-gauge-unit {
      font-size: 8px;
    }
    .hub-signal-row .signal-card .signal-label {
      font-size: 8px;
    }
    .hub-signal-row .signal-sparkline {
      height: 14px;
    }
    .hub-signal-row .signal-quality {
      font-size: 10px;
      margin-top: 3px;
    }
    .empty {
      font-size: 11px;
      padding: 20px 16px;
    }
  }

  /* ============================================ */
  /* RESPONSYWNOŚĆ DLA BARDZO MAŁYCH EKRANÓW */
  /* ============================================ */
  @media (max-width: 400px) {
    .hub-battery-panel {
      grid-template-columns: minmax(58px, 74px) minmax(0, 1fr);
      gap: 6px;
      padding: 7px 8px;
    }
    .hub-battery-percent {
      font-size: 21px;
    }
    .hub-battery-shell {
      height: 26px;
      padding: 2px;
    }
    .hub-name {
      font-size: 1.3rem;
    }
    .hub-id-pill,
    .hub-meta-pill {
      font-size: 9px;
      padding: 4px 7px;
    }
    .hub-tech-item {
      padding: 5px 2px 4px;
    }
    .hub-tech-main {
      gap: 3px;
    }
    .hub-tech-main ha-icon {
      --mdc-icon-size: 11px;
    }
    .hub-tech-value {
      font-size: 9px;
    }
    .hub-tech-label {
      font-size: 6px;
    }
    .hub-location-preview {
      min-height: 64px;
    }
    .hub-location-panel {
      grid-template-columns: minmax(88px, 0.92fr) minmax(0, 1.08fr);
      gap: 6px;
      padding: 6px;
    }
    .hub-location-coords {
      font-size: 11px;
    }
    .hub-traffic-value {
      font-size: 22px;
    }
    .hub-traffic-label,
    .hub-traffic-chip,
    .hub-traffic-delivery {
      font-size: 9px;
    }
    .hub-uptime-pill {
      font-size: 9px;
      padding: 4px 7px;
    }
    .hub-top-row {
      gap: 6px;
    }
    .hub-signal-row {
      gap: 6px;
    }
    .hub-signal-row .signal-card {
      padding: 6px 5px;
    }
    .hub-signal-row .signal-gauge-number {
      font-size: 13px;
    }
    .hub-signal-row .signal-card .signal-label {
      font-size: 7px;
    }
    .hub-signal-row .signal-gauge-unit {
      font-size: 7px;
    }
    .hub-signal-row .signal-quality {
      font-size: 9px;
    }
    .signal-row {
      flex-wrap: wrap;
      gap: 4px;
    }
    .signal-left {
      flex-wrap: wrap;
      justify-content: center;
    }
    .signal-right {
      justify-content: center;
    }
    .traffic-grid {
      gap: 4px;
    }
    .traffic-item {
      min-width: 60px;
      padding: 3px 6px;
    }
    .node-name, .hub-name {
      font-size: 1.3rem;
    }
  }

  /* Final light-theme override - must come after all base rules */
  @media (prefers-color-scheme: light) {
    .section-header,
    .hub-section-header,
    .hub-tech-header {
      color: var(--hub-section-text);
      opacity: 0.92;
    }

    .hub-section-header::after {
      background: var(--hub-section-line);
    }

    .hub-location-preview {
      --hub-location-bg: linear-gradient(165deg, rgba(255, 255, 255, 0.94), rgba(241, 245, 249, 0.94) 52%, rgba(226, 232, 240, 0.94));
      --hub-location-grid-line: rgba(71, 85, 105, 0.14);
      --hub-location-grid-line-2: rgba(71, 85, 105, 0.1);
      --hub-location-preview-border: rgba(15, 23, 42, 0.1);
    }

    .hub-tech-item,
    .hub-tech-item.clickable,
    .hub-tech-item.clickable .hub-tech-main,
    .hub-tech-label,
    .hub-tech-value,
    .hub-tech-item.clickable .hub-tech-main ha-icon,
    .signal-gauge-number,
    .signal-gauge-unit,
    .signal-card .signal-label {
      color: var(--hub-tech-text);
    }

    .signal-gauge-number {
      opacity: 1;
    }

    .hub-tech-item.clickable {
      border-color: rgba(15, 23, 42, 0.1);
    }

    .hub-battery-label,
    .hub-battery-voltage,
    .hub-traffic-label,
    .hub-traffic-chip,
    .hub-traffic-delivery,
    .hub-location-coords,
    .hub-location-coords ha-icon,
    .hub-location-btn,
    .hub-location-btn ha-icon {
      color: var(--hub-secondary-text);
    }
  }
`; 