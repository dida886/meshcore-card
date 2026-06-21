import type { HomeAssistant, MeshcoreContactCardConfig, HaFormElement } from "./types.js";
import { formatLastSeen, escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

// ===================== STYLES =====================
const CONTACT_STYLES: string = `
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 18px;
    background: rgba(128, 128, 128, 0.04);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(128, 128, 128, 0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    cursor: pointer;
  }
  .contact-row:hover {
    transform: translateY(-1px);
    background: rgba(128, 128, 128, 0.07);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .contact-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    color: var(--secondary-text-color);
    background: rgba(128, 128, 128, 0.05);
    border-radius: 50%;
  }
  .contact-icon ha-icon {
    --mdc-icon-size: 20px;
  }
  .contact-icon img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
  }

  .contact-info {
    flex: 1;
    min-width: 0;
  }

  .contact-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .contact-name {
    font-weight: 600;
    font-size: 0.95rem;
    text-transform: capitalize;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--primary-text-color);
  }

  .contact-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 4px;
    font-size: 11px;
    color: var(--secondary-text-color);
    opacity: 0.7;
  }

  .meta-loc {
    color: var(--mesh-blue);
    text-decoration: none;
    font-weight: 500;
    transition: opacity 0.2s;
  }
  .meta-loc:hover {
    opacity: 0.7;
  }

  .contact-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    transition: box-shadow 0.3s ease;
  }
  .dot-online {
    background: var(--mesh-green);
    box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
    animation: contact-pulse-glow 2s ease-in-out infinite;
  }
  .dot-offline {
    background: var(--secondary-text-color);
    opacity: 0.4;
  }

  @keyframes contact-pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.8); }
  }

  .type-badge {
    font-size: 10px;
    color: var(--mesh-orange);
    background: transparent;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    border: 1px solid rgba(251, 146, 60, 0.3);
    transition: all 0.2s ease;
    text-transform: capitalize;
  }
  }
  .type-badge:hover {
    transform: translateY(-1px);
  }

  .dim {
    color: var(--secondary-text-color);
    opacity: 0.5;
  }

  /* ---------- Filtr (select) ---------- */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0 12px 0;
    border-bottom: 1px solid rgba(128, 128, 128, 0.1);
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .filter-bar label {
    font-size: 13px;
    font-weight: 500;
    color: var(--secondary-text-color);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .filter-bar select {
    padding: 4px 10px;
    border-radius: 16px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font-size: 13px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .filter-bar select:hover,
  .filter-bar select:focus {
    border-color: var(--primary-color);
  }

  .action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: transform 0.2s ease, background 0.2s ease;
  }
  .action-btn:hover {
    transform: scale(1.1);
    background: rgba(128, 128, 128, 0.1);
  }
  .add-btn ha-icon {
    color: var(--mesh-green);
    --mdc-icon-size: 22px;
  }
  .remove-btn ha-icon {
    color: var(--error-color);
    --mdc-icon-size: 22px;
  }

  .empty {
    text-align: center;
    padding: 30px 0;
    color: var(--secondary-text-color);
    font-size: 14px;
  }
`;

// ===================== INTERFACE =====================
interface ContactEntry {
  entityId: string;
  advName: string;
  nodeType: string;
  lastAdvert: number;
  timeSince: string | null;
  icon: string;
  picture: string | null;
  lat: number | null;
  lon: number | null;
  unknownLocation: boolean;
  online: boolean;
  contactState: string; // "discovered", "fresh", "stale"
}

const DEFAULT_MAX_AGE_DAYS = 7;

// ===================== GŁÓWNA KLASA =====================
export class MeshcoreContactCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreContactCardConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  private _currentStateFilter: "all" | "discovered" | "fresh" | "stale" = "all";
  private _currentTypeFilter: "all" | "repeater" | "room" | "sensor" | "client" = "all";

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

  setConfig(config: MeshcoreContactCardConfig): void {
    this._config = config;
    // Ustaw domyślne filtry z konfiguracji
    this._currentStateFilter = config.contact_filter || "all";
    this._currentTypeFilter = config.node_type_filter || "all";
    this._fp = null;
    this._render();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const fp = Object.entries(hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id))
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

  // ---------- Odkrywanie kontaktów z filtrami ----------
  private _discoverContacts(t: LocalizeFunc): ContactEntry[] {
    if (!this._hass) return [];
    const maxAgeDays = this._config?.max_contact_age_days ?? DEFAULT_MAX_AGE_DAYS;
    const cutoff = Date.now() / 1000 - maxAgeDays * 86400;
    const stateFilter = this._currentStateFilter;
    const typeFilter = this._currentTypeFilter;

    return Object.entries(this._hass.states)
      .filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id))
      .map(([entityId, state]): ContactEntry => {
        const a = state.attributes as Record<string, unknown>;
        const now = Date.now() / 1000;
        const rawAdvert = Number(a["last_advert"] ?? 0);
        const lastAdvert = rawAdvert > 0 && rawAdvert <= now
          ? rawAdvert
          : state.last_updated ? new Date(state.last_updated).getTime() / 1000 : 0;
        const rawLat = a["adv_lat"] ?? a["latitude"];
        const rawLon = a["adv_lon"] ?? a["longitude"];
        const lat = rawLat != null && rawLat !== "" ? parseFloat(String(rawLat)) : null;
        const lon = rawLon != null && rawLon !== "" ? parseFloat(String(rawLon)) : null;
        const contactState = state.state; // "discovered", "fresh", "stale"
        const nodeType = String(a["node_type_str"] || "").toLowerCase();

        return {
          entityId,
          advName: String(a["adv_name"] || entityId),
          nodeType: nodeType,
          lastAdvert,
          timeSince: formatLastSeen(lastAdvert || null, t),
          icon: String(a["icon"] || "mdi:account"),
          picture: a["entity_picture"] ? String(a["entity_picture"]) : null,
          lat: lat !== null && !isNaN(lat) && lat !== 0 ? lat : null,
          lon: lon !== null && !isNaN(lon) && lon !== 0 ? lon : null,
          unknownLocation: rawLat != null && rawLon != null && (parseFloat(String(rawLat)) === 0 || parseFloat(String(rawLon)) === 0),
          online: !["stale", "off", "unavailable", "unknown"].includes(state.state),
          contactState,
        };
      })
      .filter((c) => {
        // Filtr wieku
        if (c.lastAdvert < cutoff) return false;
        // Filtr stanu (discovered, fresh, stale)
        if (stateFilter !== "all" && c.contactState !== stateFilter) return false;
        // Filtr typu węzła
        if (typeFilter !== "all" && c.nodeType !== typeFilter) return false;
        return true;
      })
      .sort((a, b) => b.lastAdvert - a.lastAdvert);
  }

  // ---------- RENDEROWANIE WIERSZA ----------
  private _renderRow(c: ContactEntry, t: LocalizeFunc): string {
    const mapUrl = c.lat !== null && c.lon !== null
      ? `https://analyzer.letsmesh.net/map?lat=${c.lat.toFixed(5)}&long=${c.lon!.toFixed(5)}&zoom=10`
      : null;

    const safePicture = c.picture && /^(?:https?:\/\/|\/)/i.test(c.picture) ? c.picture : null;
    const safeIcon = /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(c.icon) ? c.icon : "mdi:account";

    // Przycisk akcji (dodaj/usuń)
    let actionButton = "";
    if (c.contactState === "discovered") {
      actionButton = `
        <button class="action-btn add-btn" data-entity="${escapeHtml(c.entityId)}" data-action="add" title="${t("card.add_contact")}">
          <ha-icon icon="mdi:plus-circle"></ha-icon>
        </button>
      `;
    } else if (c.contactState === "fresh" || c.contactState === "stale") {
      actionButton = `
        <button class="action-btn remove-btn" data-entity="${escapeHtml(c.entityId)}" data-action="remove" title="${t("card.remove_contact")}">
          <ha-icon icon="mdi:minus-circle"></ha-icon>
        </button>
      `;
    }

    // Badge z typem węzła (jeśli istnieje)
    const typeBadge = c.nodeType && c.nodeType !== "unknown" && c.nodeType !== ""
      ? `<span class="type-badge">${escapeHtml(c.nodeType)}</span>`
      : "";

    return `
      <div class="contact-row" data-entity="${escapeHtml(c.entityId)}">
        <div class="contact-icon">
          ${safePicture
            ? `<img src="${escapeHtml(safePicture)}" alt="">`
            : `<ha-icon icon="${escapeHtml(safeIcon)}"></ha-icon>`}
        </div>
        <div class="contact-info">
          <div class="contact-header">
            <span class="contact-name">${escapeHtml(c.advName)}</span>
            ${typeBadge}
          </div>
          <div class="contact-meta">
            ${c.timeSince ? `<span>${escapeHtml(c.timeSince)}</span>` : ""}
            ${mapUrl ? `<a class="meta-loc" href="${mapUrl}" target="_blank" rel="noopener">📍 ${c.lat!.toFixed(5)}, ${c.lon!.toFixed(5)}</a>` : c.unknownLocation ? `<span class="dim">${escapeHtml(t("card.unknown_location"))}</span>` : ""}
          </div>
        </div>
        <div class="contact-right">
          <span class="status-dot ${c.online ? "dot-online" : "dot-offline"}"></span>
          ${actionButton}
        </div>
      </div>
    `;
  }

  // ---------- RENDER GŁÓWNY ----------
  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");
    const contacts = this._discoverContacts(t);

    // Opcje dla filtrów
    const stateFilterOptions = ["all", "discovered", "fresh", "stale"].sort((a, b) => a.localeCompare(b));
    const typeFilterOptions = ["all", "client", "repeater", "room", "sensor"].sort((a, b) => a.localeCompare(b));

    // Generuj pasek filtrów
    const filterBar = `
      <div class="filter-bar">
        <label>
          <ha-icon icon="mdi:filter"></ha-icon>
          ${t("card.filter_state_label")}
          <select id="contact-state-filter-select">
            ${stateFilterOptions.map(opt => `
              <option value="${opt}" ${this._currentStateFilter === opt ? "selected" : ""}>
                ${t(`card.filter_${opt}`)}
              </option>
            `).join("")}
          </select>
        </label>
        <label>
          <ha-icon icon="mdi:server-network"></ha-icon>
          ${t("card.filter_type_label")}
          <select id="contact-type-filter-select">
            ${typeFilterOptions.map(opt => `
              <option value="${opt}" ${this._currentTypeFilter === opt ? "selected" : ""}>
                ${t(`card.filter_type_${opt}`)}
              </option>
            `).join("")}
          </select>
        </label>
      </div>
    `;

    let body = filterBar;
    if (!contacts.length) {
      body += `<div class="empty">${t("card.empty_contacts")}</div>`;
    } else {
      body +=
        `<div class="section-label">${t("card.section_contacts")}</div>` +
        `<div class="contact-list">${contacts.map((c) => this._renderRow(c, t)).join("")}</div>`;
    }

    this._setBody(body);

    // Event listener dla selecta stanu
    const stateSelect = this.shadowRoot?.querySelector("#contact-state-filter-select") as HTMLSelectElement | null;
    if (stateSelect) {
      stateSelect.addEventListener("change", (e) => {
        const newFilter = (e.target as HTMLSelectElement).value as typeof this._currentStateFilter;
        if (newFilter !== this._currentStateFilter) {
          this._currentStateFilter = newFilter;
          this._render();
        }
      });
    }

    // Event listener dla selecta typu
    const typeSelect = this.shadowRoot?.querySelector("#contact-type-filter-select") as HTMLSelectElement | null;
    if (typeSelect) {
      typeSelect.addEventListener("change", (e) => {
        const newFilter = (e.target as HTMLSelectElement).value as typeof this._currentTypeFilter;
        if (newFilter !== this._currentTypeFilter) {
          this._currentTypeFilter = newFilter;
          this._render();
        }
      });
    }

    // Obsługa przycisków dodaj/usuń
    this._setupActionListeners();

    if (!!this._config?.grid_options?.rows) {
      this._scheduleTrim(".contact-row");
    }
  }

  // ---------- USTAWIENIE ZAWARTOŚCI ----------
  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}${CONTACT_STYLES}</style><ha-card${cls}>${body}</ha-card>`;
  }

  // ---------- PRZYCINANIE (grid) ----------
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

  // ---------- OBSŁUGA AKCJI (DODAJ/USUŃ) ----------
  private _setupActionListeners(): void {
    const card = this.shadowRoot?.querySelector("ha-card");
    if (!card) return;

    // Usuń stare listenery, żeby nie duplikować
    if ((card as any)._actionListener) {
      card.removeEventListener("click", (card as any)._actionListener);
    }

    const actionListener = async (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest(".action-btn") as HTMLElement;
      if (!btn) return;

      const entityId = btn.dataset["entity"];
      const action = btn.dataset["action"];
      if (!entityId || !action) return;

      const state = this._hass?.states[entityId];
      if (!state) return;

      const advName = (state.attributes as any)["adv_name"] || entityId;

      try {
        if (action === "add") {
          await this._addContact(advName);
        } else if (action === "remove") {
          await this._removeContact(advName);
        }
        // Po udanej operacji odśwież listę
        this._fp = null;
        this._render();
      } catch (error) {
        console.error("[MeshCore Contact Card] Error:", error);
      }
    };

    card.addEventListener("click", actionListener);
    (card as any)._actionListener = actionListener;
  }

  private async _addContact(name: string): Promise<void> {
    const hass = this._hass as any;
    await hass.callService("meshcore", "add_contact", {
      node_name: name,
    });
  }

  private async _removeContact(name: string): Promise<void> {
    const hass = this._hass as any;
    await hass.callService("meshcore", "remove_contact", {
      node_name: name,
    });
  }

  // ---------- METODY STATYCZNE ----------
  getCardSize(): number {
    return 4;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-contact-card-editor");
  }

  static getStubConfig(): MeshcoreContactCardConfig {
    return {
      max_contact_age_days: DEFAULT_MAX_AGE_DAYS,
      contact_filter: "all",
      node_type_filter: "all",
    };
  }
}

// ===================== EDITOR =====================
export class MeshcoreContactCardEditor extends HTMLElement {
  private _config?: MeshcoreContactCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreContactCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const form = this.querySelector("ha-form") as HaFormElement | null;
    if (form) form.hass = hass;
  }

  private _renderEditor(): void {
    if (!this._config) return;
    while (this.lastChild) this.removeChild(this.lastChild);

    const form = document.createElement("ha-form") as HaFormElement;
    form.hass = this._hass!;
    const t = makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");

    form.schema = [
      {
        name: "max_contact_age_days",
        label: t("editor.max_contact_age"),
        selector: { number: { min: 1, max: 365, step: 1, unit_of_measurement: "days", mode: "box" } } as never,
      },
      {
        name: "contact_filter",
        label: t("editor.contact_filter_label"),
        selector: {
          select: {
            options: [
              { value: "all", label: t("card.filter_all") },
              { value: "discovered", label: t("card.filter_discovered") },
              { value: "fresh", label: t("card.filter_fresh") },
              { value: "stale", label: t("card.filter_stale") },
            ],
          },
        } as never,
      },
      {
        name: "node_type_filter",
        label: t("editor.node_type_filter_label"),
        selector: {
          select: {
            options: [
              { value: "all", label: t("card.filter_type_all") },
              { value: "repeater", label: t("card.filter_type_repeater") },
              { value: "room", label: t("card.filter_type_room") },
              { value: "sensor", label: t("card.filter_type_sensor") },
              { value: "client", label: t("card.filter_type_client") },
            ],
          },
        } as never,
      },
    ];

    form.data = {
      max_contact_age_days: this._config.max_contact_age_days ?? DEFAULT_MAX_AGE_DAYS,
      contact_filter: this._config.contact_filter || "all",
      node_type_filter: this._config.node_type_filter || "all",
    };

    form.computeLabel = (s) => ("label" in s ? s.label : undefined) ?? s.name;

    form.addEventListener("value-changed", (e: Event) => {
      const value = (e as CustomEvent<{ value: Record<string, unknown> }>).detail.value;
      this._config = {
        ...this._config,
        max_contact_age_days: Number(value["max_contact_age_days"]),
        contact_filter: value["contact_filter"] as "all" | "discovered" | "fresh" | "stale",
        node_type_filter: value["node_type_filter"] as "all" | "repeater" | "room" | "sensor" | "client",
      };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });

    this.appendChild(form);
  }
}