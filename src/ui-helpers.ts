import { escapeHtml, getDisplayState, signalQualityLabel, drawTrafficBars } from "./helpers.js";
import type { HomeAssistant } from "./types.js";
import type { LocalizeFunc } from "./localize.js";

export function isValid(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const s = String(value);
  return s !== "" && s !== "N/A" && s !== "unknown" && s !== "unavailable";
}

export function clickable(entityId: string | null | undefined, content: string, extraClass = ""): string {
  if (!entityId) return content;
  const cls = extraClass ? ` ${extraClass}` : "";
  return `<span class="clickable${cls}" data-entity="${escapeHtml(entityId)}">${content}</span>`;
}

export function sectionHeader(title: string): string {
  return `<div class="section-header hub-section-header">${escapeHtml(title)}</div>`;
}

export function renderTechItem(
  hass: HomeAssistant | undefined,
  label: string,
  value: string | number | null,
  unit = "",
  entityId: string | null = null
): string {
  const displayVal = entityId ? getDisplayState(hass, entityId) : (value != null ? String(value) : null);
  if (!isValid(displayVal)) return "";
  const valueText = unit ? `${displayVal} ${unit}` : displayVal;
  const cls = entityId ? " clickable" : "";
  const attrs = entityId ? ` data-entity="${escapeHtml(entityId)}"` : "";
  return `<div class="hub-tech-item${cls}"${attrs}><div class="hub-tech-main"><span class="hub-tech-value">${escapeHtml(valueText)}</span></div><div class="hub-tech-label">${escapeHtml(label)}</div></div>`;
}

export function renderChip(
  hass: HomeAssistant | undefined,
  label: string,
  entityId: string | null | undefined,
  icon = ""
): string {
  if (!entityId) return "";
  const val = getDisplayState(hass, entityId);
  if (!isValid(val)) return "";
  return `<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(entityId)}">${icon}${escapeHtml(label)}: ${escapeHtml(val)}</span>`;
}

export function renderBatteryPanel(
  pctDisplay: string | number | null,
  vDisplay: string | number | null,
  battPctId: string | null,
  battVId: string | null,
  t: (key: string) => string
): string {
  if (!pctDisplay && !vDisplay) return "";

  let pctNumber: number | null = null;
  let pctText = "N/A";
  let dynamicBatteryColor = "#666";

  if (pctDisplay) {
    const rawPct = typeof pctDisplay === "number"
      ? pctDisplay
      : parseFloat(String(pctDisplay).replace(",", ".").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(rawPct)) {
      pctNumber = Math.min(100, Math.max(0, rawPct));
      pctText = `${pctNumber.toFixed(0)}%`;
      dynamicBatteryColor = `hsl(${Math.round((pctNumber / 100) * 110)}, 70%, 45%)`;
    }
  }

  let voltageText: string | null = null;
  if (vDisplay) {
    const v = typeof vDisplay === "number" ? vDisplay : parseFloat(String(vDisplay));
    if (Number.isFinite(v) && v >= 0.001) {
      voltageText = `${v.toFixed(3)}V`;
    }
  }

  if (pctNumber === null && voltageText === null) return "";

  return `
    <div class="hub-battery-panel" style="--hub-battery-color:${dynamicBatteryColor};">
      <div class="hub-battery-info">
        <span class="hub-battery-label">${escapeHtml(t("card.battery_label"))}</span>
        <span class="hub-battery-percent clickable" ${battPctId ? `data-entity="${escapeHtml(battPctId)}"` : ""}>${escapeHtml(pctText)}</span>
      </div>
      <div class="hub-battery-right">
        <div class="hub-battery-shell" role="img" aria-label="Battery ${escapeHtml(pctText)}">
          <div class="hub-battery-fill-wrap">
            <div class="hub-battery-fill" style="width:${pctNumber !== null ? pctNumber : 0}%;"></div>
          </div>
          <span class="hub-battery-tip"></span>
        </div>
        ${voltageText ? `<span class="hub-battery-voltage clickable" ${battVId ? `data-entity="${escapeHtml(battVId)}"` : ""}>${escapeHtml(voltageText)}</span>` : ""}
      </div>
    </div>
  `;
}

