import { escapeHtml, getDisplayState } from "./helpers.js";
import type { HomeAssistant } from "./types.js";

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

/** Panel baterii – używany zarówno w HubCard jak i NodeCard. */
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