import type { HomeAssistant, MeshcoreChannelCardConfig } from "./types.js";
import { escapeHtml } from "./helpers.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { MeshcoreBaseCard } from "./base-card.js";

const CHANNEL_STYLES: string = `
  .channel-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .channel-row {
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
  .channel-row:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.2);
  }

  .channel-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .channel-dot.active {
    background: #46f58a;
    box-shadow: 0 0 10px rgba(70, 245, 138, 0.95);
    animation: channel-pulse-glow 2s ease-in-out infinite;
  }
  .channel-dot.inactive {
    background: var(--secondary-text-color);
    opacity: 0.4;
  }

  @keyframes channel-pulse-glow {
    0%, 100% { box-shadow: 0 0 4px rgba(74, 222, 128, 0.4); }
    50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.8); }
  }

  .channel-hub {
    font-weight: 600;
    color: var(--primary-text-color);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 11px;
    letter-spacing: -0.01em;
    border-radius: 999px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--glass-border);
  }

  .channel-name {
    font-weight: 700;
    font-size: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--primary-text-color);
    flex: 1;
    min-width: 0;
  }
`;

interface ChannelEntry {
  entityId: string;
  hubName: string;
  channelName: string;
  channelIndex: number;
  active: boolean;
}

/**
 * Parse hub name and channel name from a channel entity.
 *
 * Entity ID pattern:  binary_sensor.meshcore_<hubprefix>_ch_<index>_messages
 * Friendly name pattern: MeshCore <HubName> (<hubprefix>) <ChannelName> Messages
 *
 * We prefer the friendly_name parser because it carries the human-readable hub
 * name and channel name. Fall back to the entity ID when the name is absent.
 */
function parseChannel(entityId: string, attrs: Record<string, unknown>): { hubName: string; channelName: string; channelIndex: number } {
  const channelIndex = typeof attrs["channel_index"] === "number" ? attrs["channel_index"] : 0;

  const idm = entityId.match(
    /^binary_sensor\.meshcore_([^_]+(?:_[^_]+)*)_ch_(\d+)_messages$/
  );
  const hubFromId = idm ? idm[1]! : entityId;
  const chIdx = idm ? parseInt(idm[2]!, 10) : channelIndex;

  const friendly = String(attrs["friendly_name"] ?? "");

  // Pełny format: "MeshCore YubaWifi (55733c) Public Messages"
  const full = friendly.match(
    /^MeshCore\s+(.+?)\s+\([0-9a-f]+\)\s+(.+?)\s+Messages\b/i
  );
  if (full) {
    return { hubName: full[1]!, channelName: full[2]!, channelIndex: chIdx };
  }

  // Skrócony format: "Public Messages"
  const short = friendly.match(/^(.+?)\s+Messages\b/i);
  if (short) {
    return { hubName: hubFromId, channelName: short[1]!, channelIndex: chIdx };
  }

  return {
    hubName: hubFromId,
    channelName: friendly || `Ch ${chIdx}`,
    channelIndex: chIdx,
  };
}

export class MeshcoreChannelCard extends MeshcoreBaseCard {
  protected _config?: MeshcoreChannelCardConfig;

  /** Zwraca dodatkowe style dołączane do bazowych. */
  protected _additionalStyles(): string {
    return CHANNEL_STYLES;
  }

  setConfig(config: MeshcoreChannelCardConfig): void {
    this._config = config;
    this._fp = null;
    this._render();
  }

  protected _computeFingerprint(): string {
    if (!this._hass) return "";
    return Object.entries(this._hass.states)
      .filter(([id]) =>
        /^binary_sensor\.meshcore_.*_ch_\d+_messages$/.test(id)
      )
      .map(([id, s]) => `${id}=${s.state}`)
      .join("|");
  }

  private _discoverChannels(): ChannelEntry[] {
    if (!this._hass) return [];
    return Object.entries(this._hass.states)
      .filter(([id]) =>
        /^binary_sensor\.meshcore_.*_ch_\d+_messages$/.test(id)
      )
      .map(([entityId, state]): ChannelEntry => {
        const attrs = state.attributes as Record<string, unknown>;
        const { hubName, channelName, channelIndex } = parseChannel(
          entityId,
          attrs
        );
        return {
          entityId,
          hubName,
          channelName,
          channelIndex,
          active: state.state === "Active",
        };
      })
      .sort((a, b) => {
        const ch = a.channelIndex - b.channelIndex;
        return ch !== 0 ? ch : a.hubName.localeCompare(b.hubName);
      });
  }

  private _renderRow(ch: ChannelEntry): string {
    return `
      <div class="channel-row" data-entity="${escapeHtml(ch.entityId)}">
        <span class="channel-dot ${
          ch.active ? "active" : "inactive"
        }"></span>
        <span class="channel-name">${escapeHtml(ch.channelName)}</span>
      </div>`;
  }

  protected _render(): void {
    if (!this._hass || !this._config) return;
    const t = makeLocalize(
      this._hass.language ?? this._hass.locale?.language ?? "en"
    );
    const channels = this._discoverChannels();
    if (!channels.length) {
      this._setBody(`<div class="empty">${t("card.empty_channels")}</div>`);
      return;
    }
    this._setBody(
      `<div class="section-label">${t("card.section_channels")}</div>` +
        `<div class="channel-list">${channels
          .map((ch) => this._renderRow(ch))
          .join("")}</div>`,
      ".channel-row"        
    );
  }

  getCardSize(): number {
    return 3;
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("meshcore-channel-card-editor");
  }

  static getStubConfig(): MeshcoreChannelCardConfig {
    return {};
  }
}

// ============================================
// EDYTOR – BEZ ZMIAN
// ============================================
export class MeshcoreChannelCardEditor extends HTMLElement {
  private _config?: MeshcoreChannelCardConfig;

  setConfig(config: MeshcoreChannelCardConfig): void {
    this._config = { ...config };
  }

  set hass(_hass: HomeAssistant) {
    // Karta kanałów nie wymaga wyboru encji – wszystko odkrywane automatycznie.
  }

  connectedCallback(): void {
    while (this.lastChild) this.removeChild(this.lastChild);
    const msg = document.createElement("p");
    msg.style.cssText =
      "margin: 16px; color: var(--secondary-text-color); font-size: 14px;";
    msg.textContent =
      "Channels are discovered automatically from the MeshCore integration.";
    this.appendChild(msg);
  }
}