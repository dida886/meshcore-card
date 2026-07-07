import type { HomeAssistant } from "./types.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { discoverNodes } from "./discovery.js";

// ============================================
// ESKAPING I BEZPIECZEŃSTWO
// ============================================

export function escapeHtml(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================
// STANY I STATUSY
// ============================================

export function isOnlineState(v: unknown): boolean {
  return ["online", "connected", "on", "1", "true"].includes(
    String(v).toLowerCase()
  );
}

export function formatLastSeen(
  ts: string | number | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
): string | null {
  if (!ts || ts === "unknown" || ts === "unavailable") return null;
  const diff = Math.floor(Date.now() / 1000 - Number(ts));
  if (isNaN(diff) || diff < 0) return null;
  if (diff < 60) return t("time.s_ago", { n: diff });
  if (diff < 3600) return t("time.m_ago", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("time.h_ago", { n: Math.floor(diff / 3600) });
  return t("time.d_ago", { n: Math.floor(diff / 86400) });
}

// ============================================
// BATERIA
// ============================================

export function batteryColor(pct: string | number | null): string {
  const v = Number(pct);
  if (isNaN(v)) return "var(--secondary-text-color)";
  if (v >= 50) return "var(--success-color, #4caf50)";
  if (v >= 20) return "var(--warning-color, #ff9800)";
  return "var(--error-color, #f44336)";
}

export type ColorClass = "green" | "yellow" | "red" | "dim";

export function batteryClass(pct: string | number | null): ColorClass {
  const v = Number(pct);
  if (isNaN(v)) return "dim";
  if (v >= 50) return "green";
  if (v >= 20) return "yellow";
  return "red";
}

// ============================================
// UPTIME
// ============================================

export function formatUptime(
  days: string | number | null | undefined
): string | null {
  const v = parseFloat(String(days));
  if (isNaN(v) || v < 0) return null;
  const d = Math.floor(v);
  const h = Math.floor((v - d) * 24);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

// ============================================
// RSSI
// ============================================

export function rssiClass(rssi: string | number | null): ColorClass {
  const v = Number(rssi);
  if (isNaN(v)) return "dim";
  if (v >= -70) return "green";
  if (v >= -90) return "yellow";
  return "red";
}

// ============================================
// ENTITY ACCESSORS
// ============================================

export function getEntityState(hass: HomeAssistant | undefined, id: string | null): string | null {
  if (!id || !hass) return null;
  const s = hass.states[id];
  return s ? s.state : null;
}

export function getEntityAttribute(hass: HomeAssistant | undefined, id: string | null, attr: string): unknown {
  if (!id || !hass) return null;
  return hass.states[id]?.attributes[attr] ?? null;
}

export function entityExists(hass: HomeAssistant | undefined, id: string | null | undefined): boolean {
  return !!id && !!hass?.states[id];
}

// ============================================
// FIND ENTITY BY DEVICE
// ============================================

export function findEntityByDevice(
  hass: HomeAssistant | undefined,
  deviceId: string,
  metric: string,
  ePrefix: string,
  eSuffix: string
): string | null {
  if (!deviceId || !hass?.entities) return null;
  const pLen = (ePrefix || "").length;
  const sLen = (eSuffix || "").length;

  for (const [entityId, info] of Object.entries(hass.entities)) {
    if (info.device_id !== deviceId) continue;
    const core = entityId.slice(pLen, sLen ? -sLen : undefined);
    if (core === metric || core.endsWith(`_${metric}`)) return entityId;
  }

  for (const [entityId, info] of Object.entries(hass.entities)) {
    if (info.device_id !== deviceId) continue;
    if (entityId.endsWith(`_${metric}`)) return entityId;
  }
  return null;
}

// ============================================
// NEIGHBOR HELPERS
// ============================================

export interface NeighborInfo {
  id: string;
  name: string;
  snr: number | null;
  lastSeen: number | null;
  rawSeen: string | null;
  contactEntityId: string | null;
  snrId?: string | null;
}

export function getNeighbors(hass: HomeAssistant | undefined, deviceId: string): NeighborInfo[] {
  if (!hass || !deviceId) return [];
  const neighborMap = new Map<string, any>();

  for (const [entityId, info] of Object.entries(hass.entities || {})) {
    if (info.device_id !== deviceId) continue;

    const seenMatch = entityId.match(/_neighbor_([0-9a-f]+)_seen$/);
    if (seenMatch) {
      const neighborId = seenMatch[1];
      if (!neighborMap.has(neighborId)) {
        neighborMap.set(neighborId, {});
      }
      const seenVal = getEntityState(hass, entityId);
      if (seenVal !== null && seenVal !== "unknown" && seenVal !== "unavailable") {
        neighborMap.get(neighborId)!.rawSeen = seenVal;
        neighborMap.get(neighborId)!.seenId = entityId;
      }
    }

    const neighborMatch = entityId.match(/_neighbor_([0-9a-f]+)$/);
    if (neighborMatch && !entityId.endsWith("_seen")) {
      const neighborId = neighborMatch[1];
      if (!neighborMap.has(neighborId)) {
        neighborMap.set(neighborId, {});
      }
      const val = getEntityState(hass, entityId);
      const state = hass.states[entityId];
      let lastSeenTimestamp = null;
      if (state && state.last_changed) {
        lastSeenTimestamp = new Date(state.last_changed).getTime() / 1000;
      } else if (state && state.last_updated) {
        lastSeenTimestamp = new Date(state.last_updated).getTime() / 1000;
      }
      const existing = neighborMap.get(neighborId)!;
      if (lastSeenTimestamp && (!existing.lastSeen || lastSeenTimestamp < existing.lastSeen)) {
        existing.lastSeen = lastSeenTimestamp;
      }
      if (val !== null && val !== "unknown" && val !== "unavailable") {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          existing.snr = numVal;
          existing.snrId = entityId;
        }
      }
    }
  }

  const neighbors: NeighborInfo[] = [];
  for (const [neighborId, data] of neighborMap) {
    let neighborName = neighborId.substring(0, 8);
    let contactEntityId = null;

    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!/^binary_sensor\.meshcore_.*_contact$/.test(entityId)) continue;
      const advId = state.attributes["adv_id"];
      if (advId && String(advId) === neighborId) {
        neighborName = state.attributes["adv_name"] || neighborName;
        contactEntityId = entityId;
        break;
      }
      if (entityId.includes(neighborId)) {
        neighborName = state.attributes["adv_name"] || neighborName;
        contactEntityId = entityId;
        break;
      }
    }

    neighbors.push({
      id: neighborId,
      name: neighborName,
      snr: data.snr ?? null,
      lastSeen: data.lastSeen ?? null,
      rawSeen: data.rawSeen ?? null,
      contactEntityId: contactEntityId,
      snrId: data.snrId ?? null,
    });
  }

  neighbors.sort((a, b) => {
    const aSnr = a.snr !== null ? Number(a.snr) : -100;
    const bSnr = b.snr !== null ? Number(b.snr) : -100;
    return bSnr - aSnr;
  });

  return neighbors;
}

