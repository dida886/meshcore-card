// src/cli-card.ts

import type { HomeAssistant, MeshcoreCliCardConfig, HubInfo } from "./types.js";
import {
  escapeHtml,
  getEntityState,
  getEntityAttribute,
  entityExists,
} from "./helpers.js";
import { discoverHubs } from "./discovery.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { MeshcoreBaseCard } from "./base-card.js";
import { sectionHeader } from "./ui-helpers.js";
import {
  CLI_COMMANDS,
  CLI_COMMAND_NAMES,
  formatCommandWithParams,
  findCommand,
} from "./cli-commands.js";

export class MeshcoreCliCard extends MeshcoreBaseCard {
  protected _config?: MeshcoreCliCardConfig;
  private _selectedHubPubkey: string | null = null;
  private _commandValue = "";
  private _isSending = false;
  private _filteredCommands: { name: string; params: string[] }[] = [];
  private _showSuggestions = false;
  private _selectedSuggestionIndex = -1;

  // Element references
  private _commandInput?: HTMLInputElement;
  private _runButton?: HTMLButtonElement;
  private _clearButton?: HTMLButtonElement;
  private _consoleOutput?: HTMLPreElement;
  private _hubSelect?: HTMLSelectElement;
  private _suggestionsContainer?: HTMLDivElement;

  // Listener dla kliknięć – używamy mousedown
  private _boundSuggestionMouseDown!: (e: Event) => void;

  protected _additionalStyles(): string {
    return "";
  }

  constructor() {
    super();
    this._boundSuggestionMouseDown = this._onSuggestionMouseDown.bind(this);
    this.shadowRoot?.addEventListener("mousedown", this._boundSuggestionMouseDown);
  }

