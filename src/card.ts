import type {
  HomeAssistant,
  MeshcoreCardConfig,
  HubConfig,
  NodeConfig,
  HubInfo,
  NodeInfo,
} from "./types.js";
import {
  isOnlineState,
  formatLastSeen,
  batteryColor,
  formatUptime,
  escapeHtml,
  getEntityState,
  getEntityAttribute,
  entityExists,
  findEntityByDevice,
  getNeighbors,
  formatNeighborLastSeen,
  getSnrClass,
  snrDescription,
  type NeighborInfo,
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { discoverHubs, discoverNodes } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

export class MeshcoreCard extends HTMLElement {
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
      .filter(([id]) => id.includes("meshcore"))
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

  private _hubEntity(pubkey: string, hubName: string, metric: string): string | null {
    if (!this._hass) return null;
    const exact = `sensor.meshcore_${pubkey}_${metric}_${hubName}`;
    if (this._hass.states[exact]) return exact;
    for (const id of Object.keys(this._hass.states)) {
      if (id.startsWith(`sensor.meshcore_${pubkey}_${metric}`)) return id;
    }
    return null;
  }

  private _contactEntity(nodeName: string): string | null {
    if (!this._hass) return null;
    for (const [id, state] of Object.entries(this._hass.states)) {
      if (!/^binary_sensor\.meshcore_.*_contact$/.test(id)) continue;
      if (String(state.attributes["adv_name"] ?? "") === nodeName) return id;
    }
    return null;
  }

  // ── Config helpers ─────────────────────────────────────────────────────────

  private _hubCfg(pubkey: string): HubConfig {
    const v = (this._config?.hubs ?? {})[pubkey];
    if (v && typeof v === "object") return v as HubConfig;
    return { enabled: v !== false };
  }

  private _nodeCfg(name: string): NodeConfig {
    const v = (this._config?.nodes ?? {})[name];
    if (v && typeof v === "object") return v as NodeConfig;
    return { enabled: v !== false };
  }

  // ── Rendering helpers ──────────────────────────────────────────────────────

  private _progressBar(pct: string | number | null, color: string): string {
    const w = Math.min(100, Math.max(0, Number(pct) || 0));
    return `<div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>`;
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
    }${blank ? "—" : escapeHtml(value)}</span>`;
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
    const hubCfg = this._hubCfg(pubkey);

    const showTech     = this._config?.show_hub_technical ?? true;
    const showSignal   = this._config?.show_hub_signal ?? true;
    const showTraffic  = this._config?.show_hub_traffic ?? true;
    const showAdvanced = this._config?.show_hub_advanced ?? true;
    const showLocation = this._config?.show_hub_location ?? true;
    const showMqtt     = this._config?.show_hub_mqtt ?? true;
    const showAdvertButtons = this._config?.show_hub_advert_buttons ?? true;

    const statusId  = e("node_status");
    const countId   = hub.nodeCountEntity;
    const battPctId = hubCfg.battery_entity ?? e("battery_percentage");
    const battVId   = hubCfg.voltage_entity  ?? e("battery_voltage");
    const freqId    = e("frequency");
    const bwId      = e("bandwidth");
    const sfId      = e("spreading_factor");
    const txPowId   = e("tx_power");
    const latId     = e("latitude");
    const lonId     = e("longitude");
    const rssiId    = e("last_rssi");
    const snrId     = e("last_snr");
    const noiseId   = e("noise_floor");
    const sentId    = e("nb_sent");
    const recvId    = e("nb_recv");
    const recvErrId = e("recv_errors") ?? e("receive_errors");
    const queueId   = e("tx_queue_length") ?? e("queue_length");
    const msgDelivId = e("last_message_delivery");
    const txAirtimeId = e("tx_airtime") ?? e("airtime");
    const rxAirtimeId = e("rx_airtime") ?? e("rx_airtime");
    const compPrefixId = e("companion_prefix");

    const mqttIds = Object.keys(this._hass?.states ?? {})
      .filter((id) => /meshcore_[a-f0-9]+_mqtt/.test(id) && id.includes(pubkey))
      .sort();

    const status    = getEntityState(this._hass, statusId) ?? "unknown";
    const battPct   = getEntityState(this._hass, battPctId);
    const battV     = getEntityState(this._hass, battVId);
    const nodeCount = getEntityState(this._hass, countId);
    const freq      = getEntityState(this._hass, freqId);
    const bw        = getEntityState(this._hass, bwId);
    const sf        = getEntityState(this._hass, sfId);
    const txPow     = getEntityState(this._hass, txPowId);
    const lat       = getEntityState(this._hass, latId);
    const lon       = getEntityState(this._hass, lonId);
    const rssi      = getEntityState(this._hass, rssiId);
    const snr       = getEntityState(this._hass, snrId);
    const noise     = getEntityState(this._hass, noiseId);
    const sent      = getEntityState(this._hass, sentId);
    const recv      = getEntityState(this._hass, recvId);
    const recvErr   = getEntityState(this._hass, recvErrId);
    const queue     = getEntityState(this._hass, queueId);
    const msgDeliv  = getEntityState(this._hass, msgDelivId);
    const txAirtime = getEntityState(this._hass, txAirtimeId);
    const rxAirtime = getEntityState(this._hass, rxAirtimeId);
    const compPref  = getEntityState(this._hass, compPrefixId);

    const hwModel  = getEntityAttribute(this._hass, statusId, "hw_model") || getEntityAttribute(this._hass, countId, "hw_model");
    const firmware = getEntityAttribute(this._hass, statusId, "firmware_version") || getEntityAttribute(this._hass, countId, "firmware_version");

    const online  = isOnlineState(status);
    const battCol = batteryColor(battPct);
    const showRf  = freq || bw || sf || txPow;

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

  // ── Node rendering ─────────────────────────────────────────────────────────

  private _renderNode(node: NodeInfo, t: LocalizeFunc): string {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(this._hass, deviceId, m, ePrefix, eSuffix);
    const nodeCfg = this._nodeCfg(name);

    const statusId  = p("online") ?? p("status");
    const successId = p("request_successes");
    const rssiId    = p("last_rssi");
    const snrId     = p("last_snr");
    const pathId    = p("path_length");
    const routeId   = p("routing_path");
    const advertId  = p("last_advert");
    const battPctId = nodeCfg.battery_entity ?? p("battery_percentage") ?? p("battery_level") ?? p("battery");
    let battVId = nodeCfg.voltage_entity ?? null;
    if (!battVId) {
      battVId = p("battery_voltage");
    }
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
    const locEntityId = nodeCfg.location_entity ?? null;
    const contactId   = locEntityId ? null : this._contactEntity(name);
    const latId       = locEntityId ? null : p("latitude");
    const lonId       = locEntityId ? null : p("longitude");

    const sentId      = p("nb_sent");
    const receivedId  = p("nb_recv");
    const relayedId   = p("relayed");
    const canceledId  = p("canceled");
    const dupId       = p("duplicate");
    const airtimeId   = p("airtime_utilization");
    const rxAirtimeId = p("rx_airtime_utilization");
    const noiseId     = p("noise_floor");
    const queueId     = p("queue_length");
    const uptimeId    = p("uptime");
    const txRateId    = [p("tx_per_minute"), p("tx_rate"), p("messages_per_minute")].find((id) => entityExists(this._hass, id)) ?? null;
    const rxRateId    = [p("rx_per_minute"), p("rx_rate")].find((id) => entityExists(this._hass, id)) ?? null;
    const tempId = p("ch1_temperature") ?? p("temperature");
    const tempVal = tempId ? getEntityState(this._hass, tempId) : null;

    const status  = getEntityState(this._hass, statusId);
    const rssi    = getEntityState(this._hass, rssiId);
    const snr     = getEntityState(this._hass, snrId);
    const noise   = getEntityState(this._hass, noiseId);
    const pathLen = getEntityState(this._hass, pathId);
    const route   = getEntityState(this._hass, routeId);
    const lastAdv = getEntityState(this._hass, advertId);
    const battPct = getEntityState(this._hass, battPctId);
    const battV   = getEntityState(this._hass, battVId);
    const rawLat  = locEntityId ? getEntityAttribute(this._hass, locEntityId, "latitude")
                  : contactId  ? getEntityAttribute(this._hass, contactId, "adv_lat") ?? getEntityAttribute(this._hass, contactId, "latitude")
                  : getEntityState(this._hass, latId);
    const rawLon  = locEntityId ? getEntityAttribute(this._hass, locEntityId, "longitude")
                  : contactId  ? getEntityAttribute(this._hass, contactId, "adv_lon") ?? getEntityAttribute(this._hass, contactId, "longitude")
                  : getEntityState(this._hass, lonId);
    const lat     = rawLat != null && parseFloat(String(rawLat)) !== 0 ? rawLat : null;
    const lon     = rawLon != null && parseFloat(String(rawLon)) !== 0 ? rawLon : null;
    const locId   = locEntityId ?? contactId ?? latId;

    const successes = getEntityState(this._hass, successId);
    const lastSeen  = formatLastSeen(lastAdv, t);

    const isRepeater = !!(airtimeId || rxAirtimeId || noiseId) || (() => {
      if (!this._hass?.entities) return false;
      for (const [entityId, info] of Object.entries(this._hass.entities)) {
        if (info.device_id !== deviceId) continue;
        if (/_neighbor_[0-9a-f]+_seen$/.test(entityId)) return true;
      }
      return false;
    })();
    const isSensor = !isRepeater && !!(p("temperature") || p("humidity") || p("illuminance"));

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
      online = successes !== null ? Number(successes) > 0 : isOnlineState(status);
    }

    const uptimeRaw = getEntityState(this._hass, uptimeId);
    const uptime = formatUptime(uptimeRaw);
    const txRate = txRateId ? getEntityState(this._hass, txRateId) : null;
    const rxRate = rxRateId ? getEntityState(this._hass, rxRateId) : null;

    const sfEntity = p("spreading_factor");
    const freqEntity = p("frequency");
    const txPowerEntity = p("tx_power");
    const sfVal = sfEntity ? getEntityState(this._hass, sfEntity) : null;
    const freqVal = freqEntity ? getEntityState(this._hass, freqEntity) : null;
    const txPowerVal = txPowerEntity ? getEntityState(this._hass, txPowerEntity) : null;

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

    return `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="node-header">
          <div class="node-left">
            <span class="status-dot ${online ? "dot-online" : "dot-offline"}"></span>
            <span class="status-text ${online ? "online" : "offline"}">${escapeHtml(online ? t("card.online") : t("card.offline"))}</span>
            ${uptime ? `<span class="node-header-badge">${escapeHtml(uptime)}</span>` : ""}
          </div>
          <div class="node-right">
            ${sfVal ? `<span class="node-header-badge">SF${escapeHtml(sfVal)}</span>` : ""}
            ${freqVal ? `<span class="node-header-badge">${parseFloat(freqVal).toFixed(3)} MHz</span>` : ""}
            ${txPowerVal ? `<span class="node-header-badge">${escapeHtml(txPowerVal)} dBm</span>` : ""}
            ${tempVal !== null && tempId ? `<span class="node-header-badge temp clickable" data-entity="${escapeHtml(tempId)}">${escapeHtml(tempVal)}°C</span>` : ""}
            ${isRepeater ? `<span class="type-badge">${escapeHtml(t("card.type_repeater"))}</span>` : isSensor ? `<span class="type-badge">${escapeHtml(t("card.type_sensor"))}</span>` : ""}
          </div>
        </div>
        <div class="node-title-row">
          <span class="node-name">${escapeHtml(displayName)}</span>
          ${nodeKey ? `<span class="node-key dim clickable" data-entity="${escapeHtml(contactId ?? statusId ?? "")}">(${escapeHtml(nodeKey)})</span>` : ""}
        </div>
        ${route && !["unknown", "unavailable"].includes(route) ? `<div class="node-route">↝ ${escapeHtml(route)}</div>` : ""}
        ${(rssi !== null || snr !== null || (isRepeater && noise !== null)) ? `
          <div class="signal-row">
            <div class="signal-left">
              ${rssi !== null ? `<div class="signal-item"><span class="signal-label">${escapeHtml(t("card.rssi_label"))}</span><span class="signal-value clickable" data-entity="${escapeHtml(rssiId)}">${escapeHtml(rssi)} dBm</span></div>` : ""}
              ${snr !== null ? `<div class="signal-item"><span class="signal-label">${escapeHtml(t("card.snr_label"))}</span><span class="signal-value clickable" data-entity="${escapeHtml(snrId)}">${escapeHtml(snr)} dB</span></div>` : ""}
            </div>
            ${(isRepeater && noise !== null) ? `
              <div class="signal-right">
                <div class="signal-item">
                  <span class="signal-label">🔊 Noise</span>
                  <span class="signal-value clickable" data-entity="${escapeHtml(noiseId)}">${escapeHtml(noise)} dBm</span>
                </div>
              </div>` : ""}
          </div>` : ""}
        ${battPct !== null && Number(battPct) !== 0 ? `
          <div class="bar-row">
            <span class="bar-label">${escapeHtml(t("card.battery_label"))}</span>
            <span class="bar-label-right">
              ${battV !== null && parseFloat(String(battV)) >= 0.001 ? `<span class="clickable" data-entity="${escapeHtml(battVId)}">⚡ ${parseFloat(String(battV)).toFixed(3)}V</span>` : ""}
              <span class="bar-val clickable" data-entity="${escapeHtml(battPctId)}" style="color:${batteryColor(battPct)}">${escapeHtml(battPct)}%</span>
            </span>
          </div>
          ${this._progressBar(battPct, batteryColor(battPct))}` : ""}
        ${battV !== null && parseFloat(String(battV)) >= 0.001 && (battPct === null || Number(battPct) === 0) ? `
          <div class="node-chip-row">
            ${this._chip(battVId, "⚡ ", parseFloat(String(battV)).toFixed(3) + "V")}
          </div>` : ""}
        ${(entityExists(this._hass, sentId) || entityExists(this._hass, receivedId)) ? `
          <div class="section-header">${escapeHtml(t("card.traffic_section"))}</div>
          <div class="traffic-grid">
            ${entityExists(this._hass, sentId) ? `
              <div class="traffic-item">
                <span class="traffic-label">${escapeHtml(t("card.traffic_sent"))}</span>
                <span class="traffic-value clickable" data-entity="${escapeHtml(sentId)}">${escapeHtml(getEntityState(this._hass, sentId) ?? "—")}</span>
              </div>` : ""}
            ${entityExists(this._hass, receivedId) ? `
              <div class="traffic-item">
                <span class="traffic-label">${escapeHtml(t("card.traffic_received"))}</span>
                <span class="traffic-value clickable" data-entity="${escapeHtml(receivedId)}">${escapeHtml(getEntityState(this._hass, receivedId) ?? "—")}</span>
              </div>` : ""}
          </div>` : ""}
        ${(entityExists(this._hass, relayedId) || entityExists(this._hass, canceledId) || entityExists(this._hass, dupId)) ? `
          <div class="advanced-chips">
            ${entityExists(this._hass, relayedId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(relayedId)}">↺ ${escapeHtml(t("card.traffic_relayed"))}: ${escapeHtml(getEntityState(this._hass, relayedId) ?? "—")}</span>` : ""}
            ${entityExists(this._hass, canceledId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(canceledId)}">✗ ${escapeHtml(t("card.traffic_canceled"))}: ${escapeHtml(getEntityState(this._hass, canceledId) ?? "—")}</span>` : ""}
            ${entityExists(this._hass, dupId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(dupId)}">↻ ${escapeHtml(t("card.traffic_duplicate"))}: ${escapeHtml(getEntityState(this._hass, dupId) ?? "—")}</span>` : ""}
          </div>` : ""}
        ${(isRepeater && (entityExists(this._hass, airtimeId) || entityExists(this._hass, rxAirtimeId) || entityExists(this._hass, queueId) || txRate || rxRate)) ? `
          <div class="advanced-chips">
            ${entityExists(this._hass, airtimeId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(airtimeId)}">📡 TX air: ${escapeHtml(getEntityState(this._hass, airtimeId) ?? "—")}%</span>` : ""}
            ${entityExists(this._hass, rxAirtimeId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(rxAirtimeId)}">📡 RX air: ${escapeHtml(getEntityState(this._hass, rxAirtimeId) ?? "—")}%</span>` : ""}
            ${entityExists(this._hass, queueId) ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(queueId)}">📥 Queue: ${escapeHtml(getEntityState(this._hass, queueId) ?? "—")}</span>` : ""}
            ${txRate ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(txRateId)}">📤 TX/min: ${escapeHtml(txRate)}</span>` : ""}
            ${rxRate ? `<span class="advanced-chip clickable" data-entity="${escapeHtml(rxRateId)}">📥 RX/min: ${escapeHtml(rxRate)}</span>` : ""}
          </div>` : ""}
        ${lat !== null && lon !== null ? `
          <div class="section-header">${escapeHtml(t("card.location_section"))}</div>
          ${this._locLink(lat, lon, locId, t)}` : ""}
        ${(() => {
          const tempIdTele = nodeCfg.temperature_entity ?? null;
          const humidId = nodeCfg.humidity_entity    ?? null;
          const illumId = nodeCfg.illuminance_entity ?? null;
          const pressId = nodeCfg.pressure_entity    ?? null;
          const teleCells = [
            { label: t("card.telemetry_temp"),     id: tempIdTele,  unit: "°C" },
            { label: t("card.telemetry_humidity"), id: humidId, unit: "%" },
            { label: t("card.telemetry_lux"),      id: illumId, unit: " lx" },
            { label: t("card.telemetry_pressure"), id: pressId, unit: " hPa" },
          ].filter(c => entityExists(this._hass, c.id));
          if (teleCells.length === 0) return "";
          return `
            <div class="section-header">${escapeHtml(t("card.telemetry_section"))}</div>
            <div class="chip-row">
              ${teleCells.map(c => this._chip(c.id, c.label + " ", (getEntityState(this._hass, c.id) ?? "—") + c.unit)).join("")}
            </div>`;
        })()}
        ${this._renderNeighbors(node, t)}
      </div>`;
  }

  private _renderNeighbors(node: NodeInfo, t: LocalizeFunc): string {
    const neighbors = getNeighbors(this._hass, node.deviceId);
    const neighborsWithSnr = neighbors.filter(n => n.snr !== null && !isNaN(parseFloat(String(n.snr))));

    if (neighborsWithSnr.length === 0) {
      return `
        <div class="neighbors-section">
          <div class="neighbors-header">
            <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
            <span class="count-badge">${neighborsWithSnr.length}</span>
          </div>
          <div style="font-size: 11px; color: var(--secondary-text-color); text-align: center; padding: 8px;">
            ${escapeHtml(t("card.no_neighbors_info") || "No information about neighbors")}
          </div>
        </div>
      `;
    }

    const neighborRows = neighborsWithSnr.map((n: NeighborInfo) => {
      const snrVal = parseFloat(String(n.snr));
      const snrClass = getSnrClass(snrVal);
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
            <span class="neighbor-snr ${snrClass} clickable" 
                data-entity="${escapeHtml(n.snrId || '')}">📡 ${escapeHtml(snrVal.toFixed(1))} dB</span>
          </div>
          <div class="neighbor-stats">
            <span class="neighbor-stat">🕒 ${escapeHtml(lastSeenLabel)}: ${escapeHtml(timeString)}</span>
            ${rawSeen ? `<span class="neighbor-stat">🔗 ${escapeHtml(contactsLabel)}: ${escapeHtml(rawSeen)}x</span>` : ""}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="neighbors-section">
        <div class="neighbors-header">
          <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
          <span class="count-badge" style="font-size:10px">${neighborsWithSnr.length}</span>
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

    const allHubs = discoverHubs(this._hass);
    if (!allHubs.length) {
      this._setBody(`<div class="empty">${t("card.empty_hubs")}</div>`);
      return;
    }

    const visibleHubs = allHubs.filter((h) => this._hubCfg(h.pubkey).enabled !== false);
    const nodesOrder = this._config?.nodes_order ?? [];
    const nodes = discoverNodes(this._hass)
      .filter((n) => this._nodeCfg(n.name).enabled !== false)
      .sort((a, b) => {
        const ia = nodesOrder.indexOf(a.name);
        const ib = nodesOrder.indexOf(b.name);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

    const hubsHtml = visibleHubs.length
      ? `<div class="section-label">${t("card.section_hubs")}</div>` +
        visibleHubs.map((hub) => this._renderHub(hub, t)).join("")
      : "";

    const nodesHtml = nodes.length
      ? `<div class="nodes-section">
          <div class="section-label">${t("card.section_nodes")}</div>
          ${nodes.map((n) => this._renderNode(n, t)).join("")}
         </div>`
      : "";

    this._setBody(
      hubsHtml + nodesHtml ||
        `<div class="empty">All hubs and nodes are hidden.</div>`
    );
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}</style><ha-card${cls}>${body}</ha-card>`;
    if (constrained) this._scheduleTrim(".node-block");

    this.shadowRoot!.querySelectorAll('.advert-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
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