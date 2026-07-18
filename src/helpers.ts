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
  skipUnavailable?: boolean;
  skipNoSnr?: boolean;
  maxNeighbors?: number;
}

export function filterNeighbors(
  neighbors: NeighborInfo[],
  options: FilteredNeighborOptions = {}
): NeighborInfo[] {
  const { skipUnavailable = true, skipNoSnr = true, maxNeighbors } = options;

  let filtered = neighbors.filter((n) => {
    if (skipUnavailable && n.name === "unavailable network") return false;
    if (skipNoSnr && (n.snr === null || isNaN(Number(n.snr)))) return false;
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
// GLOBALNY INDEKS SĄSIADÓW (OPTYMALIZACJA)
// ============================================

/**
 * Buduje indeks: deviceId → NeighborInfo[]
 * Wywołaj raz na render, potem używaj getNeighborsFromIndex.
 */
export function buildNeighborsIndex(hass: HomeAssistant): Map<string, NeighborInfo[]> {
  const result = new Map<string, NeighborInfo[]>();

  if (!hass?.entities) return result;

  // Najpierw zbuduj mapę adv_id → { entityId, name } dla szybkiego wyszukiwania kontaktów
  const contactByAdvId = new Map<string, { entityId: string; name: string }>();
  for (const [entityId, state] of Object.entries(hass.states)) {
    if (!/^binary_sensor\.meshcore_.*_contact$/.test(entityId)) continue;
    const advId = (state.attributes as Record<string, unknown>)["adv_id"];
    if (advId) {
      const name = ((state.attributes as Record<string, unknown>)["adv_name"] as string) || String(advId).substring(0, 8);
      contactByAdvId.set(String(advId), { entityId, name });
    }
  }

  // Grupuj encje po deviceId
  const entityIdsByDevice = new Map<string, string[]>();
  for (const [entityId, info] of Object.entries(hass.entities)) {
    if (!info.device_id) continue;
    if (!entityIdsByDevice.has(info.device_id)) entityIdsByDevice.set(info.device_id, []);
    entityIdsByDevice.get(info.device_id)!.push(entityId);
  }

  // Dla każdego deviceId zbierz sąsiadów
  for (const [deviceId, entityIds] of entityIdsByDevice) {
    const neighborMap = new Map<string, {
      snr?: number; snrId?: string;
      lastSeen?: number; rawSeen?: string;
    }>();

    for (const entityId of entityIds) {
      const seenMatch = entityId.match(/_neighbor_([0-9a-f]+)_seen$/);
      if (seenMatch) {
        const nid = seenMatch[1];
        if (!neighborMap.has(nid)) neighborMap.set(nid, {});
        const seenVal = getEntityState(hass, entityId);
        if (seenVal !== null && seenVal !== "unknown" && seenVal !== "unavailable") {
          neighborMap.get(nid)!.rawSeen = seenVal;
        }
        continue;
      }

      const neighborMatch = entityId.match(/_neighbor_([0-9a-f]+)$/);
      if (neighborMatch && !entityId.endsWith("_seen")) {
        const nid = neighborMatch[1];
        if (!neighborMap.has(nid)) neighborMap.set(nid, {});
        const val = getEntityState(hass, entityId);
        const stateObj = hass.states[entityId];
        let ts: number | null = null;
        if (stateObj?.last_changed) ts = new Date(stateObj.last_changed).getTime() / 1000;
        else if (stateObj?.last_updated) ts = new Date(stateObj.last_updated).getTime() / 1000;

        const existing = neighborMap.get(nid)!;
        if (ts && (!existing.lastSeen || ts < existing.lastSeen)) existing.lastSeen = ts;
        if (val !== null && val !== "unknown" && val !== "unavailable") {
          const num = parseFloat(val);
          if (!isNaN(num)) { existing.snr = num; existing.snrId = entityId; }
        }
      }
    }

    const neighbors: NeighborInfo[] = [];
    for (const [nid, data] of neighborMap) {
      const contact = contactByAdvId.get(nid);
      neighbors.push({
        id: nid,
        name: contact?.name ?? nid.substring(0, 8),
        snr: data.snr ?? null,
        lastSeen: data.lastSeen ?? null,
        rawSeen: data.rawSeen ?? null,
        contactEntityId: contact?.entityId ?? null,
        snrId: data.snrId ?? null,
      });
    }

    neighbors.sort((a, b) => {
      const aSnr = a.snr !== null ? Number(a.snr) : -100;
      const bSnr = b.snr !== null ? Number(b.snr) : -100;
      return bSnr - aSnr;
    });

    result.set(deviceId, neighbors);
  }

  return result;
}

/**
 * Wyciąga sąsiadów z gotowego indeksu.
 * Używaj zamiast getNeighbors, gdy indeks został już zbudowany.
 */
export function getNeighborsFromIndex(
  index: Map<string, NeighborInfo[]>,
  deviceId: string
): NeighborInfo[] {
  return index.get(deviceId) ?? [];
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

// ============================================
// NOWE FUNKCJE PRZENIESIONE Z KART (eliminacja duplikatów)
// ============================================

export function parseNumericMetric(value: unknown): number | null {
  const text = String(value ?? "").replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function sampleSeries(values: number[]): number[] {
  if (values.length <= 24) return values;
  const step = Math.ceil(values.length / 24);
  return values.filter((_, idx) => idx % step === 0).slice(-24);
}

export function extractNumericSeriesFromLogbook(entries: unknown[]): number[] {
  const values: number[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const candidates = [
      e["state"],
      e["message"],
      e["name"],
      e["context_state"],
      e["display_message"],
    ];
    for (const candidate of candidates) {
      const parsed = parseNumericMetric(candidate);
      if (parsed !== null) {
        values.push(parsed);
        break;
      }
    }
  }
  return values;
}

export function signalGaugePct(value: number, variant: "rssi" | "snr" | "noise"): number {
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

export function discoverRepeaters(
  hass: HomeAssistant | undefined,
  config?: { sort_by?: "snr" | "name" | "battery" },
  neighborsIndex?: Map<string, NeighborInfo[]>
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
    const successId = p("request_successes");
    const uptimeId = p("uptime");
    const status = statusId ? getEntityState(hass, statusId) : null;
    const successes = successId ? getEntityState(hass, successId) : null;

    let online = false;

    // Główna logika – taka sama jak w node‑card
    if (uptimeId) {
      const uptimeState = hass.states[uptimeId];
      if (uptimeState && !["unavailable", "unknown"].includes(uptimeState.state)) {
        const ts = new Date(uptimeState.last_updated).getTime();
        online = !isNaN(ts) && (Date.now() - ts) < 6 * 3600 * 1000;
      } else {
        online = false;  // unavailable lub unknown → offline
      }
    } else {
      // Brak encji uptime – sprawdź status i successes
      online = status ? isOnlineState(status) : false;
      if (!online && successes !== null && successes !== "N/A" && Number(successes) > 0) {
        online = true;
      }
    }

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
    const tempId = p("ch1_temperature") ?? p("temperature");

    const battery = batteryId ? getEntityState(hass, batteryId) : null;
    const rssi = rssiId ? getEntityState(hass, rssiId) : null;
    const snr = snrId ? getEntityState(hass, snrId) : null;
    const noise = noiseId ? getEntityState(hass, noiseId) : null;
    const temp = tempId ? getEntityState(hass, tempId) : null;
    const uptimeRaw = uptimeId ? getEntityState(hass, uptimeId) : null;
    const uptime = uptimeRaw ? formatUptime(uptimeRaw) : null;

    const neighbors = neighborsIndex
      ? getNeighborsFromIndex(neighborsIndex, deviceId)
      : getNeighbors(hass, deviceId);

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
    count?: [number, number];
    color?: string;
    spacing?: number;
    jitter?: number;
    lineWidth?: [number, number];
    heightFromBottom?: number;
    maxHeight?: number;
    waveAmplitude?: [number, number];
    waveFrequency?: [number, number];
    waveLength?: [number, number];
    speed?: number;
    animate?: boolean;
    isVisible?: boolean; 

    floatingDots?: boolean;
    floatingDotsCount?: number;
    floatingDotSize?: [number, number];
    floatingSpeed?: [number, number];
    pulse?: boolean;
    glow?: boolean;
    glowStrength?: number;
    opacity?: number;
  } = {}
): void {
  if ((canvas as any)._animationId) {
    cancelAnimationFrame((canvas as any)._animationId);
    (canvas as any)._animationId = null;
  }

  const parent = canvas.parentElement;
  if (!parent) return;

  const rect = parent.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const {
    count = [7, 11],
    color = '#00ff9d',
    spacing = 4.1,
    jitter = 0.7,
    lineWidth = [1.2, 2.3],
    heightFromBottom = 5,
    maxHeight = 52,
    waveAmplitude = [2, 8],
    waveFrequency = [0.013, 0.027],
    waveLength = [150, 380],
    speed = 0.034,
    animate = true,
    isVisible = true,

    floatingDots = true,
    floatingDotsCount = 50,
    floatingDotSize = [0.5, 1.5],
    floatingSpeed = [0.08, 0.22],
    pulse = true,
    glow = true,
    glowStrength = 14,
    opacity = 0.78,
  } = options;

  const actualCount = Math.floor(count[0] + Math.random() * (count[1] - count[0] + 1));

  const waves = Array.from({ length: actualCount }, () => ({
    amplitude: waveAmplitude[0] + Math.random() * (waveAmplitude[1] - waveAmplitude[0]),
    frequency: waveFrequency[0] + Math.random() * (waveFrequency[1] - waveFrequency[0]),
    length: waveLength[0] + Math.random() * (waveLength[1] - waveLength[0]),
    phase: Math.random() * Math.PI * 4,
    yBase: heightFromBottom + Math.random() * maxHeight * 0.75,
    opacity: opacity * (0.65 + Math.random() * 0.35),
    lineWidth: lineWidth[0] + Math.random() * (lineWidth[1] - lineWidth[0]),
  }));

  const floating = floatingDots ? Array.from({ length: floatingDotsCount }, () => ({
    x: Math.random() * rect.width,
    y: Math.random() * rect.height,
    size: floatingDotSize[0] + Math.random() * (floatingDotSize[1] - floatingDotSize[0]),
    speed: floatingSpeed[0] + Math.random() * (floatingSpeed[1] - floatingSpeed[0]),
  })) : [];

  let time = 0;
  let frameCount = 0;
  function drawFrame() {
    frameCount++;
    if (frameCount % 2 === 0) {
      if (animate) {
        (canvas as any)._animationId = requestAnimationFrame(drawFrame);
      }
      return;
    }
    if (!isVisible) {
      if (animate) {
        (canvas as any)._animationId = requestAnimationFrame(drawFrame);
      }
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pulseFactor = pulse ? (Math.sin(time * 1.8) * 0.08 + 1) : 1;

    for (const wave of waves) {
      if (glow) {
        ctx.shadowBlur = glowStrength;
        ctx.shadowColor = color;
      }

      const rightEdge = rect.width - 25;
      const startX = rightEdge - wave.length + Math.sin(time * 0.45 + wave.phase) * 25;

      ctx.strokeStyle = color;
      ctx.lineWidth = wave.lineWidth;
      ctx.lineCap = "round";
      ctx.globalAlpha = wave.opacity * pulseFactor;
      ctx.beginPath();

      let first = true;
      for (let x = Math.max(20, startX); x < rightEdge + 30; x += spacing) {
        let y = rect.height - wave.yBase +
                Math.sin(x * wave.frequency + time + wave.phase) * wave.amplitude;

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (floatingDots && floating.length > 0) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.fillStyle = color;

      for (const dot of floating) {
        if (animate) {
          dot.y -= dot.speed;
          if (dot.y < 20) {
            dot.y = rect.height + 10;
            dot.x = Math.random() * rect.width;
          }
        }

        ctx.globalAlpha = 0.35 + Math.sin(time * 3.2 + dot.x) * 0.3;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (animate) time += speed;
    if (animate) (canvas as any)._animationId = requestAnimationFrame(drawFrame);
  }

  drawFrame();
}
export function drawTrafficBars(
  canvas: HTMLCanvasElement,
  options: {
    columnCount?: number;
    barWidth?: number;
    barGap?: number;
    minHeight?: number;
    maxHeight?: number;
    speed?: number;
    color?: string;
    glowColor?: string;
    animate?: boolean;
    borderRadius?: number;
    isVisible?: boolean;
  } = {}
): void {
  const {
    columnCount = 30,
    barWidth = 4,
    barGap = 3,
    minHeight = 2,
    maxHeight = 30,
    speed = 0.035,
    color = '#00ff66',
    glowColor = 'rgba(0, 255, 100, 0.8)',
    animate = true,
    borderRadius = 2,
    isVisible = true,
  } = options;

  // Zatrzymaj poprzednią animację
  if ((canvas as any)._animationId) {
    cancelAnimationFrame((canvas as any)._animationId);
    (canvas as any)._animationId = null;
  }

  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const targets: number[] = Array.from({ length: columnCount }, (_, i) => {
    const base = Math.sin(i * 0.3) * 0.5 + 0.5;
    const noise = (Math.random() - 0.5) * 0.4;
    return minHeight + Math.max(0, base + noise) * (maxHeight - minHeight);
  });

  const currentHeights: number[] = Array.from({ length: columnCount }, () => minHeight);
  const phases: number[] = Array.from({ length: columnCount }, () => Math.random() * Math.PI * 2);
  const pulseSpeeds: number[] = Array.from({ length: columnCount }, () => 0.01 + Math.random() * 0.03);

  let time = 0;
  let frameCount = 0;

  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function animateFrame() {
    frameCount++;
    // Pomijaj co drugą klatkę – zmniejsza obciążenie CPU
    if (frameCount % 2 === 0) {
      if (animate) {
        (canvas as any)._animationId = requestAnimationFrame(animateFrame);
      }
      return;
    }

    if (!isVisible) {
      if (animate) {
        (canvas as any)._animationId = requestAnimationFrame(animateFrame);
      }
      return;
    }

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (Math.random() < 0.08) {
      const idx = Math.floor(Math.random() * columnCount);
      const base = Math.sin(idx * 0.3 + time * 0.1) * 0.5 + 0.5;
      const noise = (Math.random() - 0.5) * 0.4;
      targets[idx] = minHeight + Math.max(0, base + noise) * (maxHeight - minHeight);
    }

    const totalWidth = columnCount * (barWidth + barGap) - barGap;
    const startX = (rect.width - totalWidth) / 2;

    for (let i = 0; i < columnCount; i++) {
      currentHeights[i] += (targets[i] - currentHeights[i]) * speed;
      const height = Math.max(minHeight, currentHeights[i]);
      const x = startX + i * (barWidth + barGap);
      const y = rect.height - height;

      const pulse = Math.sin(time * pulseSpeeds[i] * 8 + phases[i]) * 0.1 + 0.95;
      const alpha = 0.6 + (height / maxHeight) * 0.4;

      const gradient = ctx.createLinearGradient(x, y, x, rect.height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '80');

      ctx.shadowBlur = 12;
      ctx.shadowColor = glowColor;
      ctx.globalAlpha = alpha * pulse;

      if (borderRadius > 0) {
        const radius = Math.min(borderRadius, barWidth / 2, height / 2);
        drawRoundedRect(ctx, x, y, barWidth, height, radius);
        ctx.fillStyle = gradient;
        ctx.fill();
      } else {
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, height);
      }

      if (height > 5) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ffffff';
        const glowHeight = Math.min(2, height * 0.15);
        ctx.fillRect(x + 1, y, barWidth - 2, glowHeight);
      }
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    time += 0.016;
    if (animate) {
      (canvas as any)._animationId = requestAnimationFrame(animateFrame);
    }
  }

  animateFrame();
}