  setConfig(config: MeshcoreCliCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  protected _computeFingerprint(): string {
    if (!this._hass) return "";
    return JSON.stringify(this._config) + (this._hass.language || "");
  }

  // ---------- CLI availability ----------
  private _isCliAvailable(): boolean {
    if (!this._hass) return false;
    if (entityExists(this._hass, "text.meshcore_command")) return true;
    const hubs = discoverHubs(this._hass);
    for (const hub of hubs) {
      const consoleEntity = `sensor.meshcore_${hub.pubkey}_cli_console`;
      if (entityExists(this._hass, consoleEntity)) return true;
    }
    return false;
  }

  private _getCliHubs(): HubInfo[] {
    if (!this._hass) return [];
    const hubs = discoverHubs(this._hass);
    return hubs.filter((hub) => {
      const runButton = `button.meshcore_${hub.pubkey}_cli_run`;
      const consoleSensor = `sensor.meshcore_${hub.pubkey}_cli_console`;
      return entityExists(this._hass, runButton) && entityExists(this._hass, consoleSensor);
    });
  }

  private _getTranscript(pubkey: string): string {
    if (!this._hass) return "";
    const sensorId = `sensor.meshcore_${pubkey}_cli_console`;
    const attrs = this._hass.states[sensorId]?.attributes || {};
    return (attrs.transcript as string) || "";
  }

  // ---------- Sending / clearing ----------
  private async _sendCommand(pubkey: string, command: string): Promise<void> {
    if (!this._hass || !command.trim()) return;
    const t = this._getTranslations();

    const globalCommandId = "text.meshcore_command";
    if (entityExists(this._hass, globalCommandId)) {
      await (this._hass as any).callService("text", "set_value", {
        entity_id: globalCommandId,
        value: command,
      });
    }

    const runButtonId = `button.meshcore_${pubkey}_cli_run`;
    if (entityExists(this._hass, runButtonId)) {
      await (this._hass as any).callService("button", "press", {
        entity_id: runButtonId,
      });
    } else {
      throw new Error(t("cli.error_no_run_button") || "Run button not found");
    }
  }

  private async _clearConsole(pubkey: string): Promise<void> {
    if (!this._hass) return;
    const clearButtonId = `button.meshcore_${pubkey}_cli_clear`;
    if (entityExists(this._hass, clearButtonId)) {
      await (this._hass as any).callService("button", "press", {
        entity_id: clearButtonId,
      });
    }
  }

  // ---------- Autocomplete with includes search ----------
  private _updateSuggestions(input: string): void {
    const trimmed = input.trim();
    if (!trimmed) {
      this._filteredCommands = [];
      this._showSuggestions = false;
      this._selectedSuggestionIndex = -1;
      this._renderSuggestions();
      return;
    }

    const searchTerm = trimmed.toLowerCase();
    this._filteredCommands = CLI_COMMAND_NAMES
      .filter((name) => name.toLowerCase().includes(searchTerm))
      .map((name) => ({ name, params: CLI_COMMANDS[name] }))
      .slice(0, 10);

    this._showSuggestions = this._filteredCommands.length > 0;
    this._selectedSuggestionIndex = -1;
    this._renderSuggestions();
  }

  private _renderSuggestions(): void {
    if (!this._suggestionsContainer) return;

    if (!this._showSuggestions || this._filteredCommands.length === 0) {
      this._suggestionsContainer.style.display = "none";
      this._suggestionsContainer.innerHTML = "";
      return;
    }

    this._suggestionsContainer.style.display = "block";
    this._suggestionsContainer.innerHTML = this._filteredCommands
      .map((cmd, idx) => {
        const isSelected = idx === this._selectedSuggestionIndex;
        const formatted = formatCommandWithParams(cmd.name, cmd.params);
        const paramStr =
          cmd.params.length > 0
            ? `<span style="color: var(--secondary-text-color); font-size: 11px;"> (${cmd.params.join(", ")})</span>`
            : "";
        return `
          <div class="cli-suggestion ${isSelected ? "selected" : ""}"
               data-command="${escapeHtml(cmd.name)}"
               style="
                 padding: 4px 10px;
                 cursor: pointer;
                 font-family: monospace;
                 font-size: 13px;
                 border-radius: 4px;
                 transition: background 0.15s;
                 ${isSelected ? "background: var(--primary-color); color: white;" : ""}
               ">
            ${escapeHtml(formatted)}
            ${paramStr}
          </div>
        `;
      })
      .join("");
  }

  private _selectSuggestion(index: number): void {
    if (index < 0 || index >= this._filteredCommands.length) return;
    const cmd = this._filteredCommands[index];
    if (!cmd) return;

    const formatted = formatCommandWithParams(cmd.name, cmd.params);
    if (this._commandInput) {
      this._commandInput.value = formatted;
      this._commandValue = formatted;
      const openParen = formatted.indexOf("(");
      const closeParen = formatted.indexOf(")");
      if (openParen !== -1 && closeParen !== -1) {
        this._commandInput.setSelectionRange(openParen + 1, closeParen);
      } else {
        this._commandInput.setSelectionRange(formatted.length, formatted.length);
      }
    }
    this._showSuggestions = false;
    this._filteredCommands = [];
    this._renderSuggestions();
    this._commandInput?.focus();
  }

  private _navigateSuggestions(direction: "up" | "down"): void {
    if (!this._showSuggestions || this._filteredCommands.length === 0) return;
    const total = this._filteredCommands.length;
    if (direction === "down") {
      this._selectedSuggestionIndex = (this._selectedSuggestionIndex + 1) % total;
    } else {
      this._selectedSuggestionIndex =
        (this._selectedSuggestionIndex - 1 + total) % total;
    }
    this._renderSuggestions();
    const selectedEl = this._suggestionsContainer?.querySelector(".cli-suggestion.selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }

  // ---------- Event handlers ----------
  private _onHubChange(): void {
    if (!this._hubSelect) return;
    this._selectedHubPubkey = this._hubSelect.value || null;
    this._updateConsole();
    this._subscribeToUpdates();
  }

  private _updateConsole(): void {
    if (!this._consoleOutput || !this._selectedHubPubkey) return;
    const transcript = this._getTranscript(this._selectedHubPubkey);
    this._consoleOutput.textContent = transcript || " ";
    this._consoleOutput.scrollTop = this._consoleOutput.scrollHeight;
  }

  private _onRun(): void {
    if (!this._commandInput || !this._selectedHubPubkey || this._isSending) return;
    const command = this._commandInput.value;
    if (!command.trim()) return;
    this._isSending = true;
    if (this._runButton) this._runButton.disabled = true;
    const t = this._getTranslations();

    this._sendCommand(this._selectedHubPubkey, command)
      .then(() => {
        setTimeout(() => {
          this._updateConsole();
          this._isSending = false;
          if (this._runButton) this._runButton.disabled = false;
        }, 1000);
      })
      .catch((err) => {
        console.error("CLI command error:", err);
        this._isSending = false;
        if (this._runButton) this._runButton.disabled = false;
        if (this._consoleOutput) {
          this._consoleOutput.textContent = `❌ ${t("cli.error_send") || "Error sending command"}: ${err.message || err}`;
        }
      });
  }

  private _onClear(): void {
    if (!this._selectedHubPubkey) return;
    this._clearConsole(this._selectedHubPubkey)
      .then(() => {
        setTimeout(() => this._updateConsole(), 500);
      })
      .catch((err) => console.error("Clear console error:", err));
  }

  private _onCommandInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    this._commandValue = input.value;
    this._updateSuggestions(input.value);
    if (this._selectedSuggestionIndex !== -1) {
      this._selectedSuggestionIndex = -1;
      this._renderSuggestions();
    }
  }

  private _onCommandKeydown(e: KeyboardEvent): void {
    if (this._showSuggestions && this._filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this._navigateSuggestions("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this._navigateSuggestions("up");
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        if (this._selectedSuggestionIndex === -1) {
          this._selectedSuggestionIndex = 0;
          this._renderSuggestions();
        } else {
          this._selectSuggestion(this._selectedSuggestionIndex);
        }
        return;
      }
      if (e.key === "Enter") {
        if (this._selectedSuggestionIndex !== -1) {
          e.preventDefault();
          this._selectSuggestion(this._selectedSuggestionIndex);
          return;
        }
      }
    }

    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this._onRun();
    }

    if (e.key === "Escape") {
      this._showSuggestions = false;
      this._filteredCommands = [];
      this._renderSuggestions();
    }
  }

  // ---------- KLIKNIĘCIE W SUGESTIĘ – używamy mousedown ----------
  private _onSuggestionMouseDown(e: Event): void {
    const target = e.target as HTMLElement;
    const suggestion = target.closest(".cli-suggestion") as HTMLElement;
    if (!suggestion) return;

    const cmdName = suggestion.dataset["command"];
    if (!cmdName) return;

    // Znajdź indeks w _filteredCommands
    const idx = this._filteredCommands.findIndex(cmd => cmd.name === cmdName);
    if (idx === -1) return;

    // Zapobiegaj domyślnemu zachowaniu (np. utracie fokusu)
    e.preventDefault();
    e.stopPropagation();

    // Wywołaj _selectSuggestion z indeksem
    this._selectSuggestion(idx);
  }

  // ---------- State subscription ----------
  private _subscribeToUpdates(): void {
    if (!this._hass || !this._selectedHubPubkey) return;
    const sensorId = `sensor.meshcore_${this._selectedHubPubkey}_cli_console`;
    const hassAny = this._hass as any;

    if ((this as any)._cliUnsub) {
      (this as any)._cliUnsub();
      (this as any)._cliUnsub = null;
    }

    if (hassAny.connection) {
      const sub = hassAny.connection.subscribeEvents(
        (event: any) => {
          if (event.data?.entity_id === sensorId) {
            this._updateConsole();
          }
        },
        "state_changed"
      );
      (this as any)._cliUnsub = sub;
    }
  }

  disconnectedCallback(): void {
    this.shadowRoot?.removeEventListener("mousedown", this._boundSuggestionMouseDown);
    if ((this as any)._cliUnsub) {
      (this as any)._cliUnsub();
      (this as any)._cliUnsub = null;
    }
    super.disconnectedCallback();
  }

  // ---------- Render ----------
  protected _render(): void {
    if (!this._hass || !this._config) return;
    const t = this._getTranslations();

    if (!this._isCliAvailable()) {
      this._setBody(`
        <div class="empty">
          <ha-icon icon="mdi:console-line" style="--mdc-icon-size: 36px;"></ha-icon><br>
          ${escapeHtml(t("cli.not_available") || "CLI Command is not available. Check MeshCore integration version (>= 2.9.0) and enable CLI in settings.")}
        </div>
      `);
      return;
    }

    const cliHubs = this._getCliHubs();
    if (cliHubs.length === 0) {
      this._setBody(`
        <div class="empty">
          <ha-icon icon="mdi:console-line" style="--mdc-icon-size: 36px;"></ha-icon><br>
          ${escapeHtml(t("cli.no_hubs") || "No hubs with CLI support found. Make sure CLI is enabled in MeshCore integration settings.")}
        </div>
      `);
      return;
    }

    let selectedPubkey = this._selectedHubPubkey;
    if (!selectedPubkey || !cliHubs.some((h) => h.pubkey === selectedPubkey)) {
      selectedPubkey = cliHubs[0].pubkey;
      this._selectedHubPubkey = selectedPubkey;
    }

    let html = `
      <div class="cli-card">
        ${sectionHeader(t("cli.title") || "MeshCore CLI")}
    `;

    if (cliHubs.length > 1) {
      html += `
        <div class="cli-hub-selector" style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: 500; color: var(--secondary-text-color);">
            ${escapeHtml(t("cli.select_hub") || "Select hub:")}
          </label>
          <select id="cli-hub-select" style="
            width: 100%;
            padding: 8px 12px;
            border-radius: 12px;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            font-size: 14px;
            margin-top: 4px;
          ">
            ${cliHubs.map((hub) =>
              `<option value="${hub.pubkey}" ${hub.pubkey === selectedPubkey ? "selected" : ""}>
                ${escapeHtml(hub.name)} (${hub.pubkey.substring(0, 6)})
              </option>`
            ).join("")}
          </select>
        </div>
      `;
    }

    html += `
      <div class="cli-input-row" style="position: relative; display: flex; gap: 8px; align-items: stretch; margin-bottom: 4px;">
        <div style="flex: 1; position: relative;">
          <input id="cli-command-input" type="text" style="
            width: 100%;
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid var(--divider-color);
            background: var(--card-background-color);
            color: var(--primary-text-color);
            font-family: monospace;
            font-size: 14px;
          " placeholder="${escapeHtml(t("cli.command_placeholder") || "Enter command...")}" value="${escapeHtml(this._commandValue)}" autocomplete="off" spellcheck="false">
          <div id="cli-suggestions" style="
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--card-background-color);
            border: 1px solid var(--divider-color);
            border-radius: 8px;
            margin-top: 4px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          "></div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; justify-content: center;">
          <button id="cli-run-btn" style="
            padding: 6px 16px;
            border-radius: 12px;
            border: none;
            background: var(--primary-color);
            color: white;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
            min-height: 36px;
          ">
            <ha-icon icon="mdi:send"></ha-icon> ${escapeHtml(t("cli.run") || "Run")}
          </button>
          ${this._config?.show_clear_button !== false ? `
            <button id="cli-clear-btn" style="
              padding: 4px 12px;
              border-radius: 12px;
              border: 1px solid var(--divider-color);
              background: transparent;
              color: var(--secondary-text-color);
              cursor: pointer;
              transition: opacity 0.2s;
              font-size: 12px;
            ">
              <ha-icon icon="mdi:eraser"></ha-icon> ${escapeHtml(t("cli.clear") || "Clear")}
            </button>
          ` : ""}
        </div>
      </div>
      <div style="font-size: 11px; color: var(--secondary-text-color); margin-bottom: 8px; opacity: 0.6;">
        ${escapeHtml(t("cli.hint") || "💡 Type command name, use ↑↓ to navigate, Tab or Enter to select, Ctrl+Enter to send")}
      </div>
    `;

    const transcript = this._getTranscript(selectedPubkey);
    html += `
      <div style="margin-top: 8px;">
        <div style="font-size: 12px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 4px;">
          ${escapeHtml(t("cli.console") || "Console")}
        </div>
        <pre id="cli-console-output" style="
          padding: 12px;
          border-radius: 12px;
          border: 1px solid var(--divider-color);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-family: monospace;
          font-size: 13px;
          max-height: 300px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        ">${escapeHtml(transcript || " ")}</pre>
      </div>
    `;

    html += `</div>`;
    this._setBody(html);

    // Capture element references
    this._hubSelect = this.shadowRoot?.querySelector("#cli-hub-select") as HTMLSelectElement;
    this._commandInput = this.shadowRoot?.querySelector("#cli-command-input") as HTMLInputElement;
    this._runButton = this.shadowRoot?.querySelector("#cli-run-btn") as HTMLButtonElement;
    this._clearButton = this.shadowRoot?.querySelector("#cli-clear-btn") as HTMLButtonElement;
    this._consoleOutput = this.shadowRoot?.querySelector("#cli-console-output") as HTMLPreElement;
    this._suggestionsContainer = this.shadowRoot?.querySelector("#cli-suggestions") as HTMLDivElement;

    // Attach events
    if (this._hubSelect) {
      this._hubSelect.addEventListener("change", () => this._onHubChange());
    }

    if (this._commandInput) {
      this._commandInput.addEventListener("input", (e) => this._onCommandInput(e));
      this._commandInput.addEventListener("keydown", (e) => this._onCommandKeydown(e));
      this._commandInput.addEventListener("focus", () => {
        if (this._commandInput?.value.trim()) {
          this._updateSuggestions(this._commandInput.value);
        }
      });
      this._commandInput.addEventListener("blur", () => {
        setTimeout(() => {
          this._showSuggestions = false;
          this._filteredCommands = [];
          this._renderSuggestions();
        }, 200);
      });
    }

    if (this._runButton) {
      this._runButton.addEventListener("click", () => this._onRun());
    }

    if (this._clearButton) {
      this._clearButton.addEventListener("click", () => this._onClear());
    }

    this._subscribeToUpdates();
    if (this._consoleOutput) {
      this._consoleOutput.scrollTop = this._consoleOutput.scrollHeight;
    }
  }

  private _getTranslations(): LocalizeFunc {
    return makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
  }

  getCardSize(): number {
    return 6;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-cli-card-editor");
  }

  static getStubConfig(): MeshcoreCliCardConfig {
    return {
      show_clear_button: true,
    };
  }
}

// ============================================
// EDITOR
// ============================================

export class MeshcoreCliCardEditor extends HTMLElement {
  private _config?: MeshcoreCliCardConfig;
  private _hass?: HomeAssistant;

  setConfig(config: MeshcoreCliCardConfig): void {
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

    const label = document.createElement("label");
    label.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 12px;";

    const checkbox = document.createElement("ha-checkbox") as any;
    checkbox.checked = this._config.show_clear_button !== false;
    checkbox.addEventListener("change", () => {
      this._config = {
        ...this._config,
        show_clear_button: checkbox.checked,
      };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this._config },
        })
      );
    });
    const t = makeLocalize(this._hass?.language ?? "en");
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(t("cli.editor_show_clear") || "Show clear button"));

    container.appendChild(label);

    const info = document.createElement("p");
    info.style.cssText = "color: var(--secondary-text-color); font-size: 14px; margin-top: 12px;";
    info.textContent = t("cli.editor_info") ||
      "The CLI card allows you to send commands to MeshCore hubs. Start typing a command name for autocomplete suggestions. Requires MeshCore integration ≥ 2.9.0 and CLI enabled in settings.";

    container.appendChild(info);
    this.appendChild(container);
  }
}