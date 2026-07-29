// src/trace-card.ts

import type { HomeAssistant, MeshcoreTraceCardConfig } from "./types.js";
import { escapeHtml } from "./helpers.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { MeshcoreBaseCard } from "./base-card.js";
import { sectionHeader } from "./ui-helpers.js";

export class MeshcoreTraceCard extends MeshcoreBaseCard {
  protected _config?: MeshcoreTraceCardConfig;
  private _selectedContact: string | null = null;
  private _timeout: number = 15;
  private _isTracing = false;
  private _statusTimeoutId: number | null = null;

  private _contactSelect?: HTMLSelectElement;
  private _timeoutInput?: HTMLInputElement;
  private _traceButton?: HTMLButtonElement;
  private _statusDiv?: HTMLDivElement;

  protected _additionalStyles(): string {
    return "";
  }

  setConfig(config: MeshcoreTraceCardConfig): void {
    this._config = config;
    if (config.timeout !== undefined) this._timeout = config.timeout;
    this._fp = null;
    this._render();
  }

  protected _computeFingerprint(): string {
    if (!this._hass) return "";
    return JSON.stringify(this._config) + (this._hass.language || "");
  }

  // ---------- Get contacts from select.meshcore_added_contact ----------
  private _getContacts(): any[] {
    if (!this._hass) return [];

    if ((MeshcoreTraceCard as any)._globalContactsCache) {
      return (MeshcoreTraceCard as any)._globalContactsCache;
    }

    const contactSelect = Object.values(this._hass.states).find(
      (s) => s.entity_id === "select.meshcore_added_contact"
    );
    if (!contactSelect) return [];

    const options = contactSelect.attributes.options || [];
    const contacts: any[] = [];
    const seen = new Set<string>();

    for (const option of options) {
      const trimmed = option.trim();
      if (!trimmed || trimmed === "" || 
          trimmed === "Select a contact..." || trimmed === "Wybierz kontakt" ||
          trimmed.includes("Select a contact") || trimmed.includes("Wybierz kontakt")) {
        continue;
      }

      let advId: string | null = null;
      let cleanName = trimmed;

      const pubkeyMatch = trimmed.match(/\(([a-fA-F0-9]+)\)$/);
      if (pubkeyMatch) {
        advId = pubkeyMatch[1];
        cleanName = trimmed.replace(/\s*\([a-fA-F0-9]+\)$/, "").trim();
      }

      if (!advId) {
        const contactSensors = Object.entries(this._hass.states).filter(
          ([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id)
        );
        for (const [entityId, state] of contactSensors) {
          const attrs = state.attributes as any;
          if ((attrs.adv_name || "") === cleanName) {
            const m = entityId.match(/meshcore_.*?_([a-f0-9]+)_contact$/);
            if (m) advId = m[1];
            break;
          }
        }
      }

      if (!advId) {
        const hexMatch = cleanName.match(/[a-fA-F0-9]{6,}/);
        if (hexMatch) advId = hexMatch[0].substring(0, 6);
      }

      if (advId && advId.length > 6) {
        advId = advId.substring(0, 6);
      }

      const key = advId || cleanName;
      if (seen.has(key)) continue;
      seen.add(key);

      contacts.push({
        name: cleanName,
        advId: advId,
        entityId: contactSelect.entity_id,
      });
    }

    contacts.sort((a, b) => a.name.localeCompare(b.name));
    (MeshcoreTraceCard as any)._globalContactsCache = contacts;
    return contacts;
  }

  // ---------- Clear status after delay ----------
  private _clearStatusAfterDelay(delayMs: number = 12000): void {
    // Anuluj poprzedni timeout jeśli istnieje
    if (this._statusTimeoutId) {
      clearTimeout(this._statusTimeoutId);
      this._statusTimeoutId = null;
    }
    this._statusTimeoutId = window.setTimeout(() => {
      if (this._statusDiv) {
        this._statusDiv.textContent = "";
      }
      this._statusTimeoutId = null;
    }, delayMs);
  }

  // ---------- Execute trace using WebSocket API ----------
  private async _executeTrace(pubkeyPrefix: string): Promise<void> {
    if (!this._hass || !pubkeyPrefix) return;
    const t = this._getTranslations();

    // Anuluj poprzednie czyszczenie statusu
    if (this._statusTimeoutId) {
      clearTimeout(this._statusTimeoutId);
      this._statusTimeoutId = null;
    }

    if (pubkeyPrefix.length !== 6) {
      if (this._statusDiv) {
        this._statusDiv.textContent = t("trace.error_invalid_prefix") || 
          `❌ Invalid pubkey prefix: must be 6 characters (got ${pubkeyPrefix.length})`;
        this._statusDiv.style.color = "var(--error-color)";
        this._clearStatusAfterDelay(12000);
      }
      return;
    }

    this._isTracing = true;
    if (this._traceButton) this._traceButton.disabled = true;

    // Ustaw status "sending"
    if (this._statusDiv) {
      this._statusDiv.textContent = t("trace.sending") || "📡 Sending trace...";
      this._statusDiv.style.color = "var(--secondary-text-color)";
    }

    try {
      const connection = (this._hass as any).connection;
      const response = await connection.sendMessagePromise({
        type: "call_service",
        domain: "meshcore",
        service: "trace",
        service_data: {
          pubkey_prefix: pubkeyPrefix,
          timeout: this._timeout,
        },
        return_response: true,
      });

      // Obsługa odpowiedzi
      if (this._statusDiv) {
        let msg = "";
        let isError = false;

        const respData = response?.response || response;

        if (respData && respData.error) {
          isError = true;
          const errorMsg = respData.error;
          msg = t("trace.error_response") || `❌ Trace error: ${errorMsg}`;
          if (respData.message) msg += ` (${respData.message})`;
        } else if (respData && respData.trace !== undefined && respData.trace !== null) {
          const traceStr = typeof respData.trace === 'string' 
            ? respData.trace 
            : JSON.stringify(respData.trace, null, 2);
          msg = (t("trace.success") || "✅ Trace sent successfully!") + 
            `<br><span style="font-size: 12px; opacity: 0.8;">${escapeHtml(traceStr)}</span>`;
        } else {
          msg = t("trace.success") || "✅ Trace sent successfully!";
        }

        this._statusDiv.innerHTML = msg;
        this._statusDiv.style.color = isError ? "var(--error-color)" : "var(--success-color)";
        // Ustaw timeout na 12 sekund przed wyczyszczeniem
        this._clearStatusAfterDelay(12000);
      }
    } catch (error: any) {
      console.error("Trace error:", error);
      if (this._statusDiv) {
        this._statusDiv.textContent =
          t("trace.error") || `❌ Error: ${error.message || "Unknown error"}`;
        this._statusDiv.style.color = "var(--error-color)";
        this._clearStatusAfterDelay(12000);
      }
    } finally {
      this._isTracing = false;
      if (this._traceButton) this._traceButton.disabled = false;
    }
  }

  // ---------- Event handlers ----------
  private _onContactChange(): void {
    if (!this._contactSelect) return;
    this._selectedContact = this._contactSelect.value || null;
  }

  private _onTimeoutChange(): void {
    if (!this._timeoutInput) return;
    const val = parseInt(this._timeoutInput.value, 10);
    if (!isNaN(val) && val > 0) {
      this._timeout = val;
    } else {
      this._timeout = 15;
      this._timeoutInput.value = "15";
    }
  }

  private _onTrace(): void {
    // Anuluj poprzednie czyszczenie statusu
    if (this._statusTimeoutId) {
      clearTimeout(this._statusTimeoutId);
      this._statusTimeoutId = null;
    }

    if (!this._selectedContact) {
      const t = this._getTranslations();
      if (this._statusDiv) {
        this._statusDiv.textContent = t("trace.error_no_contact") || "❌ Please select a contact";
        this._statusDiv.style.color = "var(--error-color)";
        this._clearStatusAfterDelay(12000);
      }
      return;
    }
    this._executeTrace(this._selectedContact);
  }

  // ---------- Render ----------
  protected _render(): void {
    if (!this._hass || !this._config) return;
    const t = this._getTranslations();

    const contacts = this._getContacts();

    if (contacts.length === 0) {
      this._setBody(`
        <div class="empty">
          <ha-icon icon="mdi:account-search" style="--mdc-icon-size: 36px;"></ha-icon><br>
          ${escapeHtml(t("trace.no_contacts") || "No contacts found. Add contacts in MeshCore integration settings.")}
        </div>
      `);
      return;
    }

    let optionsHtml = `<option value="">${escapeHtml(t("trace.select_contact") || "-- Select contact --")}</option>`;
    for (const contact of contacts) {
      const value = contact.advId || contact.name;
      let displayValue = contact.advId && contact.advId.length === 6
        ? `${contact.name} (${contact.advId})`
        : contact.name;
      optionsHtml += `<option value="${escapeHtml(value)}">${escapeHtml(displayValue)}</option>`;
    }

    const html = `
      <div class="trace-card">
        ${sectionHeader(t("trace.title") || "MeshCore Trace")}

        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: 500; color: var(--secondary-text-color); display: block; margin-bottom: 4px;">
            ${escapeHtml(t("trace.select_contact") || "Select contact:")}
          </label>
          <select id="trace-contact-select" style="
            width: 100%;
            padding: 8px 12px;
            border-radius: 12px;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            font-size: 14px;
          ">
            ${optionsHtml}
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: 500; color: var(--secondary-text-color); display: block; margin-bottom: 4px;">
            ${escapeHtml(t("trace.timeout_label") || "Timeout (seconds):")}
          </label>
          <input id="trace-timeout-input" type="number" min="1" max="120" value="${this._timeout}" style="
            width: 100%;
            padding: 8px 12px;
            border-radius: 12px;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            font-size: 14px;
          ">
        </div>

        <button id="trace-btn" style="
          width: 100%;
          padding: 10px 16px;
          border-radius: 12px;
          border: none;
          background: var(--primary-color);
          color: white;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <ha-icon icon="mdi:radar"></ha-icon>
          ${escapeHtml(t("trace.trace_button") || "Send Trace")}
        </button>

        <div id="trace-status" style="
          margin-top: 10px;
          text-align: center;
          font-size: 14px;
          min-height: 24px;
          transition: opacity 0.3s;
        "></div>

        <div style="
          margin-top: 12px;
          font-size: 12px;
          color: var(--secondary-text-color);
          opacity: 0.7;
          text-align: center;
        ">
          ${escapeHtml(t("trace.info") || "Sends a trace request to the selected contact with the specified timeout.")}
        </div>
      </div>
    `;

    this._setBody(html);

    this._contactSelect = this.shadowRoot?.querySelector("#trace-contact-select") as HTMLSelectElement;
    this._timeoutInput = this.shadowRoot?.querySelector("#trace-timeout-input") as HTMLInputElement;
    this._traceButton = this.shadowRoot?.querySelector("#trace-btn") as HTMLButtonElement;
    this._statusDiv = this.shadowRoot?.querySelector("#trace-status") as HTMLDivElement;

    if (this._contactSelect) {
      this._contactSelect.addEventListener("change", () => this._onContactChange());
      if (this._contactSelect.value) {
        this._selectedContact = this._contactSelect.value;
      }
    }

    if (this._timeoutInput) {
      this._timeoutInput.addEventListener("change", () => this._onTimeoutChange());
      this._timeoutInput.addEventListener("input", () => this._onTimeoutChange());
    }

    if (this._traceButton) {
      this._traceButton.addEventListener("click", () => this._onTrace());
    }
  }

  private _getTranslations(): LocalizeFunc {
    return makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
  }

  getCardSize(): number {
    return 4;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-trace-card-editor");
  }

  static getStubConfig(): MeshcoreTraceCardConfig {
    return { timeout: 15 };
  }
}

// ============================================
// EDITOR
// ============================================

export class MeshcoreTraceCardEditor extends HTMLElement {
  private _config?: MeshcoreTraceCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreTraceCardConfig): void {
    this._config = { ...config };
    this._renderEditor();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._renderEditor();
  }