// ============================================
// SYGNAŁ – FUNKCJE PRZENIESIONE Z KART
// ============================================

function parseNumericMetric(value: unknown): number | null {
  const text = String(value ?? "").replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function signalGaugePct(value: number, variant: "rssi" | "snr" | "noise"): number {
  const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
  if (variant === "rssi") {
    const normalized = (value - (-140)) / 110;
    return clamp(normalized * 100, 0, 100);
  }
  if (variant === "snr") {
    const normalized = (value - (-20)) / 40;
    return clamp(normalized * 100, 0, 100);
  }
  const normalized = ((-85) - value) / 35;
  return clamp(normalized * 100, 0, 100);
}

function renderSignalSparkline(series: number[], variant: "rssi" | "snr" | "noise"): string {
  if (series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const points: string[] = [];
  for (let i = 0; i < series.length; i++) {
    const x = (i * 100) / Math.max(1, series.length - 1);
    const y = 20 - ((series[i] - min) / span) * 16;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `
    <svg class="signal-sparkline ${variant}" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points.join(" ")}"></polyline>
    </svg>
  `;
}

export function renderSignalCard(
  hass: HomeAssistant | undefined,
  label: string,
  unit: string,
  entityId: string | null,
  variant: "rssi" | "snr" | "noise",
  t: LocalizeFunc,
  series?: number[]
): string {
  if (!entityId) return "";
  const displayVal = getDisplayState(hass, entityId);
  if (!displayVal || displayVal === "N/A") return "";

  const numeric = parseNumericMetric(displayVal);
  const gaugePct = numeric !== null ? Math.max(0, Math.min(100, signalGaugePct(numeric, variant))) : 0;
  const qualityText = signalQualityLabel(numeric, variant, t);

  if (!series || series.length < 2) {
    series = numeric !== null
      ? [0.94, 0.97, 1, 0.99, 1.02, 1.01, 1.03].map((m) => numeric * m)
      : [];
  }

  const icon = variant === "rssi" ? "mdi:wifi" 
             : variant === "snr"  ? "mdi:signal" 
             : "mdi:volume-high";

  return `
    <div class="signal-card ${variant}">
      <div class="signal-card-head">
        <span class="signal-label">${escapeHtml(label)}</span>
        <ha-icon class="signal-head-icon" icon="${icon}"></ha-icon>
      </div>
      <div class="signal-gauge-wrap">
        <svg class="signal-gauge ${variant}" viewBox="0 0 100 62" aria-hidden="true">
          <path class="signal-gauge-track" pathLength="100" d="M14,50 A36,36 0 0 1 86,50"></path>
          <path class="signal-gauge-progress" pathLength="100" style="stroke-dasharray:${gaugePct} 100" d="M14,50 A36,36 0 0 1 86,50"></path>
        </svg>
        <div class="signal-gauge-value clickable" data-entity="${escapeHtml(entityId)}">
          <span class="signal-gauge-number">${escapeHtml(displayVal)}</span>
          <span class="signal-gauge-unit">${escapeHtml(unit)}</span>
        </div>
      </div>
      ${renderSignalSparkline(series, variant)}
      <div class="signal-quality ${variant}">${escapeHtml(qualityText)}</div>
    </div>
  `;
}

export interface TrafficBarsRendererConfig {
  disabledAnimations?: boolean;
}

export function renderTrafficBars(
  shadowRoot: ShadowRoot | null,
  config: TrafficBarsRendererConfig = {}
): void {
  if (!shadowRoot) return;

  const canvases = shadowRoot.querySelectorAll('.traffic-bars-canvas');
  if (!canvases || canvases.length === 0) return;

  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-text-color')
    .trim();
  const isLightTheme = textColor === '#141414' || textColor === 'rgb(20, 20, 20)';

  canvases.forEach((canvas) => {
    const parent = (canvas as HTMLElement).parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Ustaw wymiary canvasu
    const c = canvas as HTMLCanvasElement;
    c.width = rect.width;
    c.height = rect.height;
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';

    // Wykryj czy to SENT czy RECEIVED
    let dotColor: string;
    let dotGlow: string;
    
    // Sprawdź klasę rodzica
    if (parent.classList.contains('sent')) {
      // SENT - zielony
      dotColor = isLightTheme ? '#1a7a3a' : '#00ff66';
      dotGlow = isLightTheme ? 'rgba(26, 122, 58, 0.6)' : 'rgba(0, 255, 100, 0.8)';
    } else if (parent.classList.contains('recv')) {
      // RECEIVED - niebieski
      dotColor = isLightTheme ? '#1a5a8a' : '#00cafd';
      dotGlow = isLightTheme ? 'rgba(26, 90, 138, 0.6)' : 'rgba(0, 202, 253, 0.8)';
    } else {
      // Domyślne
      dotColor = isLightTheme ? '#1e3a5f' : '#00ff66';
      dotGlow = isLightTheme ? 'rgba(30, 58, 95, 0.6)' : 'rgba(0, 255, 100, 0.8)';
    }

    drawTrafficBars(c, {
      columnCount: 50,
      barWidth: 2,
      barGap: 2,
      minHeight: 2,
      maxHeight: 35,
      speed: 0.035,
      color: dotColor,
      glowColor: dotGlow,
      animate: !config.disabledAnimations,
      borderRadius: 1,
    });
  });
}

export function renderTrafficBarsWithOptions(
  shadowRoot: ShadowRoot | null,
  options: {
    disabledAnimations?: boolean;
    isVisible?: boolean;
    columnCount?: number;
    barWidth?: number;
    barGap?: number;
    minHeight?: number;
    maxHeight?: number;
    speed?: number;
    borderRadius?: number;
  } = {}
): void {
  if (!shadowRoot) return;

  const {
    disabledAnimations = false,
    isVisible = true,
    columnCount = 50,
    barWidth = 2,
    barGap = 2,
    minHeight = 2,
    maxHeight = 35,
    speed = 0.035,
    borderRadius = 1,
  } = options;

  const canvases = shadowRoot.querySelectorAll('.traffic-bars-canvas');
  if (!canvases.length) return;

  // Zatrzymaj wszystkie istniejące animacje na tych canvasach
  canvases.forEach((canvas) => {
    const c = canvas as HTMLCanvasElement;
    if ((c as any)._animationId) {
      cancelAnimationFrame((c as any)._animationId);
      (c as any)._animationId = null;
    }
  });

  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-text-color')
    .trim();
  const isLightTheme = textColor === '#141414' || textColor === 'rgb(20, 20, 20)';

  canvases.forEach((canvas) => {
    const parent = (canvas as HTMLElement).parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const c = canvas as HTMLCanvasElement;
    c.width = rect.width;
    c.height = rect.height;
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';

    let dotColor: string;
    let dotGlow: string;

    if (parent.classList.contains('sent')) {
      dotColor = isLightTheme ? '#1a7a3a' : '#00ff66';
      dotGlow = isLightTheme ? 'rgba(26, 122, 58, 0.6)' : 'rgba(0, 255, 100, 0.8)';
    } else if (parent.classList.contains('recv')) {
      dotColor = isLightTheme ? '#1a5a8a' : '#00cafd';
      dotGlow = isLightTheme ? 'rgba(26, 90, 138, 0.6)' : 'rgba(0, 202, 253, 0.8)';
    } else {
      dotColor = isLightTheme ? '#1e3a5f' : '#00ff66';
      dotGlow = isLightTheme ? 'rgba(30, 58, 95, 0.6)' : 'rgba(0, 255, 100, 0.8)';
    }

    drawTrafficBars(c, {
      columnCount,
      barWidth,
      barGap,
      minHeight,
      maxHeight,
      speed,
      color: dotColor,
      glowColor: dotGlow,
      animate: !disabledAnimations,
      borderRadius,
      isVisible,
    });
  });
}