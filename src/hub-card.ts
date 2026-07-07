import type {
  HomeAssistant,
  MeshcoreCardConfig,
  HubConfig,
  HubInfo,
} from "./types.js";
import {
  isOnlineState,
  escapeHtml,
  getEntityState,
  getEntityAttribute,
  getDisplayState,
  signalQualityLabel,
  drawParticles, 
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { discoverHubs } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

export class MeshcoreHubCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreCardConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  private _signalHistory = new Map<string, number[]>();
  private _signalHistoryFetchedAt = new Map<string, number>();
  private _signalHistoryLoading = new Set<string>();

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

  setConfig(config: MeshcoreCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => id.includes("meshcore") && id.includes("node_count"))
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

  // ── Hub entity helper ─────────────────────────────────────────────────────

  private _hubEntity(pubkey: string, hubName: string, metric: string): string | null {
    if (!this._hass) return null;
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    for (const id of Object.keys(this._hass.states)) {
      if (id.startsWith(`sensor.meshcore_${pubkey}_${metric}`)) return id;
    }
    return null;
  }

  private _hubCfg(pubkey: string): HubConfig {
    const v = (this._config?.hubs ?? {})[pubkey];
    if (v && typeof v === "object") return v as HubConfig;
    return { enabled: v !== false };
  }

  // ── Rendering helpers ──────────────────────────────────────────────────────

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
    // Używamy getDisplayState do odczytu stanu
    const pctDisplay = battPctId ? getDisplayState(this._hass, battPctId) : "N/A";
    const vDisplay = battVId ? getDisplayState(this._hass, battVId) : "N/A";

    // Jeśli obie wartości to "N/A", nie wyświetlamy panelu
    if (pctDisplay === "N/A" && vDisplay === "N/A") return "";

    let pctNumber: number | null = null;
    let pctText = "N/A";
    let dynamicBatteryColor = "#666";

    if (pctDisplay !== "N/A") {
      const rawPct = typeof battPct === "number"
        ? battPct
        : parseFloat(pctDisplay.replace(",", ".").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(rawPct)) {
        pctNumber = Math.min(100, Math.max(0, rawPct));
        pctText = `${pctNumber.toFixed(0)}%`;
        dynamicBatteryColor = `hsl(${Math.round((pctNumber / 100) * 110)}, 70%, 45%)`;
      }
    }

    let voltageText: string | null = null;
    if (vDisplay !== "N/A") {
      const v = Number(vDisplay);
      if (Number.isFinite(v) && v >= 0.001) {
        voltageText = `${v.toFixed(3)}V`;
      }
    }

    // Jeśli nadal nie ma żadnej wartości, nie wyświetlamy
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
    const qualityText = signalQualityLabel(numeric, variant, t);

    let series: number[] = [];
    if (entityId) {
      this._ensureSignalHistory(entityId);
      series = this._signalHistory.get(entityId) ?? [];
    }
    if (series.length < 2 && numeric !== null) {
      series = [0.94, 0.97, 1, 0.99, 1.02, 1.01, 1.03].map((m) => numeric * m);
    }

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

  private _fetchSignalHistoryFromRecorder(entityId: string, startIso: string, endIso: string): Promise<number[]> {
    const path = `history/period/${startIso}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}&minimal_response&no_attributes`;
    return (this._hass as any).callApi("GET", path).then((response: unknown) => {
      if (!Array.isArray(response) || !Array.isArray(response[0])) return [];
      return (response[0] as Array<{ state?: string }>)
        .map((row) => this._parseNumericMetric(row.state))
        .filter((v): v is number => v !== null);
    });
  }

  private _ensureSignalHistory(entityId: string): void {
    if (!this._hass) return;
    if (this._signalHistoryLoading.has(entityId)) return;
    const now = Date.now();
    const fetchedAt = this._signalHistoryFetchedAt.get(entityId) ?? 0;
    const ttlMs = 5 * 60 * 1000;
    if (now - fetchedAt < ttlMs) return;

    this._signalHistoryLoading.add(entityId);
    const startIso = new Date(now - 6 * 3600 * 1000).toISOString();
    const endIso = new Date(now).toISOString();
    const logbookPath = `logbook/${startIso}?entity=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}`;

    (this._hass as any).callApi("GET", logbookPath)
      .then((response: unknown) => {
        const fromLogbook = Array.isArray(response) ? this._extractNumericSeriesFromLogbook(response) : [];
        if (fromLogbook.length >= 2) {
          this._signalHistory.set(entityId, this._sampleSeries(fromLogbook));
          this._signalHistoryFetchedAt.set(entityId, Date.now());
          this._render();
          return;
        }
        return this._fetchSignalHistoryFromRecorder(entityId, startIso, endIso).then((fromHistory) => {
          this._signalHistory.set(entityId, this._sampleSeries(fromHistory));
          this._signalHistoryFetchedAt.set(entityId, Date.now());
          this._render();
        });
      })
      .catch((err: unknown) => {
        console.error(`Hub signal history fetch failed for ${entityId}:`, err);
      })
      .finally(() => {
        this._signalHistoryLoading.delete(entityId);
      });
  }

  private _locLink(lat: unknown, lon: unknown, entityId: string | null, t: LocalizeFunc): string {
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

  // ── Advert commands ──────────────────────────────────────────────────────

  private _sendAdvert(pubkey: string, flood: boolean): void {
    if (!this._hass) return;
    const command = flood ? 'send_advert(flood=True)' : 'advert';
    const feedbackId = `advert-feedback-${pubkey}`;
    const feedbackEl = this.shadowRoot?.getElementById(feedbackId);
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");

    (this._hass as any).callService('meshcore', 'execute_command', { command })
      .then(() => {
        if (feedbackEl) {
          const msg = flood ? t("card.advert_flood_sent") : t("card.advert_sent");
          feedbackEl.textContent = msg;
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = 'var(--success-color)';
          setTimeout(() => {
            feedbackEl.style.display = 'none';
          }, 3000);
        }
      })
      .catch((err: any) => {
        console.error('Advert error:', err);
        if (feedbackEl) {
          feedbackEl.textContent = t("card.advert_error") || 'Error';
          feedbackEl.style.display = 'block';
          feedbackEl.style.color = 'var(--error-color)';
          setTimeout(() => {
            feedbackEl.style.display = 'none';
          }, 3000);
        }
      });
  }

  // ── Hub rendering ──────────────────────────────────────────────────────────

  private _renderHub(hub: HubInfo, t: LocalizeFunc): string {
    const { pubkey, name } = hub;
    const e = (m: string) => this._hubEntity(pubkey, name, m);

    const showTech = this._config?.show_hub_technical ?? true;
    const showSignal = this._config?.show_hub_signal ?? true;
    const showTraffic = this._config?.show_hub_traffic ?? true;
    const showAdvanced = this._config?.show_hub_advanced ?? true;
    const showLocation = this._config?.show_hub_location ?? true;
    const showMqtt = this._config?.show_hub_mqtt ?? true;
    const showAdvertButtons = this._config?.show_hub_advert_buttons ?? true;

    const statusId = e("node_status");
    const countId = hub.nodeCountEntity;
    const battPctId = e("battery_percentage");
    const battVId = e("battery_voltage");
    const freqId = e("frequency");
    const bwId = e("bandwidth");
    const sfId = e("spreading_factor");
    const txPowId = e("tx_power");
    const latId = e("latitude");
    const lonId = e("longitude");
    const rssiId = e("last_rssi");
    const snrId = e("last_snr");
    const noiseId = e("noise_floor");
    const sentId = e("nb_sent");
    const recvId = e("nb_recv");
    const recvErrId = e("recv_errors") ?? e("receive_errors");
    const queueId = e("tx_queue_length") ?? e("queue_length");
    const msgDelivId = e("last_message_delivery");
    const txAirtimeId = e("tx_airtime") ?? e("airtime");
    const rxAirtimeId = e("rx_airtime") ?? e("rx_airtime");

    const mqttIds = Object.keys(this._hass?.states ?? {})
      .filter((id) => /meshcore_[a-f0-9]+_mqtt/.test(id) && id.includes(pubkey))
      .sort();

    // Pobieramy stany za pomocą getDisplayState
    const status = getEntityState(this._hass, statusId) ?? "unknown";
    const battPct = getEntityState(this._hass, battPctId);
    const battV = getEntityState(this._hass, battVId);
    const nodeCount = getDisplayState(this._hass, countId);
    const freq = getDisplayState(this._hass, freqId);
    const bw = getDisplayState(this._hass, bwId);
    const sf = getDisplayState(this._hass, sfId);
    const txPow = getDisplayState(this._hass, txPowId);
    const lat = getEntityState(this._hass, latId);
    const lon = getEntityState(this._hass, lonId);
    const rssi = rssiId ? getDisplayState(this._hass, rssiId) : "N/A";
    const snr = snrId ? getDisplayState(this._hass, snrId) : "N/A";
    const noise = noiseId ? getDisplayState(this._hass, noiseId) : "N/A";
    const sent = getDisplayState(this._hass, sentId);
    const recv = getDisplayState(this._hass, recvId);
    const recvErr = getDisplayState(this._hass, recvErrId);
    const queue = getDisplayState(this._hass, queueId);
    const msgDeliv = getDisplayState(this._hass, msgDelivId);
    const txAirtime = getDisplayState(this._hass, txAirtimeId);
    const rxAirtime = getDisplayState(this._hass, rxAirtimeId);

    const hwModel = getEntityAttribute(this._hass, statusId, "hw_model") || getEntityAttribute(this._hass, countId, "hw_model");
    const firmware = getEntityAttribute(this._hass, statusId, "firmware_version") || getEntityAttribute(this._hass, countId, "firmware_version");

    const online = isOnlineState(status);
    const showRf = (freq && freq !== "N/A") || (bw && bw !== "N/A") || (sf && sf !== "N/A") || (txPow && txPow !== "N/A");

    let displayName = name.replace(/_/g, " ");
    const meshcorePattern = /^MeshCore\s+/i;
    if (meshcorePattern.test(displayName)) {
      displayName = displayName.replace(meshcorePattern, "");
    } else if (displayName.toLowerCase().startsWith("meshcore")) {
      displayName = displayName.substring(8);
    }

    let html = `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="hub-hero" style="position:relative; overflow:hidden;">
          <canvas class="particle-canvas"></canvas>
          <div class="hub-card-hero-left">
            <div class="hub-card-top-row">
              <div class="hub-online-pill">
                <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
                <span class="status-text ${online ? "online" : "offline"}">${escapeHtml(online ? t("card.online") : t("card.offline"))}</span>
              </div>
              <span class="hub-type-pill">Hub</span>
            </div>
            <div class="hub-card-main-row">
              <div class="hub-card-title-line">
                <span class="hub-name">${escapeHtml(displayName)}</span>
                <span class="hub-id-pill clickable" data-entity="${escapeHtml(statusId ?? countId)}">(${escapeHtml(pubkey)})</span>
              </div>
              <div class="hub-card-meta-row">
                ${nodeCount && nodeCount !== "N/A" ? `<span class="hub-meta-pill clickable" data-entity="${escapeHtml(countId)}">${escapeHtml(t("card.nodes_count", { n: nodeCount }))}</span>` : ""}
              </div>
            </div>
          </div>
        </div>
        ${hwModel || firmware ? `<div class="hw-info">${[hwModel, firmware].filter(Boolean).map((s) => escapeHtml(s)).join(" • ")}</div>` : ""}
        ${battPct !== null ? this._renderHubBattery(battPct, battV, battPctId, battVId, t) : ""}
    `;

    if (showSignal && (rssi !== "N/A" || snr !== "N/A" || noise !== "N/A")) {
      html += `
        <div class="section-header hub-section-header">Signal</div>
        <div class="signal-row hub-signal-row">
          ${this._renderSignalMetric(t("card.rssi_label"), rssi, "dBm", rssiId, "rssi", t)}
          ${this._renderSignalMetric(t("card.snr_label"), snr, "dB", snrId, "snr", t)}
          ${this._renderSignalMetric(t("card.noise_label"), noise, "dBm", noiseId, "noise", t)}
        </div>`;
    }

    if (showTech && showRf) {
      html += `
        <div class="section-header hub-section-header hub-tech-header">
          <span>${escapeHtml(t("card.technical_section"))}</span>
        </div>
        <div class="hub-tech-row">
          ${freq && freq !== "N/A" ? `<div class="hub-tech-item clickable" data-entity="${escapeHtml(freqId)}"><div class="hub-tech-main"><span class="hub-tech-value">${parseFloat(freq).toFixed(3)} MHz</span></div><div class="hub-tech-label">Frequency</div></div>` : ""}
          ${bw && bw !== "N/A" ? `<div class="hub-tech-item clickable" data-entity="${escapeHtml(bwId)}"><div class="hub-tech-main"><span class="hub-tech-value">${escapeHtml(bw)} kHz</span></div><div class="hub-tech-label">Bandwidth</div></div>` : ""}
          ${sf && sf !== "N/A" ? `<div class="hub-tech-item clickable" data-entity="${escapeHtml(sfId)}"><div class="hub-tech-main"><span class="hub-tech-value">SF${escapeHtml(sf)}</span></div><div class="hub-tech-label">Spreading factor</div></div>` : ""}
          ${txPow && txPow !== "N/A" ? `<div class="hub-tech-item clickable" data-entity="${escapeHtml(txPowId)}"><div class="hub-tech-main"><span class="hub-tech-value">${escapeHtml(txPow)} dBm</span></div><div class="hub-tech-label">TX power</div></div>` : ""}
        </div>`;
    }

    if (showTraffic && (sent !== "N/A" || recv !== "N/A")) {
      html += `
        <div class="section-header hub-section-header">${escapeHtml(t("card.traffic_section"))}</div>
        <div class="hub-traffic-panel">
          <div class="hub-traffic-top-row">
            <div class="hub-traffic-stat sent">
              <span class="hub-traffic-label">${escapeHtml(t("card.traffic_sent"))}</span>
              <span class="hub-traffic-value clickable" data-entity="${escapeHtml(sentId)}">${escapeHtml(sent !== "N/A" ? sent : "N/A")}</span>
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
              <span class="hub-traffic-value clickable" data-entity="${escapeHtml(recvId)}">${escapeHtml(recv !== "N/A" ? recv : "N/A")}</span>
            </div>
          </div>
          <div class="hub-traffic-bottom-row">
            ${rxAirtime && rxAirtime !== "N/A" ? `<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(rxAirtimeId)}">↓ RX air: ${parseFloat(rxAirtime).toFixed(1)} min</span>` : ""}
            ${recvErr && recvErr !== "N/A" ? `<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(recvErrId)}">⊗ RX errors: <span class="hub-traffic-error">${escapeHtml(recvErr)}</span></span>` : ""}
            ${txAirtime && txAirtime !== "N/A" ? `<span class="hub-traffic-chip clickable" data-entity="${escapeHtml(txAirtimeId)}">↑ TX air: ${parseFloat(txAirtime).toFixed(1)} min</span>` : ""}
          </div>
          ${msgDeliv && msgDeliv !== "N/A" && msgDeliv !== "Idle" ? `<div class="hub-traffic-delivery clickable" data-entity="${escapeHtml(msgDelivId)}">📨 ${escapeHtml(t("card.last_message_delivery"))}: ${escapeHtml(msgDeliv)}</div>` : ""}
        </div>`;
    }

    if (showAdvanced) {
      const chips: string[] = [];
      if (queue && queue !== "N/A") {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(queueId)}">📥 Queue: ${escapeHtml(queue)}</span>`);
      }
      if (chips.length > 0) {
        html += `<div class="advanced-chips">${chips.join("")}</div>`;
      }
    }

    if (showLocation && lat !== null && lon !== null) {
      html += `
        <div class="section-header hub-section-header">${escapeHtml(t("card.location_section"))}</div>
        ${this._locLink(lat, lon, latId, t)}`;
    }

    if (showMqtt && mqttIds.length) {
      html += `
        <div class="section-header hub-section-header">${escapeHtml(t("card.mqtt_section"))}</div>
        <div class="mqtt-row">
          ${mqttIds.map((id) => {
            const v = getEntityState(this._hass, id);
            const isConnected = v === 'on';
            const cls = isConnected ? 'ok' : 'err';
            const lbl = (getEntityAttribute(this._hass, id, "server") as string | null) ||
              ((getEntityAttribute(this._hass, id, "friendly_name") as string | null) || id)
                .replace(/meshcore\s+\w+\s*/i, "")
                .replace(/_/g, " ")
                .trim();
            return `<span class="mqtt-pill ${cls} clickable" data-entity="${escapeHtml(id)}">${escapeHtml(lbl)}</span>`;
          }).join("")}
        </div>`;
    }

    if (showAdvertButtons) {
      html += `
        <div class="advert-buttons">
          <button class="advert-btn advert-zero" data-pubkey="${escapeHtml(pubkey)}" data-flood="false">
            <ha-icon icon="mdi:radio"></ha-icon>
            Advert
          </button>
          <button class="advert-btn advert-flood" data-pubkey="${escapeHtml(pubkey)}" data-flood="true">
            <ha-icon icon="mdi:radio-tower"></ha-icon>
            Advert Flood
          </button>
        </div>
        <div class="advert-feedback" id="advert-feedback-${escapeHtml(pubkey)}" style="display:none;"></div>
      `;
    }

    html += `</div>`;
    return html;
  }
  // ── Main render ────────────────────────────────────────────────────────────

  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");

    const allHubs = discoverHubs(this._hass);
    if (!allHubs.length) {
      this._setBody(`<div class="empty">${t("card.empty_hubs")}</div>`);
      return;
    }

    const visibleHubs = allHubs.filter((h) => this._hubCfg(h.pubkey).enabled !== false);

    const hubsHtml = visibleHubs.length
      ? `<div class="section-label">${t("card.section_hubs")}</div>` +
        visibleHubs.map((hub) => this._renderHub(hub, t)).join("")
      : "";

    this._setBody(hubsHtml || `<div class="empty">All hubs are hidden.</div>`);
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".node-block");

    this.shadowRoot!.querySelectorAll('.advert-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pubkey = btn.getAttribute('data-pubkey');
        const flood = btn.getAttribute('data-flood') === 'true';
        if (pubkey) {
          this._sendAdvert(pubkey, flood);
        }
      });
    });
    this._drawParticles();
  }


  private _drawParticles(): void {
    const canvases = this.shadowRoot?.querySelectorAll('.particle-canvas');
    if (!canvases || canvases.length === 0) return;

  requestAnimationFrame(() => {
    canvases.forEach((canvas) => {
      drawParticles(canvas as HTMLCanvasElement, {
          count: [4, 7],                
          color: '#00ff9d',
          lineWidth: [0.4, 2.0],
          heightFromBottom: 0,
          maxHeight: 45,
          waveLength: [50, 400],
          waveAmplitude: [2, 10],
          waveFrequency: [0.012, 0.065],
          animate: true,
          speed: 0.040,
          floatingDots: true,           
          floatingDotsCount: 50,
          pulse: true,
          glow: true,
          glowStrength: 15,                   
      });
    });
  });
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
    return document.createElement("meshcore-card-editor");
  }

  static getStubConfig(): MeshcoreCardConfig {
    return {};
  }
}