export function formatNeighborLastSeen(timestamp: number | null): string {
  if (!timestamp) return "?";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 0) return "?";
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.ceil(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function getSnrClass(snr: number | string | null): string {
  const v = Number(snr);
  if (isNaN(v)) return "dim";
  if (v >= 9) return "green";
  if (v >= 6) return "yellow";
  if (v >= 0) return "orange";
  return "red";
}

export function snrDescription(
  snr: number | null,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  if (snr === null || isNaN(snr)) return "";
  if (snr >= 9) return t("card.snr_excellent");
  if (snr >= 6) return t("card.snr_good");
  if (snr >= 0) return t("card.snr_fair");
  return t("card.snr_poor");
}
// ── Filter neighbors ──────────────────────────────────────────

export interface FilteredNeighborOptions {
  /** Pomijaj sąsiadów z "unavailable network" (domyślnie true) */
  skipUnavailable?: boolean;
  /** Pomijaj sąsiadów bez SNR (domyślnie true) */
  skipNoSnr?: boolean;
  /** Maksymalna liczba sąsiadów do zwrócenia (domyślnie brak limitu) */
  maxNeighbors?: number;
}

export function filterNeighbors(
  neighbors: NeighborInfo[],
  options: FilteredNeighborOptions = {}
): NeighborInfo[] {
  const {
    skipUnavailable = true,
    skipNoSnr = true,
    maxNeighbors,
  } = options;

  let filtered = neighbors.filter((n) => {
    if (skipUnavailable && n.name === "unavailable network") {
      return false;
    }
    if (skipNoSnr && (n.snr === null || isNaN(Number(n.snr)))) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aSnr = a.snr !== null ? Number(a.snr) : -100;
    const bSnr = b.snr !== null ? Number(b.snr) : -100;
    return bSnr - aSnr;
  });

  if (maxNeighbors && maxNeighbors > 0) {
    filtered = filtered.slice(0, maxNeighbors);
  }

  return filtered;
}

// ============================================
// DISCOVER REPEATERS
// ============================================

export interface RepeaterData {
  name: string;
  deviceId: string;
  online: boolean;
  battery: string | null;
  rssi: string | null;
  snr: string | null;
  noise: string | null;
  uptime: string | null;
  temp: string | null;
  neighbors: NeighborInfo[];
  entityIds: {
    status?: string | null;
    battery?: string | null;
    rssi?: string | null;
    snr?: string | null;
    noise?: string | null;
    uptime?: string | null;
    temp?: string | null;
  };
}
export function getDisplayState(
  hass: HomeAssistant | undefined,
  entityId: string | null,
  fallback: string = "N/A"
): string {
  if (!entityId) return fallback;
  const state = getEntityState(hass, entityId);
  if (state == null || state === "unavailable" || state === "unknown") return fallback;
  return state;
}

export function signalQualityLabel(
  value: number | null,
  variant: "rssi" | "snr" | "noise",
  t: LocalizeFunc
): string {
  if (value === null) return t("card.signal_unknown") || "Unknown";

  if (variant === "rssi") {
    if (value >= -70) return t("card.signal_excellent") || "Excellent";
    if (value >= -90) return t("card.signal_strong") || "Strong";
    if (value >= -110) return t("card.signal_medium") || "Medium";
    if (value >= -125) return t("card.signal_low") || "Low";
    return t("card.signal_very_low") || "Very Low";
  }

  if (variant === "snr") {
    if (value >= 10) return t("card.signal_excellent") || "Excellent";
    if (value >= 5) return t("card.signal_strong") || "Strong";
    if (value >= 0) return t("card.signal_medium") || "Medium";
    if (value >= -10) return t("card.signal_low") || "Low";
    if (value >= -20) return t("card.signal_very_low") || "Very Low";
    return t("card.signal_no_link") || "No Link";
  }

  // noise
  if (value <= -105) return t("card.signal_low") || "Low";
  if (value <= -95) return t("card.signal_medium") || "Medium";
  if (value <= -85) return t("card.signal_high") || "High";
  return t("card.signal_very_high") || "Very High";
}

export function discoverRepeaters(
  hass: HomeAssistant | undefined,
  config?: { sort_by?: "snr" | "name" | "battery" }
): RepeaterData[] {
  if (!hass) return [];
  const nodes = discoverNodes(hass);

  const repeaterNodes = nodes.filter((node) => {
    const { deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(hass, deviceId, m, ePrefix, eSuffix);

    const airtimeId = p("airtime_utilization") ?? p("airtime");
    const rxAirtimeId = p("rx_airtime_utilization") ?? p("rx_airtime");
    const noiseId = p("noise_floor");

    const hasAirtime = !!airtimeId || !!rxAirtimeId;
    const hasNoise = !!noiseId;
    const hasNeighbor = (() => {
      if (!hass?.entities) return false;
      for (const [entityId, info] of Object.entries(hass.entities)) {
        if (info.device_id !== deviceId) continue;
        if (/_neighbor_[0-9a-f]+(_seen)?$/.test(entityId)) return true;
      }
      return false;
    })();

    return hasAirtime || hasNoise || hasNeighbor;
  });

  const result: RepeaterData[] = [];
  for (const node of repeaterNodes) {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(hass, deviceId, m, ePrefix, eSuffix);

    const statusId = p("online") ?? p("status");
    const status = statusId ? hass.states[statusId]?.state : null;
    const online = status ? isOnlineState(status) : false;

    const batteryId = p("battery_percentage") ?? p("battery_level") ?? p("battery");
    let battVId = p("battery_voltage");
    if (!battVId && hass) {
      for (const [entityId, info] of Object.entries(hass.entities)) {
        if (info.device_id !== deviceId) continue;
        if (/_bat$|_battery_voltage$|_bat_/i.test(entityId) &&
            !/percentage|level/i.test(entityId)) {
          battVId = entityId;
          break;
        }
      }
    }
    const rssiId = p("last_rssi");
    const snrId = p("last_snr");
    const noiseId = p("noise_floor");
    const uptimeId = p("uptime");
    const tempId = p("ch1_temperature") ?? p("temperature");

    const battery = batteryId ? getEntityState(hass, batteryId) : null;
    const rssi = rssiId ? getEntityState(hass, rssiId) : null;
    const snr = snrId ? getEntityState(hass, snrId) : null;
    const noise = noiseId ? getEntityState(hass, noiseId) : null;
    const temp = tempId ? getEntityState(hass, tempId) : null;
    const uptimeRaw = uptimeId ? getEntityState(hass, uptimeId) : null;
    const uptime = uptimeRaw ? formatUptime(uptimeRaw) : null;

    const neighbors = getNeighbors(hass, deviceId);

    result.push({
      name,
      deviceId,
      online,
      battery,
      rssi,
      snr,
      noise,
      uptime,
      temp,
      neighbors,
      entityIds: {
        status: statusId,
        battery: batteryId,
        rssi: rssiId,
        snr: snrId,
        noise: noiseId,
        uptime: uptimeId,
        temp: tempId,
      },
    });
  }

  const sortBy = config?.sort_by || "snr";
  if (sortBy === "snr") {
    result.sort((a, b) => {
      const aSnr = a.snr ? parseFloat(a.snr) : -100;
      const bSnr = b.snr ? parseFloat(b.snr) : -100;
      return bSnr - aSnr;
    });
  } else if (sortBy === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "battery") {
    result.sort((a, b) => {
      const aBat = a.battery ? parseFloat(a.battery) : 0;
      const bBat = b.battery ? parseFloat(b.battery) : 0;
      return bBat - aBat;
    });
  }

  return result;
}
// ============================================
// PARTICLE GENERATOR – STATYCZNA FALA
// ============================================

export function drawParticles(
  canvas: HTMLCanvasElement,
  options: {
    count?: number;
    color?: string;
    spacing?: number;
    jitter?: number;
    opacity?: number;
    glow?: boolean;
    mask?: boolean;
    maskCenter?: number;
    maskSpread?: number;
    retries?: number;
    waveAmplitude?: number;      // amplituda fali (domyślnie 12)
    waveFrequency?: number;      // częstotliwość fali (domyślnie 0.025)
  } = {},
  retryCount: number = 0
): void {
  const parent = canvas.parentElement;
  if (!parent) {
    console.warn('drawParticles: canvas has no parent');
    return;
  }

  const rect = parent.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    const maxRetries = options.retries ?? 5;
    if (retryCount < maxRetries) {
      setTimeout(() => {
        drawParticles(canvas, options, retryCount + 1);
      }, 100);
    } else {
      console.warn('drawParticles: parent still has zero size after retries');
    }
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Parametry
  const {
    color = '#3cff88',
    spacing = 16,
    jitter = 2,
    opacity = 0.6,
    glow = true,
    mask = true,
    maskCenter = 0.7,
    maskSpread = 0.35,
    waveAmplitude = 12,
    waveFrequency = 0.025,
  } = options;

  // Generowanie punktów w siatce z efektem fali
  const cols = Math.ceil(w / spacing) + 2;
  const rows = Math.ceil(h / spacing) + 2;
  const particles: { x: number; y: number; size: number }[] = [];

  // Stała wartość czasu (bez animacji)
  const time = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Podstawowa pozycja
      const baseX = c * spacing;
      const baseY = r * spacing;

      // Efekt fali – przesunięcie w Y zależne od X
      const waveY = Math.sin(baseX * waveFrequency + time) * waveAmplitude;

      // Perspektywa – punkty na dole gęstsze
      const perspective = 1 - (baseY / h) * 0.5;
      const x = (baseX) * perspective + w * (1 - perspective) * 0.5 + (Math.random() - 0.5) * jitter;
      const y = baseY + waveY + (Math.random() - 0.5) * jitter * 0.5;

      // Rozmiar z pulsowaniem (statyczne, oparte na pozycji)
      const size = 1.0 + 0.6 * Math.sin(baseX * 0.03 + baseY * 0.03);

      particles.push({ x, y, size });
    }
  }

  // Glow
  if (glow) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
  }

  // Rysowanie punktów
  for (const p of particles) {
    let alpha = opacity;
    if (mask) {
      const factor = 1 - Math.abs(p.y - maskCenter * h) / (maskSpread * h);
      alpha = Math.max(0, Math.min(1, factor * opacity));
    }
    if (alpha < 0.02) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}