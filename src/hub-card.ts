import type {
  HomeAssistant,
  MeshcoreCardConfig,
  HubConfig,
  HubInfo,
} from "./types.js";
import {
  isOnlineState,
  batteryColor,
  escapeHtml,
  getEntityState,
  getEntityAttribute,
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

  private _locLink(lat: unknown, lon: unknown, entityId: string | null, t: LocalizeFunc): string {
    if (!entityId) return "";
    const latF = parseFloat(String(lat)).toFixed(5);
    const lonF = parseFloat(String(lon)).toFixed(5);
    const url = `https://analyzer.letsmesh.net/map?lat=${latF}&long=${lonF}&zoom=10`;
    return `<div class="loc-row">
      <span class="loc-coords clickable" data-entity="${escapeHtml(entityId)}">📍 ${latF}, ${lonF}</span>
      <a class="map-link" href="${url}" target="_blank" rel="noopener">${escapeHtml(t("card.map_link"))}</a>
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
    const compPrefixId = e("companion_prefix");

    const mqttIds = Object.keys(this._hass?.states ?? {})
      .filter((id) => /meshcore_[a-f0-9]+_mqtt/.test(id) && id.includes(pubkey))
      .sort();

    const status = getEntityState(this._hass, statusId) ?? "unknown";
    const battPct = getEntityState(this._hass, battPctId);
    const battV = getEntityState(this._hass, battVId);
    const nodeCount = getEntityState(this._hass, countId);
    const freq = getEntityState(this._hass, freqId);
    const bw = getEntityState(this._hass, bwId);
    const sf = getEntityState(this._hass, sfId);
    const txPow = getEntityState(this._hass, txPowId);
    const lat = getEntityState(this._hass, latId);
    const lon = getEntityState(this._hass, lonId);
    const rssi = getEntityState(this._hass, rssiId);
    const snr = getEntityState(this._hass, snrId);
    const noise = getEntityState(this._hass, noiseId);
    const sent = getEntityState(this._hass, sentId);
    const recv = getEntityState(this._hass, recvId);
    const recvErr = getEntityState(this._hass, recvErrId);
    const queue = getEntityState(this._hass, queueId);
    const msgDeliv = getEntityState(this._hass, msgDelivId);
    const txAirtime = getEntityState(this._hass, txAirtimeId);
    const rxAirtime = getEntityState(this._hass, rxAirtimeId);
    const compPref = getEntityState(this._hass, compPrefixId);

    const hwModel = getEntityAttribute(this._hass, statusId, "hw_model") || getEntityAttribute(this._hass, countId, "hw_model");
    const firmware = getEntityAttribute(this._hass, statusId, "firmware_version") || getEntityAttribute(this._hass, countId, "firmware_version");

    const online = isOnlineState(status);
    const battCol = batteryColor(battPct);
    const showRf = freq || bw || sf || txPow;

    let displayName = name.replace(/_/g, " ");
    const meshcorePattern = /^MeshCore\s+/i;
    if (meshcorePattern.test(displayName)) {
      displayName = displayName.replace(meshcorePattern, "");
    } else if (displayName.toLowerCase().startsWith("meshcore")) {
      displayName = displayName.substring(8);
    }

    let html = `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="node-header">
          <div class="node-left">
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
            <span class="status-text ${online ? "online" : "offline"}">${escapeHtml(online ? t("card.online") : t("card.offline"))}</span>
          </div>
          <div class="node-right">
            ${nodeCount !== null ? `<span class="count-badge clickable" data-entity="${escapeHtml(countId)}">${escapeHtml(t("card.nodes_count", { n: nodeCount }))}</span>` : ""}
            <span class="type-badge">Hub</span>
          </div>
        </div>
        <div class="node-title-row">
          <span class="hub-name">${escapeHtml(displayName)}</span>
          <span class="node-key dim clickable" data-entity="${escapeHtml(statusId ?? countId)}">(${escapeHtml(pubkey)})</span>
          ${compPref !== null ? `<span class="prefix dim">🔑 Prefix: ${escapeHtml(compPref)}</span>` : ""}
        </div>
        ${hwModel || firmware ? `<div class="hw-info">${[hwModel, firmware].filter(Boolean).map((s) => escapeHtml(s)).join(" • ")}</div>` : ""}
        ${battPct !== null && Number(battPct) !== 0 ? `
          <div class="bar-row">
            <span class="bar-label">${escapeHtml(t("card.battery_label"))}</span>
            <span class="bar-label-right">
              ${battV !== null && parseFloat(battV) >= 0.001 ? `<span class="clickable" data-entity="${escapeHtml(battVId)}">⚡ ${parseFloat(battV).toFixed(3)}V</span>` : ""}
              <span class="bar-val clickable" data-entity="${escapeHtml(battPctId)}" style="color:${battCol}">${escapeHtml(battPct)}%</span>
            </span>
          </div>
          ${this._progressBar(battPct, battCol)}` : ""}
    `;

    if (showSignal && (rssi !== null || snr !== null || noise !== null)) {
      html += `
        <div class="signal-row">
          <div class="signal-left">
            ${rssi !== null ? `<div class="signal-item"><span class="signal-label">${escapeHtml(t("card.rssi_label"))}</span><span class="signal-value clickable" data-entity="${escapeHtml(rssiId)}">${escapeHtml(rssi)} dBm</span></div>` : ""}
            ${snr !== null ? `<div class="signal-item"><span class="signal-label">${escapeHtml(t("card.snr_label"))}</span><span class="signal-value clickable" data-entity="${escapeHtml(snrId)}">${escapeHtml(snr)} dB</span></div>` : ""}
          </div>
          ${noise !== null ? `
            <div class="signal-right">
              <div class="signal-item">
                <span class="signal-label">🔊 Noise</span>
                <span class="signal-value clickable" data-entity="${escapeHtml(noiseId)}">${escapeHtml(noise)} dBm</span>
              </div>
            </div>` : ""}
        </div>`;
    }

    if (showTech && showRf) {
      html += `
        <div class="section-header">${escapeHtml(t("card.technical_section"))}</div>
        <div class="rf-row">
          ${freq ? `<span class="rf-chip clickable" data-entity="${escapeHtml(freqId)}">${parseFloat(freq).toFixed(3)} MHz</span>` : ""}
          ${bw   ? `<span class="rf-chip clickable" data-entity="${escapeHtml(bwId)}">${escapeHtml(bw)} kHz</span>` : ""}
          ${sf   ? `<span class="rf-chip clickable" data-entity="${escapeHtml(sfId)}">SF${escapeHtml(sf)}</span>` : ""}
          ${txPow ? `<span class="rf-chip clickable" data-entity="${escapeHtml(txPowId)}">${escapeHtml(txPow)} dBm</span>` : ""}
        </div>`;
    }

    if (showTraffic && (sent !== null || recv !== null)) {
      html += `
        <div class="section-header">${escapeHtml(t("card.traffic_section"))}</div>
        <div class="traffic-grid">
          ${sent !== null ? `
            <div class="traffic-item">
              <span class="traffic-label">${escapeHtml(t("card.traffic_sent"))}</span>
              <span class="traffic-value clickable" data-entity="${escapeHtml(sentId)}">${escapeHtml(sent)}</span>
            </div>` : ""}
          ${recv !== null ? `
            <div class="traffic-item">
              <span class="traffic-label">${escapeHtml(t("card.traffic_received"))}</span>
              <span class="traffic-value clickable" data-entity="${escapeHtml(recvId)}">${escapeHtml(recv)}</span>
            </div>` : ""}
        </div>`;
    }

    if (showAdvanced) {
      const chips: string[] = [];
      if (rxAirtime !== null) {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(rxAirtimeId)}">📡 RX air: ${parseFloat(rxAirtime).toFixed(1)} min</span>`);
      }
      if (recvErr !== null) {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(recvErrId)}">❌ RX errors: ${escapeHtml(recvErr)}</span>`);
      }
      if (txAirtime !== null) {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(txAirtimeId)}">📡 TX air: ${parseFloat(txAirtime).toFixed(1)} min</span>`);
      }
      if (msgDeliv !== null && msgDeliv !== 'Idle') {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(msgDelivId)}">📨 ${escapeHtml(t("card.last_message_delivery"))}: ${escapeHtml(msgDeliv)}</span>`);
      }
      if (queue !== null) {
        chips.push(`<span class="advanced-chip clickable" data-entity="${escapeHtml(queueId)}">📥 Queue: ${escapeHtml(queue)}</span>`);
      }
      if (chips.length > 0) {
        html += `<div class="advanced-chips">${chips.join("")}</div>`;
      }
    }

    if (showLocation && lat !== null && lon !== null) {
      html += `
        <div class="section-header">${escapeHtml(t("card.location_section"))}</div>
        ${this._locLink(lat, lon, latId, t)}`;
    }

    if (showMqtt && mqttIds.length) {
      html += `
        <div class="section-header">${escapeHtml(t("card.mqtt_section"))}</div>
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