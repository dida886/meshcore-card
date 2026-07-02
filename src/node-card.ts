import type {
  HomeAssistant,
  MeshcoreNodeCardConfig,
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
  filterNeighbors,
  snrDescription,
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
    }${blank ? "—" : escapeHtml(value)}</span>`;
  }

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

  // ── Node rendering ─────────────────────────────────────────────────────────

  private _renderNode(node: NodeInfo, t: LocalizeFunc): string {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(this._hass, deviceId, m, ePrefix, eSuffix);

    // ✅ Sprawdź, czy węzeł jest na liście do ukrycia
    const hiddenNodes = this._config?.hidden_nodes || [];
    if (hiddenNodes.includes(name)) {
      return ""; // pomijamy
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

    // ✅ Sprawdź, czy to "room" – pobieramy z kontaktu
    let isRoom = false;
    const contactId = this._contactEntity(name);
    if (contactId) {
      const nodeTypeStr = getEntityAttribute(this._hass, contactId, "node_type_str");
      if (nodeTypeStr && String(nodeTypeStr).toLowerCase() === "room") {
        isRoom = true;
      }
    }

    const nodeType = isRepeater ? "repeater" : isRoom ? "room" : isSensor ? "sensor" : "client";

    // Filtrowanie po typie
    if (nodeTypeFilter !== "all" && nodeType !== nodeTypeFilter) {
      return ""; // pomijamy
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
    const tempVal = tempId ? getEntityState(this._hass, tempId) : null;

    // ── Pobieranie wartości ─────────────────────────────────────────────────

    const status = getEntityState(this._hass, statusId);
    const rssi = getEntityState(this._hass, rssiId);
    const snr = getEntityState(this._hass, snrId);
    const noise = getEntityState(this._hass, noiseId);
    const pathLen = getEntityState(this._hass, pathId);
    const route = getEntityState(this._hass, routeId);
    const lastAdv = getEntityState(this._hass, advertId);
    const battPct = getEntityState(this._hass, battPctId);
    const battV = getEntityState(this._hass, battVId);
    const rawLat = contactId ? getEntityAttribute(this._hass, contactId, "adv_lat") ?? getEntityAttribute(this._hass, contactId, "latitude")
                  : getEntityState(this._hass, latId);
    const rawLon = contactId ? getEntityAttribute(this._hass, contactId, "adv_lon") ?? getEntityAttribute(this._hass, contactId, "longitude")
                  : getEntityState(this._hass, lonId);
    const lat = rawLat != null && parseFloat(String(rawLat)) !== 0 ? rawLat : null;
    const lon = rawLon != null && parseFloat(String(rawLon)) !== 0 ? rawLon : null;
    const locId = contactId ?? latId;

    const successes = getEntityState(this._hass, successId);
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
      online = successes !== null ? Number(successes) > 0 : isOnlineState(status);
    }

    const uptimeRaw = getEntityState(this._hass, uptimeId);
    const uptime = formatUptime(uptimeRaw);
    const txRate = txRateId ? getEntityState(this._hass, txRateId) : null;
    const rxRate = rxRateId ? getEntityState(this._hass, rxRateId) : null;

    // ── Badges ────────────────────────────────────────────────────────────────

    const sfEntity = p("spreading_factor");
    const freqEntity = p("frequency");
    const txPowerEntity = p("tx_power");
    const sfVal = sfEntity ? getEntityState(this._hass, sfEntity) : null;
    const freqVal = freqEntity ? getEntityState(this._hass, freqEntity) : null;
    const txPowerVal = txPowerEntity ? getEntityState(this._hass, txPowerEntity) : null;

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

    // ── BUILD HTML ──────────────────────────────────────────────────────────

    let html = `
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
            ${isRepeater ? `<span class="type-badge">${escapeHtml(t("card.type_repeater"))}</span>` : isRoom ? `<span class="type-badge">${escapeHtml(t("card.type_room"))}</span>` : isSensor ? `<span class="type-badge">${escapeHtml(t("card.type_sensor"))}</span>` : ""}
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
        ${isRepeater && (entityExists(this._hass, airtimeId) || entityExists(this._hass, rxAirtimeId) || entityExists(this._hass, queueId) || txRate || rxRate) ? `
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
    `;

    // ✅ Neighbors – zawsze wyświetlane jeśli istnieją
    html += this._renderNeighbors(node, t);

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