// ===================== EDITOR =====================
export class MeshcoreHubCardEditor extends HTMLElement {
  private _config?: MeshcoreCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const form = this.querySelector("ha-form") as any;
    if (form) form.hass = hass;
  }

  private _renderEditor(): void {
    if (!this._config) return;
    while (this.lastChild) this.removeChild(this.lastChild);

    const form = document.createElement("ha-form") as any;
    form.hass = this._hass!;
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");

    form.schema = [
      {
        name: "show_hub_technical",
        label: t("editor.show_hub_technical") || "Show technical section",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_signal",
        label: t("editor.show_hub_signal") || "Show signal section",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_traffic",
        label: t("editor.show_hub_traffic") || "Show traffic section",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_advanced",
        label: t("editor.show_hub_advanced") || "Show advanced section",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_location",
        label: t("editor.show_hub_location") || "Show location section",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_mqtt",
        label: t("editor.show_hub_mqtt") || "Show MQTT",
        selector: { boolean: {} },
      },
      {
        name: "show_hub_advert_buttons",
        label: t("editor.show_hub_advert_buttons") || "Show Advert buttons",
        selector: { boolean: {} },
      },
    ];

    form.data = {
      show_hub_technical: this._config.show_hub_technical ?? true,
      show_hub_signal: this._config.show_hub_signal ?? true,
      show_hub_traffic: this._config.show_hub_traffic ?? true,
      show_hub_advanced: this._config.show_hub_advanced ?? true,
      show_hub_location: this._config.show_hub_location ?? true,
      show_hub_mqtt: this._config.show_hub_mqtt ?? true,
      show_hub_advert_buttons: this._config.show_hub_advert_buttons ?? true,
    };

    form.computeLabel = (s: any) => s.label || s.name;

    form.addEventListener("value-changed", (e: CustomEvent) => {
      const value = e.detail.value;
      this._config = {
        ...this._config,
        show_hub_technical: value["show_hub_technical"],
        show_hub_signal: value["show_hub_signal"],
        show_hub_traffic: value["show_hub_traffic"],
        show_hub_advanced: value["show_hub_advanced"],
        show_hub_location: value["show_hub_location"],
        show_hub_mqtt: value["show_hub_mqtt"],
        show_hub_advert_buttons: value["show_hub_advert_buttons"],
      };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);
  }
}