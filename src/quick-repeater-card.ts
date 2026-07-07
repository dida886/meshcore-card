import type {
  HomeAssistant,
  MeshcoreQuickRepeaterConfig,
  NodeInfo,
} from "./types.js";
import {
  isOnlineState,
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
  filterNeighbors,
  discoverRepeaters,
  type NeighborInfo,
  type RepeaterData,
} from "./helpers.js";
import { STYLES } from "./styles.js";
import { QUICK_REPEATER_STYLES } from "./quick-repeater-styles.js";
import { discoverNodes } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

// ===================== INTERFACES =====================




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


  // ── Toggle rozwinięcia sąsiadów ───────────────────────────────────────────

  private _toggleNeighbors(repeaterName: string): void {
    if (this._expanded.has(repeaterName)) {
      this._expanded.delete(repeaterName);
    } else {
      this._expanded.add(repeaterName);
    }
    this._render();
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

    // Status dot
    let dotClass = "offline";
    if (online) {
      dotClass = "online";
    } else if (neighbors.length > 0) {
      dotClass = "warning";
    }

    // Uptime - skrócony
    let uptimeShort = uptime || "";
    if (uptimeShort.length > 8) {
      const parts = uptimeShort.split(" ");
      if (parts.length >= 2) {
        uptimeShort = `${parts[0]}${parts[1]}`;
      }
    }

    const batteryColorStyle = battery ? batteryColor(battery) : "";

    // ============================================================
    // HEADER – bateria klikalna
    // ============================================================
    const headerRightHtml = `
      <div class="qr-header-right">
        ${battery && entityIds.battery ? `
          <span class="qr-header-battery clickable" 
                data-entity="${escapeHtml(entityIds.battery)}"
                style="color:${batteryColorStyle}">
            🔋 ${escapeHtml(battery)}%
          </span>
        ` : battery ? `
          <span class="qr-header-battery" style="color:${batteryColorStyle}">
            🔋 ${escapeHtml(battery)}%
          </span>
        ` : ""}
        ${uptime ? `<span class="qr-header-uptime">⏱️ ${escapeHtml(uptimeShort)}</span>` : ""}
      </div>
    `;

    // ============================================================
    // METRYKI LEWE – SNR, RSSI, Noise – wszystkie klikalne
    // ============================================================
    let metricsLeftHtml = "";
    if (snr && entityIds.snr) {
      metricsLeftHtml += `<span class="qr-metric clickable" data-entity="${escapeHtml(entityIds.snr)}"><ha-icon icon="mdi:signal"></ha-icon><span class="qr-metric-value">${escapeHtml(snr)} dB</span></span>`;
    } else if (snr) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:signal"></ha-icon><span class="qr-metric-value">${escapeHtml(snr)} dB</span></span>`;
    }

    if (rssi && entityIds.rssi) {
      metricsLeftHtml += `<span class="qr-metric clickable" data-entity="${escapeHtml(entityIds.rssi)}"><ha-icon icon="mdi:wifi"></ha-icon><span class="qr-metric-value">${escapeHtml(rssi)} dBm</span></span>`;
    } else if (rssi) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:wifi"></ha-icon><span class="qr-metric-value">${escapeHtml(rssi)} dBm</span></span>`;
    }

    if (noise && entityIds.noise) {
      metricsLeftHtml += `<span class="qr-metric clickable" data-entity="${escapeHtml(entityIds.noise)}"><ha-icon icon="mdi:speaker"></ha-icon><span class="qr-metric-value">${escapeHtml(noise)} dBm</span></span>`;
    } else if (noise) {
      metricsLeftHtml += `<span class="qr-metric"><ha-icon icon="mdi:speaker"></ha-icon><span class="qr-metric-value">${escapeHtml(noise)} dBm</span></span>`;
    }

    // ============================================================
    // METRYKI PRAWE – Temperatura (klikalna)
    // ============================================================
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

    // ============================================================
    // SĄSIEDZI – z filtrowaniem i klikalnymi elementami
    // ============================================================
    let neighborsHtml = "";
    const filteredNeighbors = filterNeighbors(neighbors, {
      skipUnavailable: true,
      skipNoSnr: true,
      maxNeighbors: this._config?.max_neighbors,
    });

    if (filteredNeighbors.length > 0) {
      const neighborRows = filteredNeighbors
        .map((n) => {
          const snrClass = n.snr !== null ? getSnrClass(n.snr) : "";
          const snrDesc = n.snr !== null ? snrDescription(n.snr, t) : "";
          const timeString = n.lastSeen ? formatNeighborLastSeen(n.lastSeen) : "?";
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
                    data-entity="${escapeHtml(n.snrId || '')}"
                    title="${escapeHtml(snrDesc)}">
                  📡 ${n.snr !== null ? escapeHtml(n.snr.toFixed(1)) + " dB" : "N/A"}
                </span>
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
          <span class="qr-neighbors-count">${filteredNeighbors.length}</span>
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

    // ============================================================
    // GŁÓWNY KONTENER REPEATERA
    // ============================================================
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
    const repeaters = discoverRepeaters(this._hass, { sort_by: this._config?.sort_by });


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
      max_neighbors: 50,
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
        name: "sort_by",
        label: t("editor.sort_by") || "Sort by",
        selector: {
          select: {
            options: [
              { value: "snr", label: t("editor.sort_by_snr") },
              { value: "name", label: t("editor.sort_by_name") },
              { value: "battery", label: t("editor.sort_by_battery") },
            ],
          },
        },
      },
      {
        name: "max_neighbors",
        label: t("editor.max_neighbors") || "Maximum number of neighbors",
        selector: { number: { min: 1, max: 50, step: 1, mode: "box" } },
      },
    ];

    form.data = {
      sort_by: this._config.sort_by || "snr",
      max_neighbors: this._config.max_neighbors ?? 50,
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