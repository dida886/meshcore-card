import type { HomeAssistant, MeshcoreContactCardConfig, HaFormElement } from "./types.js";
import { formatLastSeen, escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";

// ===================== STYLES =====================
const CONTACT_STYLES: string = `
  .contact-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .contact-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 22px;
    background: transparent;
    border: 1px solid var(--glass-border);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    cursor: pointer;
  }
  .contact-row:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.2);
  }

  .contact-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    color: var(--hub-secondary-text);
    background: transparent;
    border: 1px solid var(--glass-border);
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
    font-weight: 700;
    font-size: 1rem;
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
    opacity: 0.82;
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
    margin-left: auto;
  }

  .type-badge {
    font-size: 11px;
    color: var(--mesh-orange);
    background: transparent;
    padding: 4px 10px;
    border-radius: 999px;
    font-weight: 700;
    border: 1px solid rgba(251, 146, 60, 0.45);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
    text-transform: capitalize;
  }

  .dim {
    color: var(--secondary-text-color);
    opacity: 0.5;
  }

  .section-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hub-section-text);
    padding: 8px 0 6px 0;
    border-bottom: 1px solid var(--glass-border);
    margin-bottom: 10px;
  }
  .contact-count {
    font-weight: 600;
    letter-spacing: normal;
    text-transform: none;
    color: var(--hub-secondary-text);
    opacity: 0.85;
  }

  /* ---------- Filter (select) ---------- */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0 12px 0;
    border-bottom: 1px solid var(--glass-border);
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
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--glass-border);
    background: transparent;
    color: var(--primary-text-color);
    font-size: 13px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .filter-bar select:hover,
  .filter-bar select:focus {
    border-color: rgba(96, 165, 250, 0.42);
    box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.16);
  }

  .action-btn {
    background: transparent;
    border: 1px solid var(--glass-border);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.14);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .action-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
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

  /* ---------- Responsive ---------- */
  @media (max-width: 500px) {
    .contact-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
    }

    .contact-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
    }
    .contact-icon ha-icon {
      --mdc-icon-size: 18px;
    }

    .contact-info {
      flex: 1;
      min-width: 0;
    }

    .contact-header {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .contact-name {
      font-size: 0.95rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .contact-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 2px;
      font-size: 10px;
    }
    .contact-meta span,
    .contact-meta a {
      font-size: 10px;
    }

    .type-badge {
      font-size: 9px;
      padding: 1px 10px;
      display: inline-block;
      text-align: center;
      margin: 0;
    }

    .action-btn {
      padding: 2px;
    }
    .action-btn ha-icon {
      --mdc-icon-size: 18px;
    }

    .contact-right {
      margin-left: 0;
    }
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
  pubkeyPrefix: string | null;
}

const DEFAULT_MAX_AGE_DAYS = 7;

// ===================== MAIN CLASS =====================
export class MeshcoreContactCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreContactCardConfig;
  private _fp: string | null = null;
  private _lastRender = 0;
  private _renderTimer: ReturnType<typeof setTimeout> | null = null;
  private _trimTimer: ReturnType<typeof requestAnimationFrame> | null = null;
  private _currentStateFilter: "all" | "discovered" | "fresh" | "stale" = "all";
  private _currentTypeFilter: "all" | "repeater" | "room" | "sensor" | "client" = "all";

  // Dictionary for preserving online state during operations
  private _pendingStateUpdates: Record<string, { online: boolean; timestamp: number }> = {};

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest(".action-btn")) return;
      if (target.closest(".filter-btn")) return;

      const el = target.closest("[data-entity]") as HTMLElement | null;
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

  // ---------- Helper: get online status for a prefix ----------
  private _getContactOnline(prefix: string): boolean {
    if (!this._hass) return false;
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (/^binary_sensor\.meshcore_.*_contact$/.test(entityId)) {
        const a = state.attributes as Record<string, unknown>;
        let p = a["adv_id"] ? String(a["adv_id"]) : null;
        if (!p) {
          const match = entityId.match(/meshcore_.*?_([a-f0-9]{6,})_contact$/);
          if (match) p = match[1];
        }
        if (p === prefix) {
          return !["stale", "off", "unavailable", "unknown"].includes(state.state);
        }
      }
    }
    return false;
  }

  // ---------- Discover contacts with filters ----------
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
        let contactState = state.state;
        const nodeType = String(a["node_type_str"] || "").toLowerCase();
        const advName = String(a["adv_name"] || "");

        let pubkeyPrefix: string | null = null;
        const advId = a["adv_id"] ? String(a["adv_id"]) : null;
        if (advId) {
          pubkeyPrefix = advId;
        } else {
          const match = entityId.match(/meshcore_.*?_([a-f0-9]{6,})_contact$/);
          if (match) pubkeyPrefix = match[1];
        }

        // If adv_name is empty and state is fresh/stale, contact was removed - change to discovered
        if (!advName && (contactState === "fresh" || contactState === "stale")) {
          contactState = "discovered";
        }

        // Calculate online status, checking pending updates
        let online = !["stale", "off", "unavailable", "unknown"].includes(state.state);
        if (pubkeyPrefix && this._pendingStateUpdates[pubkeyPrefix]) {
          const pending = this._pendingStateUpdates[pubkeyPrefix];
          if (Date.now() - pending.timestamp < 3000) {
            online = pending.online;
          } else {
            delete this._pendingStateUpdates[pubkeyPrefix];
          }
        }

        return {
          entityId,
          advName: advName || entityId,
          nodeType,
          lastAdvert,
          timeSince: formatLastSeen(lastAdvert || null, t),
          icon: String(a["icon"] || "mdi:account"),
          picture: a["entity_picture"] ? String(a["entity_picture"]) : null,
          lat,
          lon,
          unknownLocation: rawLat != null && rawLon != null && (parseFloat(String(rawLat)) === 0 || parseFloat(String(rawLon)) === 0),
          online,
          contactState,
          pubkeyPrefix,
        };
      })
      .filter((c) => {
        if (c.lastAdvert < cutoff) return false;
        // If no real name and not discovered - skip
        if ((!c.advName || c.advName === c.entityId) && c.contactState !== "discovered") {
          return false;
        }

        if (stateFilter !== "all" && c.contactState !== stateFilter) return false;
        if (typeFilter !== "all") {
        let matches = false;
        if (typeFilter === "room") {
          // "room" filter should also match "room server"
          matches = c.nodeType === "room" || c.nodeType === "room server";
        } else {
          matches = c.nodeType === typeFilter;
        }
        if (!matches) return false;
      }
        return true;
      })
      .sort((a, b) => b.lastAdvert - a.lastAdvert);
  }

  // ---------- Render row ----------
  private _renderRow(c: ContactEntry, t: LocalizeFunc): string {
    const mapUrl = c.lat !== null && c.lon !== null
      ? `https://analyzer.letsmesh.net/map?lat=${c.lat.toFixed(5)}&long=${c.lon!.toFixed(5)}&zoom=10`
      : null;

    const safePicture = c.picture && /^(?:https?:\/\/|\/)/i.test(c.picture) ? c.picture : null;
    const safeIcon = /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(c.icon) ? c.icon : "mdi:account";

    let actionButton = "";
    if (c.pubkeyPrefix) {
      if (c.contactState === "discovered") {
        actionButton = `
          <button class="action-btn add-btn" data-prefix="${escapeHtml(c.pubkeyPrefix)}" data-action="add" title="${t("card.add_contact")}">
            <ha-icon icon="mdi:plus-circle"></ha-icon>
          </button>
        `;
      } else if (c.contactState === "fresh" || c.contactState === "stale") {
        actionButton = `
          <button class="action-btn remove-btn" data-prefix="${escapeHtml(c.pubkeyPrefix)}" data-action="remove" title="${t("card.remove_contact")}">
            <ha-icon icon="mdi:minus-circle"></ha-icon>
          </button>
        `;
      }
    }

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
          </div>
          <div class="contact-meta">
            ${c.timeSince ? `<span>${escapeHtml(c.timeSince)}</span>` : ""}
            ${mapUrl ? `<a class="meta-loc" href="${mapUrl}" target="_blank" rel="noopener">📍 ${c.lat!.toFixed(5)}, ${c.lon!.toFixed(5)}</a>` : c.unknownLocation ? `<span class="dim">${escapeHtml(t("card.unknown_location"))}</span>` : ""}
          </div>
        </div>
        <div class="contact-right">
          ${typeBadge}
          ${actionButton}
        </div>
      </div>
    `;
  }

  // ---------- Instant button toggle ----------
  private _toggleButton(btn: HTMLElement): void {
    const action = btn.dataset["action"];
    const prefix = btn.dataset["prefix"];
    if (!prefix) return;

    if (action === "add") {
      btn.dataset["action"] = "remove";
      btn.className = "action-btn remove-btn";
      btn.title = "Remove contact";
      btn.innerHTML = `<ha-icon icon="mdi:minus-circle"></ha-icon>`;
    } else if (action === "remove") {
      btn.dataset["action"] = "add";
      btn.className = "action-btn add-btn";
      btn.title = "Add contact";
      btn.innerHTML = `<ha-icon icon="mdi:plus-circle"></ha-icon>`;
    }
  }

  // ---------- Main render ----------
  private _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(this._hass.language ?? this._hass.locale?.language ?? "en");
    const contacts = this._discoverContacts(t);

    const stateFilterOptions = ["all", ...["discovered", "fresh", "stale"].sort((a, b) => a.localeCompare(b))];
    const typeFilterOptions = ["all", ...["repeater", "room", "sensor", "client"].sort((a, b) => a.localeCompare(b))];

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
        `<div class="section-label">` +
          `<span>${t("card.section_contacts")}</span>` +
          `<span class="contact-count">(${contacts.length})</span>` +
        `</div>` +
        `<div class="contact-list">${contacts.map((c) => this._renderRow(c, t)).join("")}</div>`;
    }

    this._setBody(body);

    // Event listener for state filter select
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

    // Event listener for type filter select
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

    this._setupActionListeners();

    // Clean up expired pending entries
    for (const key of Object.keys(this._pendingStateUpdates)) {
      if (Date.now() - this._pendingStateUpdates[key].timestamp > 3000) {
        delete this._pendingStateUpdates[key];
      }
    }

    if (!!this._config?.grid_options?.rows) {
      this._scheduleTrim(".contact-row");
    }
  }

  // ---------- Set body content ----------
  private _setBody(body: string): void {
    const constrained = !!this._config?.grid_options?.rows;
    const cls = constrained ? " class=\"grid-rows\"" : "";
    this.shadowRoot!.innerHTML = `<style>${STYLES}${CONTACT_STYLES}</style><ha-card${cls}>${body}</ha-card>`;
  }

  // ---------- Trim for grid ----------
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

  // ---------- Handle add/remove buttons ----------
  private _setupActionListeners(): void {
    const card = this.shadowRoot?.querySelector("ha-card");
    if (!card) return;

    if ((card as any)._actionListener) {
      card.removeEventListener("click", (card as any)._actionListener);
    }

    const actionListener = async (e: Event) => {
      const target = e.target as HTMLElement;
      const btn = target.closest(".action-btn") as HTMLElement;
      if (!btn) return;

      e.stopPropagation();

      const prefix = btn.dataset["prefix"];
      const action = btn.dataset["action"];
      if (!prefix || !action) {
        return;
      }

      // Instant visual button toggle
      this._toggleButton(btn);

      try {
        if (action === "add") {
          await this._addContact(prefix);
        } else if (action === "remove") {
          await this._removeContact(prefix);
        }
        // Refresh list after operation
        this._fp = null;
        this._render();
      } catch (error) {
        // Restore button state on error
        this._toggleButton(btn);
        if (this._hass) {
          (this._hass as any).callService("persistent_notification", "create", {
            title: "MeshCore Contact Error",
            message: `Failed to ${action === "add" ? "add" : "remove"} contact (prefix: ${prefix}). Check console.`,
          });
        }
      }
    };

    card.addEventListener("click", actionListener);
    (card as any)._actionListener = actionListener;
  }

  // ---------- Execute MeshCore commands ----------
  private async _addContact(prefix: string): Promise<void> {
    const currentOnline = this._getContactOnline(prefix);
    this._pendingStateUpdates[prefix] = { online: currentOnline, timestamp: Date.now() };

    const hass = this._hass as any;
    const command = `add_contact ${prefix}`;
    try {
      await hass.callService("meshcore", "execute_command", {
        command: command,
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      throw e;
    } finally {
      delete this._pendingStateUpdates[prefix];
    }
  }

  private async _removeContact(prefix: string): Promise<void> {
    const currentOnline = this._getContactOnline(prefix);
    this._pendingStateUpdates[prefix] = { online: currentOnline, timestamp: Date.now() };

    const hass = this._hass as any;
    const command = `remove_contact ${prefix}`;
    try {
      await hass.callService("meshcore", "execute_command", {
        command: command,
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (e) {
      throw e;
    } finally {
      delete this._pendingStateUpdates[prefix];
    }
  }

  // ---------- Static methods ----------
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