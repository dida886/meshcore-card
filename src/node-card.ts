import type {
  HomeAssistant,
  MeshcoreNodeCardConfig,
  NodeInfo,
} from "./types.js";
import {
  isOnlineState,
  formatLastSeen,
  formatUptime,
  escapeHtml,
  getEntityState,
  getEntityAttribute,
  entityExists,
  findEntityByDevice,
  getNeighbors,
  formatNeighborLastSeen,
  getSnrClass,
  filterNeighbors,
  snrDescription,
  getDisplayState,
  signalQualityLabel,
  type NeighborInfo,
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { discoverNodes } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

export class MeshcoreNodeCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreNodeCardConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  private _neighborSnrHistory = new Map<string, number[]>();
  private _neighborSnrHistoryFetchedAt = new Map<string, number>();
  private _neighborSnrHistoryLoading = new Set<string>();

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e: Event) => {
      const el = (e.target as Element).closest("[data-entity]") as HTMLElement | null;
      if (el?.dataset["entity"]) {
        const event = new Event("hass-more-info", { bubbles: true, composed: true });
        (event as Event & { detail: { entityId: string } }).detail = {
          entityId: el.dataset["entity"],
        };
        this.dispatchEvent(event);
      }
    });
  }

  setConfig(config: MeshcoreNodeCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => id.includes("meshcore") && !id.includes("node_count"))
      .map(([id, s]) => `${id}=${s.state}@${s.last_changed}`)
      .join("|");
    if (fp === this._fp) return;
    this._fp = fp;
    const now = Date.now();
    if (now - this._lastRender >= 10000) {
      this._lastRender = now;
      this._render();
    } else if (!this._renderTimer) {
      const delay = 10000 - (now - this._lastRender);
      this._renderTimer = setTimeout(() => {
        this._renderTimer = null;
        this._lastRender = Date.now();
        this._render();
      }, delay);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _contactEntity(nodeName: string): string | null {
    if (!this._hass) return null;
    for (const [id, state] of Object.entries(this._hass.states)) {
      if (!/^binary_sensor\.meshcore_.*_contact$/.test(id)) continue;
      if (String(state.attributes["adv_name"] ?? "") === nodeName) return id;
    }
    return null;
  }

  private _chip(
    id: string | null,
    label: string,
    value: string | null,
    cls = ""
  ): string {
    if (!id || value === null) return "";
    const blank = value === "unknown" || value === "unavailable";
    return `<span class="chip ${cls} clickable" data-entity="${escapeHtml(id)}">${
      label ? `<span class="chip-label">${escapeHtml(label)}</span>` : ""
    }${blank ? "N/A" : escapeHtml(value)}</span>`;
  }

  private _progressBar(pct: string | number | null, color: string): string {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
  }

  private _renderHubBattery(
    battPct: string | number | null,
    battV: string | number | null,
    battPctId: string | null,
    battVId: string | null,
    t: LocalizeFunc
  ): string {
    // Sprawdzenie, czy mamy prawidłową wartość procentową
    let pctNumber: number | null = null;
    let pctText = "N/A";
    let dynamicBatteryColor = "#666";

    if (battPct !== null && battPct !== "unavailable" && battPct !== "unknown") {
      const rawPct = typeof battPct === "number"
        ? battPct
        : parseFloat(String(battPct).replace(",", ".").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(rawPct)) {
        pctNumber = Math.min(100, Math.max(0, rawPct));
        pctText = `${pctNumber.toFixed(0)}%`;
        dynamicBatteryColor = `hsl(${Math.round((pctNumber / 100) * 110)}, 70%, 45%)`;
      }
    }

    let voltageText: string | null = null;
    if (battV !== null && battV !== "unavailable" && battV !== "unknown") {
      const v = Number(battV);
      if (Number.isFinite(v) && v >= 0.001) {
        voltageText = `${v.toFixed(3)}V`;
      }
    }

    // Jeśli nie ma żadnej wartości, nie wyświetlamy panelu
    if (pctNumber === null && voltageText === null) return "";

    return `
      <div class="hub-battery-panel" style="--hub-battery-color:${dynamicBatteryColor};">
        <div class="hub-battery-info">
          <span class="hub-battery-label">${escapeHtml(t("card.battery_label"))}</span>
          <span class="hub-battery-percent clickable" ${battPctId ? `data-entity="${escapeHtml(battPctId)}"` : ""}>${escapeHtml(pctText)}</span>
          ${voltageText ? `<span class="hub-battery-voltage clickable" ${battVId ? `data-entity="${escapeHtml(battVId)}"` : ""}>${escapeHtml(voltageText)}</span>` : ""}
        </div>
        <div class="hub-battery-shell" role="img" aria-label="Battery ${escapeHtml(pctText)}">
          <div class="hub-battery-fill-wrap">
            <div class="hub-battery-fill" style="width:${pctNumber !== null ? pctNumber : 0}%;"></div>
          </div>
          <span class="hub-battery-tip"></span>
        </div>
      </div>
    `;
  }

  private _parseNumericMetric(value: unknown): number | null {
    const text = String(value ?? "").replace(",", ".");
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
  }

  private _sampleSeries(values: number[]): number[] {
    if (values.length <= 24) return values;
    const step = Math.ceil(values.length / 24);
    return values.filter((_, idx) => idx % step === 0).slice(-24);
  }

  private _extractNumericSeriesFromLogbook(entries: unknown[]): number[] {
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
        const parsed = this._parseNumericMetric(candidate);
        if (parsed !== null) {
          values.push(parsed);
          break;
        }
      }
    }
    return values;
  }

  private _fetchHistoryFromRecorder(entityId: string, startIso: string, endIso: string): Promise<number[]> {
    const path = `history/period/${startIso}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}&minimal_response&no_attributes`;
    return (this._hass as any).callApi("GET", path).then((response: unknown) => {
      if (!Array.isArray(response) || !Array.isArray(response[0])) return [];
      return (response[0] as Array<{ state?: string }>)
        .map((row) => this._parseNumericMetric(row.state))
        .filter((v): v is number => v !== null);
    });
  }

  private _ensureNeighborSnrHistory(entityId: string): void {
    if (!this._hass) return;
    if (this._neighborSnrHistoryLoading.has(entityId)) return;
    const now = Date.now();
    const fetchedAt = this._neighborSnrHistoryFetchedAt.get(entityId) ?? 0;
    const ttlMs = 5 * 60 * 1000;
    if (now - fetchedAt < ttlMs) return;

    this._neighborSnrHistoryLoading.add(entityId);
    const startIso = new Date(now - 48 * 3600 * 1000).toISOString();
    const endIso = new Date(now).toISOString();
    const logbookPath = `logbook/${startIso}?entity=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}`;

    (this._hass as any).callApi("GET", logbookPath)
      .then((response: unknown) => {
        const fromLogbook = Array.isArray(response) ? this._extractNumericSeriesFromLogbook(response) : [];
        if (fromLogbook.length >= 2) {
          this._neighborSnrHistory.set(entityId, this._sampleSeries(fromLogbook));
          this._neighborSnrHistoryFetchedAt.set(entityId, Date.now());
          this._render();
          return;
        }
        return this._fetchHistoryFromRecorder(entityId, startIso, endIso).then((fromHistory) => {
          this._neighborSnrHistory.set(entityId, this._sampleSeries(fromHistory));
          this._neighborSnrHistoryFetchedAt.set(entityId, Date.now());
          this._render();
        });
      })
      .catch((err: unknown) => {
        console.error(`Neighbor SNR history fetch failed for ${entityId}:`, err);
      })
      .finally(() => {
        this._neighborSnrHistoryLoading.delete(entityId);
      });
  }

  private _signalGaugePct(value: number, variant: "rssi" | "snr" | "noise"): number {
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

  
  private _renderSignalSparkline(series: number[], variant: "rssi" | "snr" | "noise"): string {
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

  private _renderSignalMetric(
    label: string,
    value: string | number | null,
    unit: string,
    entityId: string | null,
    variant: "rssi" | "snr" | "noise",
    t: LocalizeFunc
  ): string {
    // Jeśli brak encji lub wartość niedostępna – pomijamy
    if (!entityId) return "";
    const displayVal = getDisplayState(this._hass, entityId);
    if (displayVal === "N/A") return "";

    const numeric = this._parseNumericMetric(displayVal);
    const gaugePct = numeric !== null ? Math.max(0, Math.min(100, this._signalGaugePct(numeric, variant))) : 0;
    const qualityText = signalQualityLabel(numeric, variant, makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en"));
    const series = numeric !== null
      ? [0.94, 0.97, 1, 0.99, 1.02, 1.01, 1.03].map((m) => numeric * m)
      : [];

    return `
      <div class="signal-card ${variant}">
        <div class="signal-card-head">
          <span class="signal-label">${escapeHtml(label)}</span>
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
        ${this._renderSignalSparkline(series, variant)}
        <div class="signal-quality ${variant}">${escapeHtml(qualityText)}</div>
      </div>
    `;
  }

  private _renderLocationPanel(lat: unknown, lon: unknown, entityId: string | null, t: LocalizeFunc): string {
    if (!entityId) return "";
    // Sprawdzenie, czy współrzędne są prawidłowe
    const latNum = parseFloat(String(lat));
    const lonNum = parseFloat(String(lon));
    if (isNaN(latNum) || isNaN(lonNum) || (latNum === 0 && lonNum === 0)) return "";

    const latF = latNum.toFixed(5);
    const lonF = lonNum.toFixed(5);
    const url = `https://analyzer.letsmesh.net/map?lat=${latF}&long=${lonF}&zoom=10`;
    return `<div class="hub-location-panel">
      <div class="hub-location-info">
        <span class="hub-location-coords clickable" data-entity="${escapeHtml(entityId)}">
          <ha-icon icon="mdi:map-marker"></ha-icon>
          <span>${latF},<br>${lonF}</span>
        </span>
        <a class="hub-location-btn" href="${url}" target="_blank" rel="noopener">
          ${escapeHtml(t("card.map_link"))}
          <ha-icon icon="mdi:arrow-top-right"></ha-icon>
        </a>
      </div>
      <a class="hub-location-preview" href="${url}" target="_blank" rel="noopener" aria-label="Open map preview">
        <span class="hub-location-grid"></span>
        <span class="hub-location-rings"></span>
        <span class="hub-location-pin"></span>
      </a>
    </div>`;
  }

  private _renderTechItem(label: string, value: string | number | null, unit: string = "", entityId: string | null = null): string {
      // Używamy helpera do pobrania czytelnej wartości
      const displayVal = entityId ? getDisplayState(this._hass, entityId) : (value != null ? String(value) : null);
      if (!displayVal || displayVal === "N/A") return "";
      const valueText = unit ? `${displayVal} ${unit}` : displayVal;
      return `<div class="hub-tech-item${entityId ? " clickable" : ""}" ${entityId ? `data-entity="${escapeHtml(entityId)}"` : ""}><div class="hub-tech-main"><span class="hub-tech-value">${escapeHtml(valueText)}</span></div><div class="hub-tech-label">${escapeHtml(label)}</div></div>`;
    }

    // ── Node rendering ─────────────────────────────────────────────────────────

    private _renderNode(node: NodeInfo, t: LocalizeFunc): string {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(this._hass, deviceId, m, ePrefix, eSuffix);

    // ✅ Sprawdź, czy węzeł jest na liście do ukrycia
    const hiddenNodes = this._config?.hidden_nodes || [];
    if (hiddenNodes.includes(name)) {
      return "";
    }

    // ✅ Filtr po typie
    const nodeTypeFilter = this._config?.node_type_filter || "all";

    // Określenie typu węzła
    const isRepeater = !!(p("airtime_utilization") || p("rx_airtime_utilization") || p("noise_floor")) || (() => {
      if (!this._hass?.entities) return false;
      for (const [entityId, info] of Object.entries(this._hass.entities)) {
        if (info.device_id !== deviceId) continue;
        if (/_neighbor_[0-9a-f]+_seen$/.test(entityId)) return true;
      }
      return false;
    })();
    const isSensor = !isRepeater && !!(p("temperature") || p("humidity") || p("illuminance"));

    let isRoom = false;
    const contactId = this._contactEntity(name);
    if (contactId) {
      const nodeTypeStr = getEntityAttribute(this._hass, contactId, "node_type_str");
      if (nodeTypeStr && String(nodeTypeStr).toLowerCase() === "room") {
        isRoom = true;
      }
    }

    const nodeType = isRepeater ? "repeater" : isRoom ? "room" : isSensor ? "sensor" : "client";

    if (nodeTypeFilter !== "all" && nodeType !== nodeTypeFilter) {
      return "";
    }

    // ── Pobieranie encji ─────────────────────────────────────────────────────
    const statusId = p("online") ?? p("status");
    const successId = p("request_successes");
    const rssiId = p("last_rssi");
    const snrId = p("last_snr");
    const pathId = p("path_length");
    const routeId = p("routing_path");
    const advertId = p("last_advert");
    const battPctId = p("battery_percentage") ?? p("battery_level") ?? p("battery");
    let battVId = p("battery_voltage");
    if (!battVId && this._hass) {
      for (const [entityId, info] of Object.entries(this._hass.entities)) {
        if (info.device_id !== deviceId) continue;
        if (/_bat$|_battery_voltage$|_bat_/i.test(entityId) &&
            !/percentage|level/i.test(entityId)) {
          battVId = entityId;
          break;
        }
      }
    }
    const latId = p("latitude");
    const lonId = p("longitude");

    const sentId = p("nb_sent");
    const receivedId = p("nb_recv");
    const relayedId = p("relayed");
    const canceledId = p("canceled");
    const dupId = p("duplicate");
    const airtimeId = p("airtime_utilization");
    const rxAirtimeId = p("rx_airtime_utilization");
    const noiseId = p("noise_floor");
    const queueId = p("queue_length");
    const uptimeId = p("uptime");
    const txRateId = [p("tx_per_minute"), p("tx_rate"), p("messages_per_minute")].find((id) => entityExists(this._hass, id)) ?? null;
    const rxRateId = [p("rx_per_minute"), p("rx_rate")].find((id) => entityExists(this._hass, id)) ?? null;
    const tempId = p("ch1_temperature") ?? p("temperature");
    const tempVal = tempId ? getDisplayState(this._hass, tempId) : null;

    // ── Pobieranie wartości ─────────────────────────────────────────────────
    const status = getEntityState(this._hass, statusId);
    const rssi = rssiId ? getDisplayState(this._hass, rssiId) : null;
    const snr = snrId ? getDisplayState(this._hass, snrId) : null;
    const noise = noiseId ? getDisplayState(this._hass, noiseId) : null;
    const pathLen = pathId ? getDisplayState(this._hass, pathId) : null;
    const route = routeId ? getDisplayState(this._hass, routeId) : null;
    const lastAdv = getEntityState(this._hass, advertId);
    const battPct = battPctId ? getEntityState(this._hass, battPctId) : null;
    const battV = battVId ? getEntityState(this._hass, battVId) : null;
    const rawLat = contactId ? getEntityAttribute(this._hass, contactId, "adv_lat") ?? getEntityAttribute(this._hass, contactId, "latitude")
                  : getEntityState(this._hass, latId);
    const rawLon = contactId ? getEntityAttribute(this._hass, contactId, "adv_lon") ?? getEntityAttribute(this._hass, contactId, "longitude")
                  : getEntityState(this._hass, lonId);
    const lat = rawLat != null && parseFloat(String(rawLat)) !== 0 ? rawLat : null;
    const lon = rawLon != null && parseFloat(String(rawLon)) !== 0 ? rawLon : null;
    const locId = contactId ?? latId;

    const successes = successId ? getDisplayState(this._hass, successId) : null;
    const lastSeen = formatLastSeen(lastAdv, t);

    // ── Status online ────────────────────────────────────────────────────────
    const uptimeState = uptimeId ? this._hass?.states[uptimeId] : null;
    let online: boolean;
    if (uptimeState) {
      if (["unavailable", "unknown"].includes(uptimeState.state)) {
        online = false;
      } else {
        const ts = new Date(uptimeState.last_updated).getTime();
        online = !isNaN(ts) && (Date.now() - ts) < 6 * 3600 * 1000;
      }
    } else {
      online = successes !== null && successes !== "N/A" ? Number(successes) > 0 : isOnlineState(status);
    }

    const uptimeRaw = getEntityState(this._hass, uptimeId);
    const uptime = formatUptime(uptimeRaw);
    const txRate = txRateId ? getDisplayState(this._hass, txRateId) : null;
    const rxRate = rxRateId ? getDisplayState(this._hass, rxRateId) : null;
    const nodeTypeLabel = isRepeater
      ? (t("card.type_repeater") || "Repeater")
      : isRoom
        ? (t("card.type_room") || "Room")
        : isSensor
          ? (t("card.type_sensor") || "Sensor")
          : (t("card.type_client") || "Client");

    // ── Badges (techniczne) ──────────────────────────────────────────────
    const sfEntity = p("spreading_factor");
    const freqEntity = p("frequency");
    const txPowerEntity = p("tx_power");
    const sfVal = sfEntity ? getDisplayState(this._hass, sfEntity) : null;
    const freqVal = freqEntity ? getDisplayState(this._hass, freqEntity) : null;
    const txPowerVal = txPowerEntity ? getDisplayState(this._hass, txPowerEntity) : null;
    const techItems = [
      freqVal && freqVal !== "N/A" ? this._renderTechItem("Frequency", freqVal, "MHz", freqEntity) : "",
      sfVal && sfVal !== "N/A" ? this._renderTechItem("Spreading factor", `SF${sfVal}`, "", sfEntity) : "",
      txPowerVal && txPowerVal !== "N/A" ? this._renderTechItem("TX power", txPowerVal, "dBm", txPowerEntity) : "",
      pathLen && pathLen !== "N/A" ? this._renderTechItem("Path", pathLen, "", pathId) : "",
    ].filter(Boolean).join("");

    // ── Traffic bottom chips ──────────────────────────────────────────────
    const trafficBottom: string[] = [];
    if (entityExists(this._hass, relayedId)) {
      const val = getDisplayState(this._hass, relayedId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(relayedId)}">↺ Relayed: ${escapeHtml(val)}</span>`);
    }
    if (entityExists(this._hass, canceledId)) {
      const val = getDisplayState(this._hass, canceledId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(canceledId)}">✗ Canceled: ${escapeHtml(val)}</span>`);
    }
    if (entityExists(this._hass, dupId)) {
      const val = getDisplayState(this._hass, dupId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(dupId)}">↻ Duplicate: ${escapeHtml(val)}</span>`);
    }
    if (isRepeater && entityExists(this._hass, airtimeId)) {
      const val = getDisplayState(this._hass, airtimeId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(airtimeId)}">↓ TX air: ${escapeHtml(val)}%</span>`);
    }
    if (isRepeater && entityExists(this._hass, rxAirtimeId)) {
      const val = getDisplayState(this._hass, rxAirtimeId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(rxAirtimeId)}">↑ RX air: ${escapeHtml(val)}%</span>`);
    }
    if (isRepeater && entityExists(this._hass, queueId)) {
      const val = getDisplayState(this._hass, queueId);
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(queueId)}">Queue: ${escapeHtml(val)}</span>`);
    }
    if (txRate && txRate !== "N/A") {
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(txRateId)}">TX/min: ${escapeHtml(txRate)}</span>`);
    }
    if (rxRate && rxRate !== "N/A") {
      trafficBottom.push(`<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(rxRateId)}">RX/min: ${escapeHtml(rxRate)}</span>`);
    }

    // ── Node key ─────────────────────────────────────────────────────────────
    let nodeKey = "";
    if (contactId) {
      const advId = getEntityAttribute(this._hass, contactId, "adv_id");
      if (advId) nodeKey = String(advId);
    }
    if (!nodeKey && statusId) {
      const advId = getEntityAttribute(this._hass, statusId, "adv_id");
      if (advId) nodeKey = String(advId);
    }
    if (!nodeKey && deviceId) nodeKey = deviceId.slice(-6);

    // ── Display name ─────────────────────────────────────────────────────────
    let displayName = name.replace(/_/g, " ");
    if (displayName.toLowerCase().startsWith("meshcore ")) {
      displayName = displayName.substring(9);
    } else if (displayName.toLowerCase().startsWith("meshcore")) {
      displayName = displayName.substring(8);
    }
    const colonIndex = displayName.indexOf(": ");
    if (colonIndex !== -1 && colonIndex < 20) {
      displayName = displayName.substring(colonIndex + 2);
    }

    // ===================== GENEROWANIE HTML ==========================

    // Podstawowa część – zawsze widoczna
    let html = `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="hub-hero" style="position:relative; overflow:hidden;">
          <div class="node-card-hero-left">
            <div class="node-card-top-row">
              <div class="node-card-top-left">
                <div class="hub-online-pill">
                  <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
                  <span class="status-text ${online ? "online" : "offline"}">${escapeHtml(online ? t("card.online") : t("card.offline"))}</span>
                </div>
                ${uptime ? `<span class="hub-uptime-pill">${escapeHtml(uptime)}</span>` : ""}
              </div>
              <div class="node-card-top-right">
                ${tempVal && tempVal !== "N/A" ? `<span class="node-card-meta-pill node-card-temp-pill clickable" data-entity="${escapeHtml(tempId)}">${escapeHtml(tempVal)}°C</span>` : ""}
                <span class="node-card-type-pill">${escapeHtml(nodeTypeLabel.toUpperCase())}</span>
              </div>
            </div>
            <div class="node-card-main-row">
              <div class="node-card-title-line">
                <span class="node-card-name">${escapeHtml(displayName)}</span>
                ${nodeKey ? `<span class="node-card-id-pill clickable" data-entity="${escapeHtml(contactId ?? statusId ?? "")}">(${escapeHtml(nodeKey)})</span>` : ""}
              </div>
            </div>
            ${lastSeen ? `<div class="node-card-meta-row"><span class="node-card-meta-pill">${escapeHtml(lastSeen)}</span></div>` : ""}
          </div>
        </div>
    `;

    // Jeśli węzeł jest offline – dodajemy tylko komunikat o offline i kończymy
    if (!online) {
      html += `
          <div style="display: flex; text-align: center; justify-content: center; padding: 20px 0; color: var(--error-color, #f44336); font-weight: 700; font-size: 1.2rem; letter-spacing: 0.05em;">
            ${escapeHtml(t("card.offline_message") || "NODE OFFLINE")}
          </div>
        </div>
      `;
      return html;
    }

    // ====== Dla online – dodajemy wszystkie sekcje ======

    // Bateria
    if (battPct !== null) {
      html += this._renderHubBattery(battPct, battV, battPctId, battVId, t);
    }

    // Signal
    if (rssi !== null || snr !== null || noise !== null) {
      html += `
        <div class="section-header hub-section-header">Signal</div>
        <div class="signal-row hub-signal-row">
          ${this._renderSignalMetric(t("card.rssi_label"), rssi, "dBm", rssiId, "rssi", t)}
          ${this._renderSignalMetric(t("card.snr_label"), snr, "dB", snrId, "snr", t)}
          ${this._renderSignalMetric(t("card.noise_label"), noise, "dBm", noiseId, "noise", t)}
        </div>
      `;
    }

    // Technical items
    if (techItems) {
      html += `
        <div class="section-header hub-section-header hub-tech-header">
          <span>${escapeHtml(t("card.technical_section"))}</span>
        </div>
        <div class="hub-tech-row">
          ${techItems}
        </div>
      `;
    }

    // Traffic
    if (entityExists(this._hass, sentId) || entityExists(this._hass, receivedId)) {
      html += `
        <div class="section-header hub-section-header">${escapeHtml(t("card.traffic_section"))}</div>
        <div class="hub-traffic-panel">
          <div class="hub-traffic-top-row">
            <div class="hub-traffic-stat sent">
              <span class="hub-traffic-label">${escapeHtml(t("card.traffic_sent"))}</span>
              <span class="hub-traffic-value clickable" data-entity="${escapeHtml(sentId)}">${escapeHtml(getDisplayState(this._hass, sentId))}</span>
            </div>
            <div class="hub-traffic-center" aria-hidden="true">
              <span class="hub-traffic-center-ring"></span>
              <div class="hub-traffic-center-arrows">
                <ha-icon class="hub-traffic-center-arrow left" icon="mdi:arrow-up-bold"></ha-icon>
                <ha-icon class="hub-traffic-center-arrow right" icon="mdi:arrow-down-bold"></ha-icon>
              </div>
            </div>
            <div class="hub-traffic-stat recv">
              <span class="hub-traffic-label">${escapeHtml(t("card.traffic_received"))}</span>
              <span class="hub-traffic-value clickable" data-entity="${escapeHtml(receivedId)}">${escapeHtml(getDisplayState(this._hass, receivedId))}</span>
            </div>
          </div>
          ${trafficBottom.length ? `<div class="node-card-traffic-bottom-row">${trafficBottom.join("")}</div>` : ""}
        </div>
      `;
    }

    // Location
    if (lat !== null && lon !== null) {
      html += `
        <div class="section-header hub-section-header">${escapeHtml(t("card.location_section"))}</div>
        ${this._renderLocationPanel(lat, lon, locId, t)}
      `;
    }

    // Route
    if (route && route !== "N/A") {
      html += `<div class="hub-traffic-delivery${routeId ? " clickable" : ""}" ${routeId ? `data-entity="${escapeHtml(routeId)}"` : ""}>↝ ${escapeHtml(route)}</div>`;
    }

    // Neighbors
    html += this._renderNeighbors(node, t);

    // Zamknięcie node-block
    html += `</div>`;

    return html;
  }

  private _renderNeighbors(node: NodeInfo, t: LocalizeFunc): string {
    const neighbors = getNeighbors(this._hass, node.deviceId);
    const filteredNeighbors = filterNeighbors(neighbors, {
      skipUnavailable: true,
      skipNoSnr: true,
    });

    if (filteredNeighbors.length === 0) {
      return `
        <div class="neighbors-section">
          <div class="neighbors-header">
            <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
            <span class="count-badge">${filteredNeighbors.length}</span>
          </div>
          <div style="font-size: 11px; color: var(--secondary-text-color); text-align: center; padding: 8px;">
            ${escapeHtml(t("card.no_neighbors_info") || "No information about neighbors")}
          </div>
        </div>
      `;
    }

    const neighborRows = filteredNeighbors.map((n: NeighborInfo) => {
      const snrVal = parseFloat(String(n.snr));
      const snrClass = getSnrClass(snrVal);
      const shouldRenderSnrHistory = !!n.snrId;
      if (shouldRenderSnrHistory && n.snrId) this._ensureNeighborSnrHistory(n.snrId);
      const snrSeries = shouldRenderSnrHistory && n.snrId
        ? (this._neighborSnrHistory.get(n.snrId) ?? [])
        : [];
      const timeString = formatNeighborLastSeen(n.lastSeen);
      const rawSeen = n.rawSeen || null;
      const lastSeenLabel = t("card.neighbor_last_seen") || "Last seen";
      const contactsLabel = t("card.neighbor_contacts") || "Connections (48h)";

      return `
        <div class="neighbor-row">
          <div class="neighbor-main">
            <span class="neighbor-name ${n.contactEntityId ? 'clickable' : ''}" 
              ${n.contactEntityId ? `data-entity="${escapeHtml(n.contactEntityId)}"` : 
                (n.snrId ? `data-entity="${escapeHtml(n.snrId)}"` : '')}>
              ${escapeHtml(n.name)}
            </span>
            <div class="neighbor-stats">
              <span class="neighbor-stat">🕒 ${escapeHtml(lastSeenLabel)}: ${escapeHtml(timeString)}</span>
              ${rawSeen ? `<span class="neighbor-stat">🔗 ${escapeHtml(contactsLabel)}: ${escapeHtml(rawSeen)}x</span>` : ""}
            </div>
          </div>
          <div class="neighbor-snr-wrap">
            <span class="neighbor-snr ${snrClass} clickable" 
                data-entity="${escapeHtml(n.snrId || '')}">📡 ${escapeHtml(snrVal.toFixed(1))} dB</span>
            ${snrSeries.length >= 2 ? `<div class="neighbor-snr-history">${this._renderSignalSparkline(snrSeries, "snr")}</div>` : ""}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="neighbors-section">
        <div class="neighbors-header">
          <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
          <span class="count-badge" style="font-size:10px">${filteredNeighbors.length}</span>
        </div>
        <div class="neighbors-list">
          ${neighborRows}
        </div>
      </div>
    `;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");

    const allNodes = discoverNodes(this._hass);
    if (!allNodes.length) {
      this._setBody(`<div class="empty">${t("card.empty_nodes")}</div>`);
      return;
    }

    // ✅ Filtrujemy węzły – uwzględniamy hidden_nodes i filtr typów
    const hiddenNodes = this._config?.hidden_nodes || [];
    const nodeTypeFilter = this._config?.node_type_filter || "all";

    const nodesHtml = allNodes
      .filter((node) => !hiddenNodes.includes(node.name))
      .map((node) => this._renderNode(node, t))
      .filter(Boolean)
      .join("");

    if (!nodesHtml) {
      const filter = nodeTypeFilter === "all" ? "" : ` typu: ${nodeTypeFilter}`;
      const hiddenMsg = hiddenNodes.length ? " (po uwzględnieniu ukrytych)" : "";
      this._setBody(`<div class="empty">Brak węzłów${filter}${hiddenMsg}</div>`);
      return;
    }

    this._setBody(`
      <div class="section-label">${t("card.section_nodes")}</div>
      ${nodesHtml}
    `);
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? ' class="grid-rows"' : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".node-block");
  }

  private _scheduleTrim(rowSelector: string): void {
    if (this._trimTimer !== null) cancelAnimationFrame(this._trimTimer);
    this.style.opacity = "0";
    this._trimTimer = requestAnimationFrame(() => {
      this._trimTimer = null;
      const card = this.shadowRoot!.querySelector("ha-card") as HTMLElement | null;
      const h = card?.clientHeight ?? 0;
      if (card && h) {
        for (const el of Array.from(card.querySelectorAll<HTMLElement>(rowSelector))) {
          el.style.visibility = el.offsetTop + el.offsetHeight > h ? "hidden" : "";
        }
      }
      this.style.opacity = "";
    });
  }

  getCardSize(): number {
    return 5;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-node-card-editor");
  }

  static getStubConfig(): MeshcoreNodeCardConfig {
    return {
      node_type_filter: "all",
      hidden_nodes: [],
    };
  }
}

// ===================== EDITOR =====================
export class MeshcoreNodeCardEditor extends HTMLElement {
  private _config?: MeshcoreNodeCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreNodeCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Odświeżamy listę węzłów, jeśli się zmieniły
    const form = this.querySelector("ha-form") as any;
    if (form) form.hass = hass;
    // Jeśli zmieniły się węzły, przeładuj edytor
    const nodes = this._discoverNodes();
    const currentHidden = this._config?.hidden_nodes || [];
    // Proste sprawdzenie czy lista się zmieniła – można zrobić pełniejsze
    this._renderEditor();
  }

  private _discoverNodes(): NodeInfo[] {
    if (!this._hass) return [];
    return discoverNodes(this._hass);
  }

  private _renderEditor(): void {
    if (!this._config) return;
    while (this.lastChild) this.removeChild(this.lastChild);

    const nodes = this._discoverNodes();
    const hiddenNodes = this._config?.hidden_nodes || [];

    // Główny formularz z filtrem typu
    const form = document.createElement("ha-form") as any;
    form.hass = this._hass!;
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");

    // Schema z filtrem typu
    form.schema = [
      {
        name: "node_type_filter",
        label: t("editor.node_type_filter") || "Typ węzła",
        selector: {
          select: {
            options: [
              { value: "all", label: t("editor.filter_all") || "Wszystkie" },
              { value: "repeater", label: t("editor.filter_repeater") || "Repeater" },
              { value: "room", label: t("editor.filter_room") || "Room" },
              { value: "sensor", label: t("editor.filter_sensor") || "Sensor" },
              { value: "client", label: t("editor.filter_client") || "Klient" },
            ],
          },
        },
      },
    ];

    form.data = {
      node_type_filter: this._config.node_type_filter || "all",
    };

    form.computeLabel = (s: any) => s.label || s.name;

    form.addEventListener("value-changed", (e: CustomEvent) => {
      const value = e.detail.value;
      this._config = {
        ...this._config,
        node_type_filter: value["node_type_filter"],
      };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);

    // ── Lista checkboxów dla węzłów ──────────────────────────────────────────

    const listContainer = document.createElement("div");
    listContainer.style.cssText = "margin-top: 16px; padding: 0 8px;";

    const label = document.createElement("div");
    label.style.cssText = "font-size: 13px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 8px;";
    label.textContent = t("editor.show_hide_nodes") || "Pokaż/ukryj węzły:";
    listContainer.appendChild(label);

    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size: 12px; color: var(--secondary-text-color); opacity: 0.7;";
      empty.textContent = t("editor.no_nodes_detected") || "Nie wykryto węzłów";
      listContainer.appendChild(empty);
    } else {
      // Sortuj węzły alfabetycznie
      const sortedNodes = [...nodes].sort((a, b) => a.name.localeCompare(b.name));

      for (const node of sortedNodes) {
        const row = document.createElement("div");
        row.style.cssText = "display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid rgba(128, 128, 128, 0.1);";

        const checkbox = document.createElement("ha-checkbox") as any;
        checkbox.checked = !hiddenNodes.includes(node.name);
        checkbox.addEventListener("change", () => {
          const currentHidden = this._config?.hidden_nodes || [];
          let newHidden: string[];
          if (checkbox.checked) {
            // Usuń z listy ukrytych
            newHidden = currentHidden.filter((n) => n !== node.name);
          } else {
            // Dodaj do listy ukrytych
            newHidden = [...currentHidden, node.name];
          }
          this._config = {
            ...this._config,
            hidden_nodes: newHidden,
          };
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
        });

        // Wyświetl czytelną nazwę (bez prefiksu "MeshCore Repeater: ")
        let displayName = node.name;
        const prefixPattern = /^MeshCore\s+Repeater:\s*/i;
        if (prefixPattern.test(displayName)) {
          displayName = displayName.replace(prefixPattern, "");
        } else if (displayName.toLowerCase().startsWith("meshcore repeater: ")) {
          displayName = displayName.substring(19);
        }
        // Skróć jeśli za długie
        if (displayName.length > 40) {
          displayName = displayName.substring(0, 37) + "...";
        }

        const labelNode = document.createElement("span");
        labelNode.style.cssText = "font-size: 13px; color: var(--primary-text-color); flex: 1;";
        labelNode.textContent = displayName;

        row.appendChild(checkbox);
        row.appendChild(labelNode);
        listContainer.appendChild(row);
      }
    }

    this.appendChild(listContainer);
  }
}