  private _renderEditor(): void {
    if (!this._config) return;
    while (this.lastChild) this.removeChild(this.lastChild);

    const container = document.createElement("div");
    container.style.cssText = "margin: 16px;";

    const t = makeLocalize(this._hass?.language ?? "en");

    const timeoutLabel = document.createElement("label");
    timeoutLabel.style.cssText = "display: block; margin-bottom: 8px;";
    timeoutLabel.textContent = t("trace.editor_timeout_label") || "Default timeout (seconds):";

    const timeoutInput = document.createElement("input");
    timeoutInput.type = "number";
    timeoutInput.min = "1";
    timeoutInput.max = "120";
    timeoutInput.value = String(this._config.timeout ?? 15);
    timeoutInput.style.cssText = "width: 100%; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--divider-color); background: var(--card-background-color); color: var(--primary-text-color); font-size: 14px;";

    timeoutInput.addEventListener("change", () => {
      const val = parseInt(timeoutInput.value, 10);
      if (!isNaN(val) && val > 0) {
        this._config = { ...this._config, timeout: val };
        this.dispatchEvent(
          new CustomEvent("config-changed", {
            detail: { config: this._config },
          })
        );
      }
    });

    container.appendChild(timeoutLabel);
    container.appendChild(timeoutInput);

    const info = document.createElement("p");
    info.style.cssText = "color: var(--secondary-text-color); font-size: 14px; margin-top: 12px;";
    info.textContent = t("trace.editor_info") ||
      "This card sends a trace request to contacts saved in MeshCore contacts list. Select a contact and click 'Send Trace'.";

    container.appendChild(info);
    this.appendChild(container);
  }
}