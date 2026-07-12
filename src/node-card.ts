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
  parseNumericMetric,
  sampleSeries,
  extractNumericSeriesFromLogbook,
  signalGaugePct,
  type NeighborInfo,
} from "./helpers.js";
import { discoverNodes } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { MeshcoreBaseCard } from "./base-card.js";
import {
  isValid,
  clickable,
  sectionHeader,
  renderTechItem,
  renderChip,
  renderBatteryPanel,
  renderSignalCard,
} from "./ui-helpers.js";

export class MeshcoreNodeCard extends MeshcoreBaseCard {
  protected _config?: MeshcoreNodeCardConfig;
  private _neighborSnrHistory = new Map<string, number[]>();
  private _neighborSnrHistoryFetchedAt = new Map<string, number>();
  private _neighborSnrHistoryLoading = new Set<string>();
  private _expandedNodes: Set<string> = new Set();

  protected _additionalStyles(): string {
    return "";
  }

  setConfig(config: MeshcoreNodeCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  protected _computeFingerprint(): string {
    if (!this._hass) return "";
    return Object.entries(this._hass.states)
      .filter(([id]) => id.includes("meshcore") && !id.includes("node_count"))
      .map(([id, s]) => `${id}=${s.state}@${s.last_changed}`)
      .join("|");
  }

  // ── Obsługa kliknięć – rozwijanie sąsiadów ────────────────────────────────

  protected handleClick(e: Event): void {
    const target = e.target as HTMLElement;
    const neighborsHeader = target.closest(".neighbors-toggle-header") as HTMLElement;
    if (neighborsHeader) {
      const nodeName = neighborsHeader.dataset["nodeName"];
      if (nodeName) {
        this._toggleNeighbors(nodeName);
      }
      return;
    }
    super.handleClick(e);
  }

  private _toggleNeighbors(nodeName: string): void {
    if (this._expandedNodes.has(nodeName)) {
      this._expandedNodes.delete(nodeName);
    } else {
      this._expandedNodes.add(nodeName);
    }
    this._render();
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

  private _fetchHistoryFromRecorder(entityId: string, startIso: string, endIso: string): Promise<number[]> {
    const path = `history/period/${startIso}?filter_entity_id=${encodeURIComponent(entityId)}&end_time=${encodeURIComponent(endIso)}&minimal_response&no_attributes`;
    return (this._hass as any).callApi("GET", path).then((response: unknown) => {
      if (!Array.isArray(response) || !Array.isArray(response[0])) return [];
      return (response[0] as Array<{ state?: string }>)
        .map((row) => parseNumericMetric(row.state))
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
        const fromLogbook = Array.isArray(response) ? extractNumericSeriesFromLogbook(response) : [];
        if (fromLogbook.length >= 2) {
          this._neighborSnrHistory.set(entityId, sampleSeries(fromLogbook));
          this._neighborSnrHistoryFetchedAt.set(entityId, Date.now());
          this._render();
          return;
        }
        return this._fetchHistoryFromRecorder(entityId, startIso, endIso).then((fromHistory) => {
          this._neighborSnrHistory.set(entityId, sampleSeries(fromHistory));
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

  private _renderLocationPanel(lat: unknown, lon: unknown, entityId: string | null, t: LocalizeFunc): string {
    if (!entityId) return "";
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

  // ── Node rendering ─────────────────────────────────────────────────────────

  private _renderNode(node: NodeInfo, t: LocalizeFunc): string {
    const { name, deviceId, ePrefix, eSuffix } = node;
    const p = (m: string) => findEntityByDevice(this._hass, deviceId, m, ePrefix, eSuffix);

    const hiddenNodes = this._config?.hidden_nodes || [];
    if (hiddenNodes.includes(name)) return "";

    const nodeTypeFilter = this._config?.node_type_filter || "all";

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

    if (nodeTypeFilter !== "all" && nodeType !== nodeTypeFilter) return "";

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
      renderTechItem(this._hass, "Frequency", freqVal, "MHz", freqEntity),
      renderTechItem(this._hass, "Spreading factor", sfVal ? `SF${sfVal}` : null, "", sfEntity),
      renderTechItem(this._hass, "TX power", txPowerVal, "dBm", txPowerEntity),
      renderTechItem(this._hass, "Path", pathLen, "", pathId),
    ].filter(Boolean).join("");

    // ── Traffic bottom chips ──────────────────────────────────────────────
    const trafficBottom: string[] = [];
    trafficBottom.push(renderChip(this._hass, "↺ Relayed", relayedId));
    trafficBottom.push(renderChip(this._hass, "✗ Canceled", canceledId));
    trafficBottom.push(renderChip(this._hass, "↻ Duplicate", dupId));
    if (isRepeater) trafficBottom.push(renderChip(this._hass, "↓ TX air", airtimeId));
    if (isRepeater) trafficBottom.push(renderChip(this._hass, "↑ RX air", rxAirtimeId));
    if (isRepeater) trafficBottom.push(renderChip(this._hass, "Queue", queueId));
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

    let html = `
      <div class="node-block ${online ? "" : "node-offline"}">
        <div class="hub-hero" style="position:relative; overflow:hidden;">
          <div class="node-card-hero-left">
            <div class="node-card-top-row">
              <div class="node-card-top-left">
                <div class="hub-${online ? "online" : "offline"}-pill">
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

    if (!online) {
      html += `
          <div style="display: flex; text-align: center; justify-content: center; padding: 5px 0; color: var(--error-color, #f44336); font-weight: 700; font-size: 1.2rem; letter-spacing: 0.05em;">
            ${escapeHtml(t("card.offline_message") || "NODE OFFLINE")}
          </div>
        </div>
      `;
      return html;
    }

    // Bateria
    if (battPct !== null) {
      html += `${battPct !== null && battV !== null ? renderBatteryPanel(battPct, battV, battPctId, battVId, t) : ""}`;
    }

    // Signal
    if (rssi !== null || snr !== null || noise !== null) {
      html += `
        ${sectionHeader("Signal")}
        <div class="signal-row hub-signal-row">
          ${renderSignalCard(this._hass, t("card.rssi_label"), "dBm", rssiId, "rssi", t)}
          ${renderSignalCard(this._hass, t("card.snr_label"), "dB", snrId, "snr", t)}
          ${renderSignalCard(this._hass, t("card.noise_label"), "dBm", noiseId, "noise", t)}
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
        ${sectionHeader(t("card.traffic_section"))}
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
        ${sectionHeader(t("card.location_section"))}
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

    const nodeName = node.name;
    const defaultExpanded = this._config?.neighbors_expanded_default ?? true;
    const isExpanded = this._expandedNodes.has(nodeName)
      ? this._expandedNodes.has(nodeName)
      : defaultExpanded;

    if (filteredNeighbors.length === 0) {
      return `
        <div class="neighbors-section">
          <div class="neighbors-toggle-header" data-node-name="${escapeHtml(nodeName)}" style="cursor:default;opacity:0.6;">
            <span class="qr-toggle-icon">▶</span>
            <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
            <span class="count-badge">0</span>
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
      if (n.snrId) this._ensureNeighborSnrHistory(n.snrId);
      const snrSeries = n.snrId ? (this._neighborSnrHistory.get(n.snrId) ?? []) : [];
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
        <div class="neighbors-toggle-header" data-node-name="${escapeHtml(nodeName)}">
          <span class="qr-toggle-icon ${isExpanded ? "expanded" : ""}">▶</span>
          <span>${escapeHtml(t("card.neighbors_label") || "Neighbors")}</span>
          <span class="count-badge">${filteredNeighbors.length}</span>
        </div>
        <div class="neighbors-list ${isExpanded ? "expanded" : ""}">
          ${neighborRows}
        </div>
      </div>
    `;
  }

  // ── Main render ────────────────────────────────────────────────────────────

  protected _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");

    const allNodes = discoverNodes(this._hass);
    if (!allNodes.length) {
      this._setBody(`<div class="empty">${t("card.empty_nodes")}</div>`);
      return;
    }

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
    `, ".node-block");
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
    const form = this.querySelector("ha-form") as any;
    if (form) form.hass = hass;
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

    const form = document.createElement("ha-form") as any;
    form.hass = this._hass!;
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");

    form.schema = [
      {
        name: "node_type_filter",
        label: t("editor.node_type_filter") || "Node type filter",
        selector: {
          select: {
            options: [
              { value: "all", label: t("editor.filter_all") || "All" },
              { value: "repeater", label: t("editor.filter_repeater") || "Repeater" },
              { value: "room", label: t("editor.filter_room") || "Room" },
              { value: "sensor", label: t("editor.filter_sensor") || "Sensor" },
              { value: "client", label: t("editor.filter_client") || "Client" },
            ],
          },
        },
      },
      {
        name: "neighbors_expanded_default",
        label: t("editor.neighbors_expanded_default") || "Default neighbors expanded",
        selector: { boolean: {} },
      },
    ];

    form.data = {
      node_type_filter: this._config.node_type_filter || "all",
      neighbors_expanded_default: this._config.neighbors_expanded_default ?? true,
    };

    form.computeLabel = (s: any) => s.label || s.name;

    form.addEventListener("value-changed", (e: CustomEvent) => {
      const value = e.detail.value;
      this._config = {
        ...this._config,
        node_type_filter: value["node_type_filter"],
        neighbors_expanded_default: value["neighbors_expanded_default"],
      };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);

    // ── Lista checkboxów dla węzłów ──────────────────────────────────────────

    const listContainer = document.createElement("div");
    listContainer.style.cssText = "margin-top: 16px; padding: 0 8px;";

    const label = document.createElement("div");
    label.style.cssText = "font-size: 13px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 8px;";
    label.textContent = t("editor.show_hide_nodes") || "Show/Hide nodes:";
    listContainer.appendChild(label);

    if (nodes.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "font-size: 12px; color: var(--secondary-text-color); opacity: 0.7;";
      empty.textContent = t("editor.no_nodes_detected") || "No nodes detected";
      listContainer.appendChild(empty);
    } else {
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
            newHidden = currentHidden.filter((n) => n !== node.name);
          } else {
            newHidden = [...currentHidden, node.name];
          }
          this._config = {
            ...this._config,
            hidden_nodes: newHidden,
          };
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
        });

        let displayName = node.name;
        const prefixPattern = /^MeshCore\s+Repeater:\s*/i;
        if (prefixPattern.test(displayName)) {
          displayName = displayName.replace(prefixPattern, "");
        } else if (displayName.toLowerCase().startsWith("meshcore repeater: ")) {
          displayName = displayName.substring(19);
        }
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