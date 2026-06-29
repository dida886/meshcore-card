import type {
  HomeAssistant,
  MeshcoreQuickRepeaterConfig,
  NodeInfo,
} from "./types.js";
import {
  isOnlineState,
  formatLastSeen,
  batteryColor,
  formatUptime,
  escapeHtml,
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { QUICK_REPEATER_STYLES } from "./quick-repeater-styles.js";
import { discoverNodes } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

// ===================== INTERFACES =====================
interface NeighborInfo {
  id: string;
  name: string;
  snr: number | null;
  lastSeen: number | null;
  rawSeen: string | null;
  contactEntityId: string | null;
  snrId?: string | null;
}

interface RepeaterData {
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

// ===================== MAIN CLASS =====================
export class MeshcoreQuickRepeaterCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreQuickRepeaterConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  private _expanded: Set<string> = new Set();

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      const neighborsHeader = target.closest(".qr-neighbors-header") as HTMLElement;
      if (neighborsHeader) {
        const repeaterName = neighborsHeader.dataset["repeater"];
        if (repeaterName) {
          this._toggleNeighbors(repeaterName);
          return;
        }
      }
      const el = target.closest("[data-entity]") as HTMLElement | null;
      if (el?.dataset["entity"]) {
        const event = new Event("hass-more-info", {
          bubbles: true,
          composed: true,
        });
        (event as Event & { detail: { entityId: string } }).detail = {
          entityId: el.dataset["entity"],
        };
        this.dispatchEvent(event);
      }
    });
  }

  setConfig(config: MeshcoreQuickRepeaterConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) =>
        /^sensor\.meshcore.*_(battery_percentage|last_rssi|last_snr|noise_floor|uptime|ch1_temperature)$/.test(id)
      )
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

  // ── Entity accessors ───────────────────────────────────────────────────────

  private _val(id: string | null): string | null {
    if (!id) return null;
    const s = this._hass?.states[id];
    return s ? s.state : null;
  }

  private _attr(id: string | null, attr: string): unknown {
    if (!id) return null;
    return this._hass?.states[id]?.attributes[attr] ?? null;
  }

  private _exists(id: string | null | undefined): boolean {
    return !!id && !!this._hass?.states[id];
  }

  private _findEntityByDevice(
    deviceId: string,
    metric: string,
    ePrefix: string,
    eSuffix: string
  ): string | null {
    if (!deviceId || !this._hass?.entities) return null;
    const pLen = (ePrefix || "").length;
    const sLen = (eSuffix || "").length;
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (info.device_id !== deviceId) continue;
      const core = entityId.slice(pLen, sLen ? -sLen : undefined);
      if (core === metric || core.endsWith(`_${metric}`)) return entityId;
    }
    for (const [entityId, info] of Object.entries(this._hass.entities)) {
      if (info.device_id !== deviceId) continue;
      if (entityId.endsWith(`_${metric}`)) return entityId;
    }
    return null;
  }

  // ── Neighbors helpers ─────────────────────────────────────────────────────

  private _getNeighbors(deviceId: string): NeighborInfo[] {
    if (!this._hass || !deviceId) return [];
    const neighborMap = new Map<string, any>();

    for (const [entityId, info] of Object.entries(this._hass.entities || {})) {
      if (info.device_id !== deviceId) continue;

      const seenMatch = entityId.match(/_neighbor_([0-9a-f]+)_seen$/);
      if (seenMatch) {
        const neighborId = seenMatch[1];
        if (!neighborMap.has(neighborId)) {
          neighborMap.set(neighborId, {});
        }
        const seenVal = this._val(entityId);
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
        const val = this._val(entityId);
        const state = this._hass?.states[entityId];
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

      for (const [entityId, state] of Object.entries(this._hass!.states)) {
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

  // ── Odkrywanie repeaterów ─────────────────────────────────────────────────

  private _discoverRepeaters(t: LocalizeFunc): RepeaterData[] {
    if (!this._hass) return [];
    const nodes = discoverNodes(this._hass);

    const repeaterNodes = nodes.filter((node) => {
      const { deviceId, ePrefix, eSuffix } = node;
      const p = (m: string) => this._findEntityByDevice(deviceId, m, ePrefix, eSuffix);

      const airtimeId = p("airtime_utilization") ?? p("airtime");
      const rxAirtimeId = p("rx_airtime_utilization") ?? p("rx_airtime");
      const noiseId = p("noise_floor");

      const hasAirtime = !!airtimeId || !!rxAirtimeId;
      const hasNoise = !!noiseId;
      const hasNeighbor = (() => {
        if (!this._hass?.entities) return false;
        for (const [entityId, info] of Object.entries(this._hass.entities)) {
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
      const p = (m: string) => this._findEntityByDevice(deviceId, m, ePrefix, eSuffix);

      const statusId = p("online") ?? p("status");
      const status = statusId ? this._hass!.states[statusId]?.state : null;
      const online = status ? isOnlineState(status) : false;

      const batteryId = p("battery_percentage") ?? p("battery_level") ?? p("battery");
      const rssiId = p("last_rssi");
      const snrId = p("last_snr");
      const noiseId = p("noise_floor");
      const uptimeId = p("uptime");

      const tempId = p("ch1_temperature") ?? p("temperature");
      const temp = tempId ? this._val(tempId) : null;

      const battery = batteryId ? this._val(batteryId) : null;
      const rssi = rssiId ? this._val(rssiId) : null;
      const snr = snrId ? this._val(snrId) : null;
      const noise = noiseId ? this._val(noiseId) : null;
      const uptimeRaw = uptimeId ? this._val(uptimeId) : null;
      const uptime = uptimeRaw ? formatUptime(uptimeRaw) : null;

      const neighbors = this._getNeighbors(deviceId);

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

    const sortBy = this._config?.sort_by || "snr";
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

  // ── Toggle rozwinięcia sąsiadów ───────────────────────────────────────────

  private _toggleNeighbors(repeaterName: string): void {
    if (this._expanded.has(repeaterName)) {
      this._expanded.delete(repeaterName);
    } else {
      this._expanded.add(repeaterName);
    }
    this._render();
  }

  private _formatNeighborLastSeen(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 0) return "?";
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.ceil(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  // ── Renderowanie pojedynczego repeatera ────────────────────────────────────

  private _renderRepeater(r: RepeaterData, t: LocalizeFunc): string {
    const { name, online, battery, rssi, snr, noise, uptime, temp, neighbors, entityIds } = r;
    const isExpanded = this._expanded.has(name);

    let displayName = name;
    const prefixPattern = /^MeshCore\s+Repeater:\s*/i;
    if (prefixPattern.test(displayName)) {
      displayName = displayName.replace(prefixPattern, "");
    } else if (displayName.toLowerCase().startsWith("meshcore repeater: ")) {
      displayName = displayName.substring(19);
    }

    let dotClass = "offline";
    if (online) {
      dotClass = "online";
    } else if (neighbors.length > 0) {
      dotClass = "warning";
    }


    let uptimeShort = uptime || "";
    if (uptimeShort.length > 8) {
      const parts = uptimeShort.split(" ");
      if (parts.length >= 2) {
        uptimeShort = `${parts[0]} ${parts[1]}`;
      }
    }

    const batteryColorStyle = battery ? batteryColor(battery) : "";

    const headerRightHtml = `
      <div class="qr-header-right">
        ${battery ? `<span class="qr-header-battery" style="color:${batteryColorStyle}">🔋 ${escapeHtml(battery)}%</span>` : ""}
        ${uptime ? `<span class="qr-header-uptime">⏱️ ${escapeHtml(uptimeShort)}</span>` : ""}
      </div>
    `;

    let metricsLeftHtml = "";
    if (snr) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:signal"></ha-icon><span class="qr-metric-value">${escapeHtml(snr)} dB</span></span>`;
    }
    if (rssi) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:wifi"></ha-icon><span class="qr-metric-value">${escapeHtml(rssi)} dBm</span></span>`;
    }
    if (noise) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:speaker"></ha-icon><span class="qr-metric-value">${escapeHtml(noise)} dBm</span></span>`;
    }

    let metricsRightHtml = "";
    if (temp !== null && temp !== "unknown" && temp !== "unavailable" && entityIds.temp) {
      metricsRightHtml += `
        <span class="qr-metric clickable" data-entity="${escapeHtml(entityIds.temp)}">
          <ha-icon icon="mdi:thermometer"></ha-icon>
          <span class="qr-metric-value">${escapeHtml(temp)}°C</span>
        </span>
      `;
    }

    const metricsHtml = `
      <div class="qr-repeater-metrics">
        <div class="qr-metrics-left">${metricsLeftHtml}</div>
        <div class="qr-metrics-right">${metricsRightHtml}</div>
      </div>
    `;

    // ── SĄSIEDZI ──
    let neighborsHtml = "";
    if (neighbors.length > 0) {
      const maxNeighbors = this._config?.max_neighbors ?? 5;
      const displayNeighbors = neighbors.slice(0, maxNeighbors);

      const neighborRows = displayNeighbors
        .map((n) => {
          let snrClass = "";
          if (n.snr !== null) {
            if (n.snr >= 9) snrClass = "green";
            else if (n.snr >= 6) snrClass = "yellow";
            else if (n.snr >= 0) snrClass = "orange";
            else snrClass = "red";
          }

          const timeString = n.lastSeen ? this._formatNeighborLastSeen(n.lastSeen) : "?";
          const rawSeen = n.rawSeen || null;

          return `
            <div class="qr-neighbor-row">
              <div class="qr-neighbor-main">
                <span class="qr-neighbor-name ${n.contactEntityId ? 'clickable' : ''}" 
                  ${n.contactEntityId ? `data-entity="${escapeHtml(n.contactEntityId)}"` : 
                    (n.snrId ? `data-entity="${escapeHtml(n.snrId)}"` : '')}>
                  ${escapeHtml(n.name)}
                </span>
                <span class="qr-neighbor-snr ${snrClass} clickable" 
                    data-entity="${escapeHtml(n.snrId || '')}">📡 ${n.snr !== null ? escapeHtml(n.snr.toFixed(1)) + " dB" : "—"}</span>
              </div>
              <div class="qr-neighbor-stats">
                <span class="qr-neighbor-stat">🕒 ${escapeHtml(t("card.neighbor_last_seen") || "Ostatnio widziany")}: ${escapeHtml(timeString)}</span>
                ${rawSeen ? `<span class="qr-neighbor-stat">🔗 ${escapeHtml(t("card.neighbor_contacts") || "Połączenia (48h)")}: ${escapeHtml(rawSeen)}x</span>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      neighborsHtml = `
        <div class="qr-neighbors-header" data-repeater="${escapeHtml(name)}">
          <span class="qr-toggle-icon ${isExpanded ? "expanded" : ""}">▶</span>
          <span>${escapeHtml(t("card.neighbors_label") || "Sąsiedzi")}</span>
          <span class="qr-neighbors-count">${neighbors.length}</span>
        </div>
        <div class="qr-neighbors-list ${isExpanded ? "expanded" : ""}">
          ${neighborRows}
        </div>
      `;
    } else {
      neighborsHtml = `
        <div class="qr-neighbors-header" data-repeater="${escapeHtml(name)}" style="cursor:default;opacity:0.6;">
          <span>${escapeHtml(t("card.neighbors_label") || "Sąsiedzi")}</span>
          <span class="qr-neighbors-count">0</span>
        </div>
      `;
    }

    const mainEntityId = entityIds.status || entityIds.snr || "";
    return `
      <div class="qr-repeater-card">
        <div class="qr-repeater-header" data-entity="${escapeHtml(mainEntityId)}">
          <span class="qr-status-dot ${dotClass}"></span>
          <span class="qr-repeater-name">${escapeHtml(displayName)}</span>
          ${headerRightHtml}
        </div>
        ${metricsHtml}
        ${neighborsHtml}
      </div>
    `;
  }

  // ── Główny render ──────────────────────────────────────────────────────────

  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");
    const repeaters = this._discoverRepeaters(t);

    if (!repeaters.length) {
      this._setBody(`<div class="qr-empty">${t("card.empty_repeaters") || "Brak repeaterów"}</div>`);
      return;
    }

    const listHtml = repeaters.map((r) => this._renderRepeater(r, t)).join("");
    this._setBody(`
      <div class="section-label">${t("card.section_nodes")}</div>
      <div class="qr-repeater-list">${listHtml}</div>
    `);
  }

  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? ' class="grid-rows"' : "";
    this.shadowRoot!.innerHTML = `
      <style>${STYLES}${QUICK_REPEATER_STYLES}</style>
      <ha-card${cls}>${body}</ha-card>
    `;
    if (constrained) this._scheduleTrim(".qr-repeater-card");
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
    return document.createElement("meshcore-quick-repeater-card-editor");
  }

  static getStubConfig(): MeshcoreQuickRepeaterConfig {
    return {
      sort_by: "snr",
      max_neighbors: 5,
    };
  }
}

// ===================== EDITOR =====================
export class MeshcoreQuickRepeaterCardEditor extends HTMLElement {
  private _config?: MeshcoreQuickRepeaterConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreQuickRepeaterConfig): void {
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
        name: "show_battery",
        label: t("editor.show_battery") || "Pokaż baterię",
        selector: { boolean: {} },
      },
      {
        name: "show_rssi",
        label: t("editor.show_rssi") || "Pokaż RSSI",
        selector: { boolean: {} },
      },
      {
        name: "show_noise",
        label: t("editor.show_noise") || "Pokaż noise floor",
        selector: { boolean: {} },
      },
      {
        name: "show_uptime",
        label: t("editor.show_uptime") || "Pokaż uptime",
        selector: { boolean: {} },
      },
      {
        name: "sort_by",
        label: t("editor.sort_by") || "Sortuj według",
        selector: {
          select: {
            options: [
              { value: "snr", label: "SNR (najlepszy)" },
              { value: "name", label: "Nazwa" },
              { value: "battery", label: "Bateria (najwyższa)" },
            ],
          },
        },
      },
      {
        name: "max_neighbors",
        label: t("editor.max_neighbors") || "Maksymalna liczba sąsiadów",
        selector: { number: { min: 1, max: 20, step: 1, mode: "box" } },
      },
    ];

    form.data = {
      sort_by: this._config.sort_by || "snr",
      max_neighbors: this._config.max_neighbors ?? 5,
    };

    form.computeLabel = (s: any) => s.label || s.name;

    form.addEventListener("value-changed", (e: CustomEvent) => {
      const value = e.detail.value;
      this._config = {
        ...this._config,
        sort_by: value["sort_by"],
        max_neighbors: Number(value["max_neighbors"]),
      };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);
  }
}