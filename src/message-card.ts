import type { HomeAssistant, MeshcoreMessageCardConfig } from "./types.js";
import { escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { MESSAGE_STYLES } from "./message-styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { discoverHubs } from "./discovery.js";

import signalHighIcon from "./icons/signal-high.svg";
import activityIcon from "./icons/activity.svg";
import waypointsIcon from "./icons/waypoints.svg";

export class MeshcoreMessageCard extends HTMLElement {
  private _hass?: HomeAssistant;
  private _config?: MeshcoreMessageCardConfig;
  private _messageType: "channel" | "contact" = "channel";
  private _lastMessages: any[] = [];
  private _isLoading = false;
  private _refreshCount = 0;
  private _lastSelectedValue: string | null = null;
  private _isUpdating = false;
  private _initialized = false;
  private _defaultChannel: string | number | null = null;
  private _repeaterNamesMap: Map<string, string> = new Map();
  private _repeaterNamesPrefixIndex: Map<string, string> = new Map();
  private _listenerAdded: boolean = false;
  private _refreshTimeout: ReturnType<typeof setTimeout> | null = null;

  private _rxLogData: Map<string, Map<number, any>> = new Map();
  private _expandedMessages: Set<string> = new Set();
  private _initialFileLoadDone = false;

  private static _globalContactsCache: any[] | null = null;
  private static _globalChannelsCache: any[] | null = null;
  private static _repeaterNamesMapCache: Map<string, string> | null = null;
  private static _repeaterNamesPrefixCache: Map<string, string> | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  disconnectedCallback() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }
  }

  /* ---------- Indeksowanie rx_log ---------- */
  private _indexRxLogEntry(entityId: string, timestamp: number, data: any): void {
    if (!this._rxLogData.has(entityId)) {
      this._rxLogData.set(entityId, new Map());
    }
    const entityMap = this._rxLogData.get(entityId)!;
    const ts = Math.floor(timestamp);
    const existing = entityMap.get(ts);
    if (!existing || (data.event_timestamp || 0) > (existing.event_timestamp || 0)) {
      entityMap.set(ts, data);
    }
  }

  private async _fetchRxLogFromFile(): Promise<void> {
    try {
      const cacheBuster = `?t=${Date.now()}&r=${Math.random().toString(36).substring(7)}`;
      const response = await fetch(`/local/meshcore_rx.json${cacheBuster}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`'/local/meshcore_rx.json' not found`);
      const text = await response.text();
      const entries = this._parseNDJSON(text);
      for (const entry of entries) {
        const entityId = entry.entity_id || '';
        if (!entityId) continue;
        if (entry.rx_timestamp !== undefined) {
          this._indexRxLogEntry(entityId, entry.rx_timestamp, {
            senderName: entry.sender_name || 'Unknown',
            rssi: entry.rssi, snr: entry.snr, path: entry.path,
            path_len: entry.path_len, route_type: entry.route_typename,
            channel_name: entry.channel_name, channel_idx: entry.channel_idx,
            timestamp: entry.rx_timestamp, event_timestamp: entry.rx_timestamp,
          });
        } else if (Array.isArray(entry.rx_log_data)) {
          const senderName = entry.sender_name || 'Unknown';
          for (const rx of entry.rx_log_data) {
            const eventTimestamp = entry.timestamp ? new Date(entry.timestamp).getTime() / 1000 : rx.timestamp;
            this._indexRxLogEntry(entityId, rx.timestamp, {
              senderName, rssi: rx.rssi, snr: rx.snr, path: rx.path,
              path_len: rx.path_len, route_type: rx.route_typename,
              channel_name: rx.channel_name, channel_idx: rx.channel_idx,
              timestamp: rx.timestamp, event_timestamp: eventTimestamp,
            });
          }
        }
      }
      this._pruneRxLogDataInMemory();
    } catch (_) { /* ignore */ }
  }

  private _parseNDJSON(text: string): any[] {
    const results: any[] = [];
    let buffer = '', braceDepth = 0, inString = false, escapeNext = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      buffer += char;
      if (escapeNext) { escapeNext = false; continue; }
      if (char === '\\') { escapeNext = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
      if (braceDepth === 0 && buffer.trim().length > 0) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('{')) {
          try { results.push(JSON.parse(trimmed)); } catch (_) {}
        }
        buffer = '';
      }
    }
    return results;
  }

  private _findRxData(msgTime: number, entityId?: string): { data: any; key: string } | null {
    if (!entityId) return null;
    const entityMap = this._rxLogData.get(entityId);
    if (!entityMap || entityMap.size === 0) return null;
    const msgTimestamp = Math.floor(msgTime);
    for (let offset = 0; offset <= 15; offset++) {
      const ts = msgTimestamp - offset;
      if (entityMap.has(ts)) return { data: entityMap.get(ts)!, key: `${entityId}_${ts}` };
      if (offset > 0) {
        const tsPlus = msgTimestamp + offset;
        if (entityMap.has(tsPlus)) return { data: entityMap.get(tsPlus)!, key: `${entityId}_${tsPlus}` };
      }
    }
    return null;
  }

  private _pruneRxLogDataInMemory(): void {
    const now = Date.now() / 1000;
    const MAX_AGE_SECONDS = 86400;
    const MAX_ENTRIES_PER_ENTITY = 500;
    for (const [entityId, entityMap] of this._rxLogData) {
      for (const [timestamp] of entityMap) {
        if (now - timestamp > MAX_AGE_SECONDS) entityMap.delete(timestamp);
      }
      if (entityMap.size > MAX_ENTRIES_PER_ENTITY) {
        const keys = Array.from(entityMap.keys()).sort();
        const toDelete = keys.slice(0, entityMap.size - MAX_ENTRIES_PER_ENTITY);
        for (const key of toDelete) entityMap.delete(key);
      }
      if (entityMap.size === 0) this._rxLogData.delete(entityId);
    }
  }

  /* ---------- Formatowanie ścieżek ---------- */
  private _formatPath(path: string, pathLen?: number, routeType?: string): string {
    if (!path) return '';
    if (pathLen && pathLen > 0 && /^[0-9a-fA-F]+$/.test(path.replace(/[, ]+/g, ''))) {
      const hex = path.replace(/[, ]+/g, '');
      if (hex.length % pathLen === 0) {
        const chunkSize = hex.length / pathLen;
        const parts: string[] = [];
        for (let i = 0; i < hex.length; i += chunkSize) parts.push(hex.substring(i, i + chunkSize));
        return parts.join(' → ');
      }
    }
    if (routeType && (routeType.toUpperCase() === "FLOOD" || routeType.toUpperCase() === "FOLD")) {
      const nodes = path.split(/[, ]+/).filter(p => p.trim() !== '');
      if (nodes.length === 1 && nodes[0].length > 4) {
        const hex = nodes[0]; const parts = [];
        for (let i = 0; i < hex.length; i += 4) parts.push(hex.substring(i, i + 4));
        return parts.join(' → ');
      }
      return path;
    }
    let nodes = path.split(/[, ]+/).filter(p => p.trim() !== '');
    if (nodes.length === 1 && nodes[0].length > 2) {
      const hex = nodes[0];
      if (pathLen && pathLen > 0) {
        const chunkSize = hex.length / (pathLen + 1);
        if (Number.isInteger(chunkSize) && chunkSize > 0) {
          nodes = [];
          for (let i = 0; i < hex.length; i += chunkSize) nodes.push(hex.substring(i, i + chunkSize));
        } else {
          nodes = [];
          for (let i = 0; i < hex.length; i += 2) nodes.push(hex.substring(i, i + 2));
        }
      } else {
        nodes = [];
        for (let i = 0; i < hex.length; i += 2) nodes.push(hex.substring(i, i + 2));
      }
    }
    return nodes.join(' → ');
  }

  private _buildRepeaterNamesMap(): void {
    this._repeaterNamesMap.clear();
    this._repeaterNamesPrefixIndex.clear();
    if (!this._hass) return;
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!/^binary_sensor\.meshcore_.*_contact$/.test(entityId)) continue;
      const attrs = state.attributes as Record<string, any>;
      const name = attrs.adv_name;
      if (!name || String(name).trim() === '') continue;
      const cleanName = String(name).trim();
      let advId: string | null = attrs.adv_id;
      if (!advId) {
        const match = entityId.match(/meshcore_.*?_([a-f0-9]{6,})_contact$/);
        if (match) advId = match[1];
      }
      if (advId) {
        const lower = String(advId).toLowerCase();
        this._repeaterNamesMap.set(lower, cleanName);
        for (let len = 2; len < lower.length; len += 2) {
          const prefix = lower.substring(0, len);
          if (!this._repeaterNamesPrefixIndex.has(prefix)) {
            this._repeaterNamesPrefixIndex.set(prefix, cleanName);
          }
        }
      }
      const nodeId = attrs.node_id;
      if (nodeId) this._repeaterNamesMap.set(String(nodeId).toLowerCase(), cleanName);
    }
    MeshcoreMessageCard._repeaterNamesMapCache = this._repeaterNamesMap;
    MeshcoreMessageCard._repeaterNamesPrefixCache = this._repeaterNamesPrefixIndex;
  }

  private _ensureRepeaterNamesMap(): void {
    if (!MeshcoreMessageCard._repeaterNamesMapCache) {
      this._buildRepeaterNamesMap();
    } else {
      this._repeaterNamesMap = MeshcoreMessageCard._repeaterNamesMapCache;
      this._repeaterNamesPrefixIndex = MeshcoreMessageCard._repeaterNamesPrefixCache!;
    }
  }

  private _formatPathWithNames(path: string, pathLen?: number, routeType?: string, t?: LocalizeFunc): string[] {
    const baseFormatted = this._formatPath(path, pathLen, routeType);
    const segments = baseFormatted.split(' → ').map(s => s.trim());
    const translate = t || ((key: string, params?: Record<string, string>) => key);
    return segments.map(hex => {
      const lower = hex.toLowerCase();
      const direct = this._repeaterNamesMap.get(lower);
      if (direct) return escapeHtml(direct);
      const fromIndex = this._repeaterNamesPrefixIndex.get(lower);
      if (fromIndex) return escapeHtml(fromIndex);
      const unknown = translate("message-card.unknown_repeater", { id: hex }) || `Unknown (${hex})`;
      return escapeHtml(unknown);
    });
  }

  setConfig(config: MeshcoreMessageCardConfig): void {
    this._config = config;
    if (config.default_channel !== undefined && config.default_channel !== null) {
      this._defaultChannel = config.default_channel;
      this._messageType = "channel";
    } else {
      this._defaultChannel = null;
    }
    this._render();
  }

  set hass(hass: HomeAssistant) {
    const oldHass = this._hass;
    this._hass = hass;
    if (oldHass && oldHass.states !== hass.states) {
      const meshcoreEntities = Object.keys(hass.states).filter(id => id.includes('meshcore'));
      const oldMeshcoreEntities = Object.keys(oldHass.states).filter(id => id.includes('meshcore'));
      if (meshcoreEntities.some(id => oldHass.states[id]?.state !== hass.states[id]?.state)) {
        MeshcoreMessageCard._globalContactsCache = null;
        MeshcoreMessageCard._globalChannelsCache = null;
        MeshcoreMessageCard._repeaterNamesMapCache = null;
        MeshcoreMessageCard._repeaterNamesPrefixCache = null;
      }
    }
    if (!this._listenerAdded) {
      const hassAny = hass as any;
      if (hassAny.connection) {
        hassAny.connection.subscribeEvents(
          (event: any) => {
            if (event.data?.rx_log_data && event.data.rx_log_data.length > 0 && event.event_type === 'meshcore_message') {
              const logData = event.data.rx_log_data[0];
              const senderName = event.data.sender_name || "Unknown";
              const entityId = event.data.entity_id || "";
              const eventTimestamp = event.data.timestamp || Date.now() / 1000;
              if (entityId) {
                this._indexRxLogEntry(entityId, logData.timestamp, {
                  senderName, rssi: logData.rssi, snr: logData.snr, path: logData.path,
                  path_len: logData.path_len, route_type: logData.route_typename,
                  channel_name: logData.channel_name, channel_idx: logData.channel_idx,
                  timestamp: logData.timestamp, event_timestamp: eventTimestamp
                });
                this._pruneRxLogDataInMemory();
              }
              if (this._refreshTimeout) clearTimeout(this._refreshTimeout);
              this._refreshTimeout = setTimeout(() => this._loadMessages(), 3000);
            }
          },
          'meshcore_message'
        );
        this._listenerAdded = true;
      }
    }
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && document.activeElement === targetSelect) return;
    if (this._initialized) this._updateTargetListOnly();
    else this._render();
  }

  private _getAuthToken(): string | null {
    const hass = this._hass as any;
    if (hass?.connection?.options?.authToken) return hass.connection.options.authToken;
    if (hass?.auth?.data?.access_token) return hass.auth.data.access_token;
    return null;
  }

  private _getMyHubName(): string {
    if (!this._hass) return "Hub";
    const hubs = discoverHubs(this._hass);
    if (hubs.length > 0) return hubs[0].name;
    const channelSelect = Object.values(this._hass.states).find(s => s.entity_id === "select.meshcore_channel");
    if (channelSelect && channelSelect.attributes.friendly_name) {
      const match = channelSelect.attributes.friendly_name.match(/MeshCore\s+([^\s(]+)/i);
      if (match) return match[1];
    }
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if ((entityId.includes("_node_status") || entityId.includes("_status")) && state.attributes?.adv_name)
        return state.attributes.adv_name;
    }
    return "Hub";
  }

  private _getChannels(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalChannelsCache) return MeshcoreMessageCard._globalChannelsCache;
    const channelSelect = Object.values(this._hass.states).find(s => s.entity_id === "select.meshcore_channel");
    if (!channelSelect) return [];
    const options = channelSelect.attributes.options || [];
    const channels = options.map((opt: string, idx: number) => {
      let name = opt, channelIdx = idx;
      const m1 = opt.match(/^(\d+):\s*(.+)$/);
      if (m1) { channelIdx = parseInt(m1[1]); name = m1[2]; }
      else {
        const m2 = opt.match(/^(.+?)\s*\((\d+)\)$/);
        if (m2) { name = m2[1]; channelIdx = parseInt(m2[2]); }
      }
      return { idx: channelIdx, name, entityId: channelSelect.entity_id, state: channelSelect };
    });
    MeshcoreMessageCard._globalChannelsCache = channels;
    return channels;
  }

  private _getContacts(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalContactsCache) return MeshcoreMessageCard._globalContactsCache;
    const contactSelect = Object.values(this._hass.states).find(s => s.entity_id === "select.meshcore_contact");
    if (!contactSelect) return [];
    const options = contactSelect.attributes.options || [];
    const contacts: any[] = [];
    const contactSensors = Object.entries(this._hass.states).filter(([id]) => /^binary_sensor\.meshcore_.*_contact$/.test(id));
    for (const option of options) {
      let advId: string | null = null;
      let cleanName = option;
      const pubkeyMatch = option.match(/\(([a-fA-F0-9]+)\)$/);
      if (pubkeyMatch) { advId = pubkeyMatch[1]; cleanName = option.replace(/\s*\([a-fA-F0-9]+\)$/, '').trim(); }
      for (const [entityId, state] of contactSensors) {
        const attrs = state.attributes as any;
        if ((attrs.adv_name || '') === cleanName) {
          if (!advId) { const m = entityId.match(/meshcore_.*?_([a-f0-9]+)_contact$/); if (m) advId = m[1]; }
          break;
        }
      }
      contacts.push({ name: option, cleanName, id: advId || option, advId, entityId: contactSelect.entity_id, contactEntityId: null, lastSeen: null, state: contactSelect });
    }
    MeshcoreMessageCard._globalContactsCache = contacts;
    return contacts;
  }

  private _findMessagesEntity(id: number | string, type: "channel" | "contact"): string | null {
    if (!this._hass) return null;
    if (type === "channel") {
      const channelIdx = id as number;
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_ch_${channelIdx}_messages`) && entityId.startsWith("binary_sensor.meshcore")) return entityId;
      }
      return null;
    } else {
      const pubkey = id as string;
      const shortId = pubkey.substring(0, 6);
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_${shortId}_messages`) && entityId.startsWith("binary_sensor.meshcore")) return entityId;
      }
      return null;
    }
  }

  private async _fetchLogbook(entityId: string): Promise<any[]> {
    const endTime = new Date();
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 1);
    startTime.setHours(0, 0, 0, 0);
    const apiUrl = `/api/logbook/${startTime.toISOString()}?end_time=${encodeURIComponent(endTime.toISOString())}&entity=${encodeURIComponent(entityId)}`;
    const authToken = this._getAuthToken();
    if (!authToken) throw new Error("No auth token");
    const response = await fetch(apiUrl, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  private _parseLogbookEntry(item: any, myHubName: string): any | null {
    const fullText = item.message || "";
    let sender = "", content = fullText;
    const colonIndex = fullText.indexOf(": ");
    if (colonIndex !== -1) {
      const before = fullText.substring(0, colonIndex);
      content = fullText.substring(colonIndex + 2);
      const gtIndex = before.lastIndexOf(">");
      sender = gtIndex !== -1 ? before.substring(gtIndex + 1).trim() : before.trim();
    } else {
      const gtIndex = fullText.indexOf(">");
      if (gtIndex !== -1) {
        const afterGt = fullText.substring(gtIndex + 1).trim();
        const spaceIndex = afterGt.indexOf(" ");
        if (spaceIndex !== -1) { sender = afterGt.substring(0, spaceIndex).trim(); content = afterGt.substring(spaceIndex + 1).trim(); }
        else { sender = afterGt; content = ""; }
      }
    }
    if (!sender || sender === "?") return null;
    const isSent = sender.toLowerCase() === myHubName.toLowerCase();
    return { text: content || fullText, fullText, sender, time: new Date(item.when).getTime() / 1000, direction: isSent ? "sent" : "received" };
  }

  private async _loadChannelMessages(channelIdx: number, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(channelIdx, "channel");
    if (!entityId) return [];
    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];
    const myHubName = this._getMyHubName();
    const messages = entries.map(item => this._parseLogbookEntry(item, myHubName)).filter(Boolean);
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadContactMessages(contactPubkey: string, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(contactPubkey, "contact");
    if (!entityId) throw new Error("contact_unavailable");
    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];
    const myHubName = this._getMyHubName();
    const messages = entries.map(item => this._parseLogbookEntry(item, myHubName)).filter(Boolean);
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadMessages(): Promise<void> {
    if (this._isLoading) return;
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const targetValue = targetSelect?.value;
    if (!targetValue) { this._lastMessages = []; this._renderMessages(); return; }
    this._isLoading = true;
    this._refreshCount++;
    const callId = this._refreshCount;
    try {
      let messages = this._messageType === "channel"
        ? await this._loadChannelMessages(parseInt(targetValue), callId)
        : await this._loadContactMessages(targetValue, callId);
      if (callId !== this._refreshCount) return;
      this._lastMessages = messages;
      this._renderMessages(false);
    } catch (error: any) {
      if (error.message === "contact_unavailable") {
        const t = this._getTranslations();
        this._lastMessages = [{ text: t("message-card.contact_unavailable"), sender: "", time: Date.now()/1000, direction: "error" }];
        this._renderMessages(false);
      } else { this._lastMessages = []; this._renderMessages(false); }
    } finally { this._isLoading = false; }
  }

  private _sendMessage(): void {
    const t = this._getTranslations();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const messageInput = this.shadowRoot?.querySelector("#message-input") as HTMLTextAreaElement | null;
    const statusDiv = this.shadowRoot?.querySelector("#status") as HTMLElement | null;
    const targetValue = targetSelect?.value, message = messageInput?.value.trim();
    if (!targetValue) { if (statusDiv) statusDiv.textContent = t("message-card.error_recipient"); return; }
    if (!message) { if (statusDiv) statusDiv.textContent = t("message-card.error_message"); return; }
    if (statusDiv) { statusDiv.textContent = t("message-card.sending"); statusDiv.style.color = "var(--secondary-text-color)"; }
    const hass = this._hass as any;
    const serviceCall = this._messageType === "channel"
      ? hass.callService("meshcore", "send_channel_message", { channel_idx: parseInt(targetValue), message })
      : hass.callService("meshcore", "send_message", { pubkey_prefix: targetValue, message });
    serviceCall
      .then(() => {
        if (statusDiv) { statusDiv.textContent = t("message-card.sent", { type: this._messageType === "channel" ? t("message-card.to_channel") : t("message-card.direct") }); statusDiv.style.color = "var(--success-color)"; }
        if (messageInput) messageInput.value = "";
        setTimeout(() => this._loadMessages(), 7000);
        setTimeout(() => { if (statusDiv) statusDiv.textContent = ""; }, 5000);
      })
      .catch((error: any) => {
        if (statusDiv) { statusDiv.textContent = t("message-card.error_general", { error: error.message || "Unknown error" }); statusDiv.style.color = "var(--error-color)"; }
        setTimeout(() => { if (statusDiv) statusDiv.textContent = ""; }, 5000);
      });
  }

  private _linkify(text: string): string {
    if (!text) return "";
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/(https?:\/\/[^\s]+)/g, url => `<a class="message-link" data-url="${escapeHtml(url)}" href="#">${escapeHtml(url)}</a>`);
    const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-text-color')
    .trim()
    const isLightTheme = textColor === '#141414' || textColor === 'rgb(20, 20, 20)';
    const particleColor = isLightTheme ? 'white' : 'dark';
    escaped = escaped.replace(/@\[([^\]]+)\]/g, (_, name) => `<span class="mention-${particleColor}">${escapeHtml(name.trim())}</span>`);
    return escaped;
  }

  private _setupLinkListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    if ((container as any)._linkListener) container.removeEventListener("click", (container as any)._linkListener);
    const onLinkClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest(".message-link") as HTMLAnchorElement;
      if (!link) return;
      e.preventDefault(); e.stopPropagation();
      const url = link.getAttribute("data-url") || link.textContent || "";
      if (url) this._copyUrl(url, link);
    };
    container.addEventListener("click", onLinkClick);
    (container as any)._linkListener = onLinkClick;
  }

  private async _copyUrl(url: string, linkElement: HTMLElement): Promise<void> {
    const t = this._getTranslations();
    const overlay = document.createElement("span");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:white;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:500;pointer-events:none;white-space:nowrap;z-index:10;opacity:0;transition:opacity 0.2s;";
    linkElement.style.position = "relative";
    linkElement.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = "1"; });
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} document.body.removeChild(ta);
    }
    setTimeout(() => { overlay.style.opacity = "0"; setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300); }, 1500);
  }

  /* ---------- Kopiowanie przez przytrzymanie ---------- */
  private _setupCopyListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    if ((container as any)._copyListeners) {
      container.removeEventListener("pointerdown", (container as any)._copyListeners.pointerdown);
      container.removeEventListener("pointerup", (container as any)._copyListeners.pointerup);
      container.removeEventListener("pointerleave", (container as any)._copyListeners.pointerleave);
    }
    let pressTimer: number | null = null;
    let targetElement: HTMLElement | null = null;

    const onPointerDown = (e: Event) => {
      const target = (e as PointerEvent).target as HTMLElement;
      if (target.closest(".message-link")) return;
      const messageItem = target.closest(".message-item") as HTMLElement;
      if (!messageItem) return;
      const pathElement = target.closest(".message-path") as HTMLElement;
      
      if (pathElement) {
        targetElement = pathElement;
      } else {
        targetElement = messageItem.querySelector(".message-bubble") as HTMLElement || messageItem;
      }
      
      pressTimer = window.setTimeout(() => {
        if (pathElement) {
          this._handleCopyPath(pathElement);
        } else {
          this._handleCopyFullMessage(messageItem);
        }
        if (targetElement) {
          targetElement.style.backgroundColor = "var(--primary-color, #03a9f4)";
          targetElement.style.transition = "background-color 0.2s";
          setTimeout(() => { if (targetElement) targetElement.style.backgroundColor = ""; }, 300);
        }
      }, 500);
    };

    const onPointerUp = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (targetElement) { targetElement.style.backgroundColor = ""; targetElement = null; }
    };
    const onPointerLeave = onPointerUp;
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);
    (container as any)._copyListeners = { pointerdown: onPointerDown, pointerup: onPointerUp, pointerleave: onPointerLeave };
  }

  private async _handleCopyFullMessage(messageItem: HTMLElement): Promise<void> {
    const textElement = messageItem.querySelector(".message-bubble") as HTMLElement;
    if (!textElement) return;

    const fullText = textElement.textContent?.trim() || "";
    const t = this._getTranslations();

    const overlay = document.createElement("div");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.2s;
    `;
    textElement.style.position = "relative";
    textElement.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = fullText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(textarea);
    }

    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 300);
    }, 1500);
  }

  private async _handleCopyPath(pathElement: HTMLElement): Promise<void> {
    const pathValue = pathElement.querySelector(".path-value");
    if (!pathValue) return;
    const pathText = pathValue.textContent?.trim() || "";
    const t = this._getTranslations();
    const overlay = document.createElement("div");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:white;padding:6px 14px;border-radius:20px;font-size:14px;font-weight:500;pointer-events:none;z-index:10;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.2s;";
    pathElement.style.position = "relative";
    pathElement.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = "1"; });
    try { await navigator.clipboard.writeText(pathText); } catch {
      const ta = document.createElement("textarea"); ta.value = pathText; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} document.body.removeChild(ta);
    }
    setTimeout(() => { overlay.style.opacity = "0"; setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300); }, 1500);
  }

  /* ---------- Aktualizacja listy ---------- */
  private _updateTargetListOnly(): void {
    if (this._isUpdating) return;
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (!targetSelect) return;
    const t = this._getTranslations();
    let newOptionsHtml = `<option value="">${t("message-card.select_prompt")}</option>`;
    let labelText = "";
    if (this._messageType === "channel") {
      const channels = this._getChannels();
      labelText = t("message-card.select_channel");
      for (const ch of channels) {
        newOptionsHtml += `<option value="${ch.idx}">${escapeHtml(t("message-card.channel_option", { name: ch.name, idx: ch.idx }))}</option>`;
      }
    } else {
      const contacts = this._getContacts();
      labelText = t("message-card.select_contact");
      for (const contact of contacts) {
        newOptionsHtml += `<option value="${escapeHtml(contact.advId || contact.name)}">${escapeHtml(contact.name)}</option>`;
      }
    }
    if (targetSelect.innerHTML === newOptionsHtml) return;
    this._isUpdating = true;
    const currentValue = targetSelect.value;
    const targetLabelSpan = this.shadowRoot?.querySelector("#target-label span:last-child");
    if (targetLabelSpan) targetLabelSpan.textContent = labelText;
    targetSelect.innerHTML = newOptionsHtml;
    if (currentValue && Array.from(targetSelect.options).some(opt => opt.value === currentValue)) targetSelect.value = currentValue;
    this._isUpdating = false;
  }

  private _fullUpdate(): void {
    if (this._refreshTimeout) { clearTimeout(this._refreshTimeout); this._refreshTimeout = null; }
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const newValue = targetSelect?.value || null;
    if (newValue !== this._lastSelectedValue) {
      this._lastSelectedValue = newValue;
      if (newValue) this._loadMessages(); else { this._lastMessages = []; this._renderMessages(false); }
    }
  }

  private _onTypeChange(event: Event): void {
    this._messageType = (event.target as HTMLInputElement).value as "channel" | "contact";
    this._updateTargetListOnly();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && targetSelect.value) { this._lastSelectedValue = targetSelect.value; this._loadMessages(); }
    else { this._lastMessages = []; this._renderMessages(false); }
    const radioGroup = this.shadowRoot?.querySelector(".radio-group");
    if (radioGroup) {
      const options = radioGroup.querySelectorAll(".radio-option");
      options.forEach(opt => opt.classList.remove("selected"));
      const active = radioGroup.querySelector(`.radio-option input[value="${this._messageType}"]`)?.closest(".radio-option");
      if (active) active.classList.add("selected");
    }
  }

  private _formatTime(timestamp: number | null): string {
    if (!timestamp) return "";
    const t = this._getTranslations();
    const now = Math.floor(Date.now() / 1000);
    let diff = now - timestamp;
    if (diff < 0) diff = 0;
    if (diff < 60) {
      const seconds = Math.floor(diff);
      return t("message-card.seconds_ago", { n: seconds });
    }
    if (diff < 3600) {
      const minutes = Math.floor(diff / 60);
      return t("message-card.minutes_ago", { n: minutes });
    }
    if (diff < 86400) {
      const hours = Math.floor(diff / 3600);
      return t("message-card.hours_ago", { n: hours });
    }
    const days = Math.floor(diff / 86400);
    return t("message-card.days_ago", { n: days });
  }

  /* ---------- Render wiadomości ---------- */
  private _renderMessages(loading = false): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    const t = this._getTranslations();

    if (loading) {
      container.innerHTML = `<div class="empty-messages loading-spinner"><ha-icon icon="mdi:loading" style="--mdc-icon-size: 28px;"></ha-icon><br>${t("message-card.loading")}</div>`;
      return;
    }
    if (this._lastMessages.length === 1 && this._lastMessages[0].direction === "error") {
      container.innerHTML = `<div class="empty-messages" style="color: var(--error-color);"><ha-icon icon="mdi:alert-circle"></ha-icon><br>${escapeHtml(this._lastMessages[0].text)}</div>`;
      return;
    }
    if (this._lastMessages.length === 0) {
      container.innerHTML = `<div class="empty-messages"><ha-icon icon="mdi:message-text-off" style="--mdc-icon-size: 32px;"></ha-icon><br>${t("message-card.no_messages")}</div>`;
      return;
    }

    const useNames = this._config?.use_repeater_names !== false;
    if (useNames) this._ensureRepeaterNamesMap();

    const currentEntityId = this._lastSelectedValue
      ? this._findMessagesEntity(
          this._messageType === "channel" ? parseInt(this._lastSelectedValue) : this._lastSelectedValue,
          this._messageType
        )
      : null;

    const currentKeys = new Set<string>();
    for (const msg of this._lastMessages) {
      const rxResult = currentEntityId ? this._findRxData(msg.time, currentEntityId) : null;
      if (rxResult) currentKeys.add(rxResult.key);
    }
    for (const key of this._expandedMessages) { if (!currentKeys.has(key)) this._expandedMessages.delete(key); }

    const messagesHtml = this._lastMessages.map(msg => {
      const isSent = msg.direction === "sent";
      const senderName = msg.sender;
      const timeStr = this._formatTime(msg.time);
      const messageClass = isSent ? "sent" : "received";
      const messageHtml = this._linkify(msg.text);

      const rxResult = currentEntityId ? this._findRxData(msg.time, currentEntityId) : null;
      const rxData = rxResult?.data || null;
      const matchedKey = rxResult?.key || null;
      let metricsHtml = "", pathHtml = "";
      const isExpanded = matchedKey ? this._expandedMessages.has(matchedKey) : false;

      if (rxData) {
        const rssiEscaped = escapeHtml(rxData.rssi);
        const snrEscaped = escapeHtml(rxData.snr);
        const pathLenEscaped = rxData.path ? escapeHtml(rxData.path_len || 1) : '';
        metricsHtml = `
          <div class="message-metrics" data-key="${matchedKey}">
            <div class="metrics-group">
              <div class="metric-item"><span class="metric-icon">${signalHighIcon}</span><span class="metric-value">${rssiEscaped} dBm</span></div>
              <div class="metric-item"><span class="metric-icon">${activityIcon}</span><span class="metric-value">${snrEscaped} dB</span></div>
              ${rxData.path ? `<div class="metric-item"><span class="metric-icon">${waypointsIcon}</span><span class="metric-value">${pathLenEscaped}</span></div>` : ""}
            </div>
            <span class="metric-toggle" data-key="${matchedKey}"><ha-icon icon="${isExpanded ? 'mdi:chevron-down' : 'mdi:chevron-right'}"></ha-icon></span>
          </div>`;

        if (rxData.path) {
          let pathSegments = useNames
            ? this._formatPathWithNames(rxData.path, rxData.path_len, rxData.route_type, t)
            : this._formatPath(rxData.path, rxData.path_len, rxData.route_type).split(' → ').map(s => escapeHtml(s.trim()));
          const joined = pathSegments.map((seg, i) => i === 0 ? `<span class="path-hop">${seg}</span>` : ` → <span class="path-hop">${seg}</span>`).join('');
          pathHtml = `<div class="message-path ${isExpanded ? 'expanded' : ''}" data-key="${matchedKey}"><span class="path-value">${joined}</span></div>`;
        } else {
          pathHtml = `<div class="message-path ${isExpanded ? 'expanded' : ''}" data-key="${matchedKey}"><span class="path-value">${escapeHtml(t("message-card.no_path_data"))}</span></div>`;
        }
      }

      return `
        <div class="message-item">
          <div class="message-card ${messageClass}">
            <div class="message-header">
              <div class="message-time"><ha-icon icon="mdi:clock-outline"></ha-icon>${escapeHtml(timeStr || 'Just now')}</div>
              <div class="message-sender ${messageClass}">${escapeHtml(senderName)}<ha-icon icon="${isSent ? 'mdi:arrow-up-bold' : 'mdi:arrow-down-bold'}" style="color:${isSent ? 'var(--mesh-green)' : 'var(--mesh-blue)'}"></ha-icon></div>
            </div>
            <div class="message-body"><div class="message-bubble">${messageHtml}</div></div>
            ${metricsHtml}${pathHtml}
          </div>
        </div>`;
    }).join("");

    container.innerHTML = `<div class="messages-list">${messagesHtml}</div>`;
    this._setupLinkListeners();
    this._setupCopyListeners();
    this._setupExpandListeners();
    this._setupSenderClickListeners();
  }

  private _setupExpandListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    if ((container as any)._expandListener) container.removeEventListener("click", (container as any)._expandListener);
    const expandListener = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest(".message-link")) return;
      const metricsContainer = target.closest(".message-metrics") as HTMLElement;
      if (!metricsContainer) return;
      const key = metricsContainer.dataset["key"];
      if (!key) return;
      if (this._expandedMessages.has(key)) this._expandedMessages.delete(key);
      else this._expandedMessages.add(key);
      const pathDiv = container.querySelector(`.message-path[data-key="${key}"]`) as HTMLElement;
      const toggleIcon = metricsContainer.querySelector(`.metric-toggle[data-key="${key}"]`) as HTMLElement;
      if (pathDiv) {
        if (this._expandedMessages.has(key)) { pathDiv.classList.add('expanded'); pathDiv.style.display = 'block'; }
        else { pathDiv.classList.remove('expanded'); pathDiv.style.display = 'none'; }
      }
      if (toggleIcon) toggleIcon.innerHTML = `<ha-icon icon="${this._expandedMessages.has(key) ? 'mdi:chevron-down' : 'mdi:chevron-right'}"></ha-icon>`;
    };
    container.addEventListener("click", expandListener);
    (container as any)._expandListener = expandListener;
  }

  private _setupSenderClickListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    if ((container as any)._senderClickListener) container.removeEventListener("click", (container as any)._senderClickListener);
    const senderClickListener = (e: Event) => {
      const target = e.target as HTMLElement;
      const senderElement = target.closest(".message-sender.received") as HTMLElement;
      if (!senderElement) return;
      e.stopPropagation();
      const senderName = senderElement.textContent?.trim() || "";
      if (!senderName) return;
      const input = this.shadowRoot?.querySelector("#message-input") as HTMLTextAreaElement | null;
      if (!input) return;
      const mention = `@[${senderName}] `;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.substring(0, start) + mention + input.value.substring(end);
      input.selectionStart = input.selectionEnd = start + mention.length;
      input.focus();
    };
    container.addEventListener("click", senderClickListener);
    (container as any)._senderClickListener = senderClickListener;
  }

  private _getTranslations(): LocalizeFunc {
    return makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
  }

  private _initFileRefresh(): void {
    if (this._initialFileLoadDone) return;
    this._initialFileLoadDone = true;
    this._fetchRxLogFromFile();
  }

  /* ---------- Główny render ---------- */
  private _render(): void {
    if (!this._hass || !this._config) return;
    if (this._defaultChannel !== null) this._messageType = "channel";
    const t = this._getTranslations();
    const channels = this._getChannels();
    const contacts = this._getContacts();

    if (channels.length === 0 && contacts.length === 0) {
      this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style><ha-card><div class="empty-messages"><ha-icon icon="mdi:message-alert" style="--mdc-icon-size: 36px;"></ha-icon><br>${t("message-card.no_channels")}</div><div class="author-info">${t("message-card.author")}</div></ha-card>`;
      this._initialized = true;
      return;
    }

    this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style>
      <ha-card>
        <div class="section-header"><ha-icon icon="mdi:message-text"></ha-icon><span>${t("message-card.send_message")}</span></div>
        <div class="radio-group">
          <label class="radio-option ${this._messageType === "channel" ? "selected" : ""}"><input type="radio" name="message-type" value="channel" ${this._messageType === "channel" ? "checked" : ""}><ha-icon icon="mdi:pound"></ha-icon><span>${t("message-card.channel")}</span></label>
          <label class="radio-option ${this._messageType === "contact" ? "selected" : ""}"><input type="radio" name="message-type" value="contact" ${this._messageType === "contact" ? "checked" : ""}><ha-icon icon="mdi:account"></ha-icon><span>${t("message-card.contact")}</span></label>
        </div>
        <div class="input-group"><div class="label" id="target-label"><ha-icon icon="mdi:chat"></ha-icon><span>${this._messageType === "channel" ? t("message-card.select_channel") : t("message-card.select_contact")}</span></div><select id="target-select"><option value="">${t("message-card.select_prompt")}</option></select></div>
        <div class="input-group"><div class="label"><ha-icon icon="mdi:message"></ha-icon><span>${t("message-card.message_placeholder")}</span></div><textarea id="message-input" rows="3" placeholder="${t("message-card.message_placeholder")}"></textarea></div>
        <button id="send-btn"><ha-icon icon="mdi:send"></ha-icon>${t("message-card.send")}</button>
        <div id="status" class="status"></div>
        <div class="messages-section">
          <div class="messages-header"><ha-icon icon="mdi:history"></ha-icon><span>${t("message-card.message_history")} ${t("message-card.today")}</span><ha-icon icon="mdi:refresh" class="refresh-btn" id="refresh-history"></ha-icon></div>
          <div id="messages-container"><div class="empty-messages">${t("message-card.select_channel")}...</div></div>
        </div>
      </ha-card>`;

    this.shadowRoot!.querySelector('input[value="channel"]')?.addEventListener("change", (e) => this._onTypeChange(e));
    this.shadowRoot!.querySelector('input[value="contact"]')?.addEventListener("change", (e) => this._onTypeChange(e));
    this.shadowRoot!.querySelector("#send-btn")?.addEventListener("click", () => this._sendMessage());
    this.shadowRoot!.querySelector("#refresh-history")?.addEventListener("click", async () => { await this._fetchRxLogFromFile(); this._loadMessages(); });
    this.shadowRoot!.querySelector("#target-select")?.addEventListener("change", () => this._fullUpdate());

    const updateRadioStyles = () => {
      const opts = this.shadowRoot!.querySelectorAll(".radio-option");
      opts.forEach(opt => opt.classList.remove("selected"));
      const active = this.shadowRoot!.querySelector(`.radio-option input[value="${this._messageType}"]`)?.closest(".radio-option");
      if (active) active.classList.add("selected");
    };
    this.shadowRoot!.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener("change", updateRadioStyles));
    this._updateTargetListOnly();

    if (this._defaultChannel !== null) {
      const ts = this.shadowRoot!.querySelector("#target-select") as HTMLSelectElement | null;
      if (ts) {
        const defaultVal = String(this._defaultChannel);
        if (!Array.from(ts.options).some(o => o.value === defaultVal)) {
          const ch = this._getChannels().find(c => String(c.name).toLowerCase() === defaultVal.toLowerCase());
          if (ch) ts.value = String(ch.idx);
        } else ts.value = defaultVal;
      }
    }
    this._initFileRefresh();
    this._fullUpdate();
    this._initialized = true;
  }

  getCardSize(): number { return 7; }
}

/* ---------- Edytor ---------- */
export class MeshcoreMessageCardEditor extends HTMLElement {
  private _config?: MeshcoreMessageCardConfig;

  setConfig(config: MeshcoreMessageCardConfig): void { this._config = { ...config }; }
  set hass(_hass: HomeAssistant) {}

  connectedCallback(): void {
    while (this.lastChild) this.removeChild(this.lastChild);
    const container = document.createElement("div");
    container.style.cssText = "margin:16px;";
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this._config?.use_repeater_names !== false;
    checkbox.addEventListener("change", () => {
      this._config = { ...this._config, use_repeater_names: checkbox.checked };
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config } }));
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode("Show repeater names in path"));
    container.appendChild(label);
    const msg = document.createElement("p");
    msg.style.cssText = "color:var(--secondary-text-color);font-size:14px;margin-top:12px;";
    msg.textContent = "The message card automatically discovers channels and contacts. No manual configuration needed.";
    container.appendChild(msg);
    this.appendChild(container);
  }
}