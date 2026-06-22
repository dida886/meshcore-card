import type { HomeAssistant, MeshcoreMessageCardConfig } from "./types.js";
import { escapeHtml } from "./helpers.js";
import { STYLES } from "./styles.js";
import { MESSAGE_STYLES } from "./message-styles.js";
import { makeLocalize, type LocalizeFunc } from "./localize.js";
import { discoverHubs } from "./discovery.js";

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
  private _listenerAdded: boolean = false;
  private _refreshTimeout: ReturnType<typeof setTimeout> | null = null;

  // Store rx_log_data mapped by timestamp + normalized text
  private _rxLogData: Map<string, any> = new Map();

  // Store expanded state for each message
  private _expandedMessages: Set<string> = new Set();

  // localStorage keys and limits
  private static readonly STORAGE_KEY = 'meshcore_rx_log_data';
  private static readonly MAX_STORED_ENTRIES = 500;
  private static readonly MAX_AGE_SECONDS = 86400; // 24 godziny

  private static _globalContactsCache: any[] | null = null;
  private static _globalChannelsCache: any[] | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._loadRxLogDataFromStorage();
  }

  disconnectedCallback() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }
  }

  // ---------- localStorage helpers ----------
  private _loadRxLogDataFromStorage(): void {
    try {
      const stored = localStorage.getItem(MeshcoreMessageCard.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this._rxLogData = new Map(parsed);
          this._pruneRxLogData();
          this._saveRxLogDataToStorage();
        }
      }
    } catch (_) {
      // Silently ignore storage errors
    }
  }

  private _saveRxLogDataToStorage(): void {
    try {
      const array = Array.from(this._rxLogData.entries());
      localStorage.setItem(MeshcoreMessageCard.STORAGE_KEY, JSON.stringify(array));
    } catch (_) {
      // Silently ignore storage errors
    }
  }

  private _pruneRxLogData(): void {
    const now = Date.now() / 1000;
    for (const [key] of this._rxLogData) {
      const ts = parseInt(key.split('_')[0]);
      if (now - ts > MeshcoreMessageCard.MAX_AGE_SECONDS) {
        this._rxLogData.delete(key);
      }
    }
    if (this._rxLogData.size > MeshcoreMessageCard.MAX_STORED_ENTRIES) {
      const keys = Array.from(this._rxLogData.keys()).sort();
      const toDelete = keys.slice(0, this._rxLogData.size - MeshcoreMessageCard.MAX_STORED_ENTRIES);
      for (const key of toDelete) {
        this._rxLogData.delete(key);
      }
    }
  }

  // ---------- Helper: normalize text for key matching ----------
  private _normalizeText(text: string): string {
    if (!text) return '';
    
    // Remove channel prefix e.g. "<Public> ", "<#test> ", etc.
    let normalized = text.replace(/^<[^>]+>\s*/, '');
    
    // Remove emojis (simplified version)
    normalized = normalized.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    
    // Normalize whitespace and trim
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  // ---------- Helper: format path for display ----------
  private _formatPath(path: string): string {
    if (!path) return '';
    
    let nodes = path.split(/[, ]+/).filter(p => p.trim() !== '');
    
    if (nodes.length === 1 && nodes[0].length > 2) {
      const hex = nodes[0];
      nodes = [];
      for (let i = 0; i < hex.length; i += 2) {
        if (i + 2 <= hex.length) {
          nodes.push(hex.substring(i, i + 2));
        }
      }
    }
    
    if (nodes.length === 0) return path;
    return nodes.join(' → ');
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
      }
    }

    // Subscribe to meshcore_message events for rx_log_data
    if (!this._listenerAdded) {
      const hassAny = hass as any;
      if (hassAny.connection) {
        hassAny.connection.subscribeEvents(
          (event: any) => {
            if (event.data?.rx_log_data && event.data.rx_log_data.length > 0 && event.event_type === 'meshcore_message') {
              const logData = event.data.rx_log_data[0];
              const senderName = event.data.sender_name || "Unknown";
              const eventTimestamp = event.data.timestamp || Date.now() / 1000;
              
              const rawText = logData.text || '';
              const normalizedText = this._normalizeText(rawText);
              const key = `${Math.floor(logData.timestamp)}_${normalizedText}`;

              if (!this._rxLogData.has(key)) {
                this._rxLogData.set(key, {
                  senderName: senderName,
                  rssi: logData.rssi,
                  snr: logData.snr,
                  path: logData.path,
                  path_len: logData.path_len,
                  route_type: logData.route_typename,
                  channel_name: logData.channel_name,
                  channel_idx: logData.channel_idx,
                  timestamp: logData.timestamp,
                  event_timestamp: eventTimestamp
                });

                this._pruneRxLogData();
                this._saveRxLogDataToStorage();
              }
              
              // Auto-refresh messages after 2 seconds if a target is selected
              const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
              if (targetSelect && targetSelect.value) {
                if (this._refreshTimeout) {
                  clearTimeout(this._refreshTimeout);
                }
                this._refreshTimeout = setTimeout(() => {
                  this._loadMessages();
                }, 3000);
              }
            }
          },
          'meshcore_message'
        );
        this._listenerAdded = true;
      }
    }

    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && document.activeElement === targetSelect) {
      return;
    }
    
    if (this._initialized) {
      this._updateTargetListOnly();
    } else {
      this._render();
    }
  }

  // ---------- Helpers: auth, hub name, lists ----------
  private _getAuthToken(): string | null {
    const hass = this._hass as any;
    if (hass?.connection?.options?.authToken) return hass.connection.options.authToken;
    if (hass?.auth?.data?.access_token) return hass.auth.data.access_token;
    return null;
  }

  private _getMyHubName(): string {
    if (!this._hass) return "Hub";
    const hubs = discoverHubs(this._hass);
    if (hubs.length > 0) {
      return hubs[0].name;
    }
    const channelSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_channel"
    );
    if (channelSelect && channelSelect.attributes.friendly_name) {
      const friendly = channelSelect.attributes.friendly_name;
      const match = friendly.match(/MeshCore\s+([^\s(]+)/i);
      if (match) return match[1];
    }
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if ((entityId.includes("_node_status") || entityId.includes("_status")) && state.attributes?.adv_name) {
        return state.attributes.adv_name;
      }
    }
    return "Hub";
  }

  private _getChannels(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalChannelsCache) return MeshcoreMessageCard._globalChannelsCache;

    const channelSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_channel"
    );
    if (!channelSelect) return [];

    const options = channelSelect.attributes.options || [];
    const channels = options.map((opt: string, idx: number) => {
      let name = opt;
      let channelIdx = idx;
      const match = opt.match(/^(\d+):\s*(.+)$/);
      if (match) {
        channelIdx = parseInt(match[1]);
        name = match[2];
      } else {
        const altMatch = opt.match(/^(.+?)\s*\((\d+)\)$/);
        if (altMatch) {
          name = altMatch[1];
          channelIdx = parseInt(altMatch[2]);
        }
      }
      return { idx: channelIdx, name, entityId: channelSelect.entity_id, state: channelSelect };
    });

    MeshcoreMessageCard._globalChannelsCache = channels;
    return channels;
  }

  private _getContacts(): any[] {
    if (!this._hass) return [];
    if (MeshcoreMessageCard._globalContactsCache) return MeshcoreMessageCard._globalContactsCache;

    const contactSelect = Object.values(this._hass.states).find(
      (state) => state.entity_id === "select.meshcore_contact"
    );
    if (!contactSelect) return [];

    const options = contactSelect.attributes.options || [];
    const contacts: any[] = [];

    const contactSensors = Object.entries(this._hass.states).filter(
      ([entityId]) => /^binary_sensor\.meshcore_.*_contact$/.test(entityId)
    );

    for (const option of options) {
      let advId: string | null = null;
      let cleanName = option;

      const pubkeyMatch = option.match(/\(([a-fA-F0-9]+)\)$/);
      if (pubkeyMatch) {
        advId = pubkeyMatch[1];
        cleanName = option.replace(/\s*\([a-fA-F0-9]+\)$/, '').trim();
      }

      for (const [entityId, state] of contactSensors) {
        const attrs = state.attributes as any;
        const sensorName = attrs.adv_name || '';
        if (sensorName === cleanName) {
          if (!advId) {
            const match = entityId.match(/meshcore_.*?_([a-f0-9]+)_contact$/);
            if (match) advId = match[1];
          }
          break;
        }
      }
      contacts.push({
        name: option,
        cleanName: cleanName,
        id: advId || option,
        advId: advId,
        entityId: contactSelect.entity_id,
        contactEntityId: null,
        lastSeen: null,
        state: contactSelect,
      });
    }

    MeshcoreMessageCard._globalContactsCache = contacts;
    return contacts;
  }

  // ---------- Fetch entity and logbook ----------
  private _findMessagesEntity(id: number | string, type: "channel" | "contact"): string | null {
    if (!this._hass) return null;
    
    if (type === "channel") {
      const channelIdx = id as number;
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_ch_${channelIdx}_messages`) && entityId.startsWith("binary_sensor.meshcore")) {
          return entityId;
        }
      }
      return null;
    } else {
      const pubkey = id as string;
      const shortId = pubkey.substring(0, 6);
      for (const [entityId] of Object.entries(this._hass.states)) {
        if (entityId.includes(`_${shortId}_messages`) && entityId.startsWith("binary_sensor.meshcore")) {
          return entityId;
        }
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
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- Parse single logbook entry ----------
  private _parseLogbookEntry(item: any, myHubName: string): any | null {
    const fullText = item.message || "";
    
    let sender = "";
    let content = fullText;

    const colonIndex = fullText.indexOf(": ");
    if (colonIndex !== -1) {
      const before = fullText.substring(0, colonIndex);
      content = fullText.substring(colonIndex + 2);
      const gtIndex = before.lastIndexOf(">");
      if (gtIndex !== -1) {
        sender = before.substring(gtIndex + 1).trim();
      } else {
        sender = before.trim();
      }
    } else {
      const gtIndex = fullText.indexOf(">");
      if (gtIndex !== -1) {
        const afterGt = fullText.substring(gtIndex + 1).trim();
        const spaceIndex = afterGt.indexOf(" ");
        if (spaceIndex !== -1) {
          sender = afterGt.substring(0, spaceIndex).trim();
          content = afterGt.substring(spaceIndex + 1).trim();
        } else {
          sender = afterGt;
          content = "";
        }
      }
    }

    if (!sender || sender === "?") {
      return null;
    }

    const isSent = sender.toLowerCase() === myHubName.toLowerCase();
    return {
      text: content || fullText,
      fullText: fullText,
      sender: sender,
      time: new Date(item.when).getTime() / 1000,
      direction: isSent ? "sent" : "received",
    };
  }

  // ---------- Loading messages ----------
  private async _loadChannelMessages(channelIdx: number, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(channelIdx, "channel");
    if (!entityId) return [];

    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];

    const myHubName = this._getMyHubName();
    const messages: any[] = [];
    
    for (const item of entries) {
      const parsed = this._parseLogbookEntry(item, myHubName);
      if (parsed) {
        messages.push(parsed);
      }
    }
    
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadContactMessages(contactPubkey: string, callId: number): Promise<any[]> {
    const entityId = this._findMessagesEntity(contactPubkey, "contact");
    if (!entityId) {
      throw new Error("contact_unavailable");
    }

    const entries = await this._fetchLogbook(entityId);
    if (callId !== this._refreshCount) return [];

    const myHubName = this._getMyHubName();
    const messages: any[] = [];
    
    for (const item of entries) {
      const parsed = this._parseLogbookEntry(item, myHubName);
      if (parsed) {
        messages.push(parsed);
      }
    }
    
    messages.sort((a, b) => b.time - a.time);
    return messages.slice(0, 20);
  }

  private async _loadMessages(): Promise<void> {
    if (this._isLoading) return;
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const targetValue = targetSelect?.value;
    if (!targetValue) {
      this._lastMessages = [];
      this._renderMessages();
      return;
    }
    this._isLoading = true;
    this._refreshCount++;
    const callId = this._refreshCount;
    try {
      let messages: any[] = [];
      if (this._messageType === "channel") {
        messages = await this._loadChannelMessages(parseInt(targetValue), callId);
      } else {
        messages = await this._loadContactMessages(targetValue, callId);
      }
      if (callId !== this._refreshCount) return;
      this._lastMessages = messages;
      this._renderMessages(false);
    } catch (error: any) {
      if (error.message === "contact_unavailable") {
        const t = this._getTranslations();
        this._lastMessages = [
          {
            text: t("message-card.contact_unavailable"),
            sender: "",
            time: Date.now() / 1000,
            direction: "error",
          },
        ];
        this._renderMessages(false);
      } else {
        this._lastMessages = [];
        this._renderMessages(false);
      }
    } finally {
      this._isLoading = false;
    }
  }

  // ---------- Sending message ----------
  private _sendMessage(): void {
    const t = this._getTranslations();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const messageInput = this.shadowRoot?.querySelector("#message-input") as HTMLTextAreaElement | null;
    const statusDiv = this.shadowRoot?.querySelector("#status") as HTMLElement | null;
    const targetValue = targetSelect?.value;
    const message = messageInput?.value.trim();

    if (!targetValue) {
      if (statusDiv) statusDiv.textContent = t("message-card.error_recipient");
      return;
    }
    if (!message) {
      if (statusDiv) statusDiv.textContent = t("message-card.error_message");
      return;
    }
    if (statusDiv) {
      statusDiv.textContent = t("message-card.sending");
      statusDiv.style.color = "var(--secondary-text-color)";
    }

    const hass = this._hass as any;
    let serviceCall: Promise<any>;

    if (this._messageType === "channel") {
      serviceCall = hass.callService("meshcore", "send_channel_message", {
        channel_idx: parseInt(targetValue),
        message,
      });
    } else {
      serviceCall = hass.callService("meshcore", "send_message", {
        pubkey_prefix: targetValue,
        message,
      });
    }

    serviceCall
      .then(() => {
        const typeName = this._messageType === "channel" ? t("message-card.to_channel") : t("message-card.direct");
        if (statusDiv) {
          statusDiv.textContent = t("message-card.sent", { type: typeName });
          statusDiv.style.color = "var(--success-color)";
        }
        if (messageInput) messageInput.value = "";

        setTimeout(() => {
          this._loadMessages();
        }, 7000);

        setTimeout(() => {
          if (statusDiv) statusDiv.textContent = "";
        }, 5000);
      })
      .catch((error: any) => {
        if (statusDiv) {
          statusDiv.textContent = t("message-card.error_general", { error: error.message || "Unknown error" });
          statusDiv.style.color = "var(--error-color)";
        }
        setTimeout(() => {
          if (statusDiv) statusDiv.textContent = "";
        }, 5000);
      });
  }

  // ---------- Linkify ----------
  private _linkify(text: string): string {
    if (!text) return "";
    let escaped = escapeHtml(text);
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    escaped = escaped.replace(urlRegex, (url) => {
      return `<a class="message-link" data-url="${escapeHtml(url)}" href="#">${escapeHtml(url)}</a>`;
    });
    
    const mentionRegex = /@\[([^\]]+)\]/g;
    escaped = escaped.replace(mentionRegex, (match, name) => {
      const cleanName = name.trim();
      return `<span class="mention">${escapeHtml(cleanName)}</span>`;
    });
    
    return escaped;
  }

  private _setupLinkListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;

    if ((container as any)._linkListener) {
      container.removeEventListener("click", (container as any)._linkListener);
    }

    const onLinkClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const link = target.closest(".message-link") as HTMLAnchorElement;
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      const url = link.getAttribute("data-url") || link.textContent || "";
      if (!url) return;

      this._copyUrl(url, link);
    };

    container.addEventListener("click", onLinkClick);
    (container as any)._linkListener = onLinkClick;
  }

  private async _copyUrl(url: string, linkElement: HTMLElement): Promise<void> {
    const t = this._getTranslations();

    const overlay = document.createElement("span");
    overlay.textContent = t("message-card.copied");
    overlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.75);
      color: white;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    linkElement.style.position = "relative";
    linkElement.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
    });

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (_) {}
      document.body.removeChild(textarea);
    }

    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 300);
    }, 1500);
  }

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
      targetElement = messageItem;
      pressTimer = window.setTimeout(() => {
        this._handleCopyFullMessage(messageItem);
        messageItem.style.backgroundColor = "var(--primary-color, #03a9f4)";
        messageItem.style.transition = "background-color 0.2s";
        setTimeout(() => {
          messageItem.style.backgroundColor = "";
        }, 300);
      }, 500);
    };

    const onPointerUp = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      if (targetElement) {
        targetElement.style.backgroundColor = "";
        targetElement = null;
      }
    };

    const onPointerLeave = onPointerUp;

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerleave", onPointerLeave);

    (container as any)._copyListeners = {
      pointerdown: onPointerDown,
      pointerup: onPointerUp,
      pointerleave: onPointerLeave,
    };
  }

  private async _handleCopyFullMessage(messageItem: HTMLElement): Promise<void> {
    const textElement = messageItem.querySelector(".message-text") as HTMLElement;
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
    messageItem.style.position = "relative";
    messageItem.appendChild(overlay);

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
      try {
        document.execCommand("copy");
      } catch (_) {}
      document.body.removeChild(textarea);
    }

    setTimeout(() => {
      overlay.style.opacity = "0";
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 300);
    }, 1500);
  }

  // ---------- Update select list ----------
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
        const channelLabel = t("message-card.channel_option", { 
          name: ch.name, 
          idx: ch.idx 
        });
        newOptionsHtml += `<option value="${ch.idx}">${escapeHtml(channelLabel)}</option>`;
      }
    } else {
      const contacts = this._getContacts();
      labelText = t("message-card.select_contact");
      for (const contact of contacts) {
        const value = contact.advId || contact.name;
        newOptionsHtml += `<option value="${escapeHtml(value)}">${escapeHtml(contact.name)}</option>`;
      }
    }

    if (targetSelect.innerHTML === newOptionsHtml) {
      return;
    }

    this._isUpdating = true;
    const currentValue = targetSelect.value;
    const targetLabelSpan = this.shadowRoot?.querySelector("#target-label span:last-child");
    if (targetLabelSpan) targetLabelSpan.textContent = labelText;

    targetSelect.innerHTML = newOptionsHtml;
    if (currentValue && Array.from(targetSelect.options).some((opt) => opt.value === currentValue)) {
      targetSelect.value = currentValue;
    }
    this._isUpdating = false;
  }

  private _fullUpdate(): void {
    // Clear pending refresh timeout
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }

    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    const newValue = targetSelect?.value || null;
    if (newValue !== this._lastSelectedValue) {
      this._lastSelectedValue = newValue;
      if (newValue) {
        this._loadMessages();
      } else {
        this._lastMessages = [];
        this._renderMessages(false);
      }
    }
  }

  private _onTypeChange(event: Event): void {
    this._messageType = (event.target as HTMLInputElement).value as "channel" | "contact";
    this._updateTargetListOnly();
    const targetSelect = this.shadowRoot?.querySelector("#target-select") as HTMLSelectElement | null;
    if (targetSelect && targetSelect.value) {
      this._lastSelectedValue = targetSelect.value;
      this._loadMessages();
    } else {
      this._lastMessages = [];
      this._renderMessages(false);
    }
    const radioGroup = this.shadowRoot?.querySelector(".radio-group");
    if (radioGroup) {
      const options = radioGroup.querySelectorAll(".radio-option");
      options.forEach((opt) => opt.classList.remove("selected"));
      const activeLabel = radioGroup
        .querySelector(`.radio-option input[value="${this._messageType}"]`)
        ?.closest(".radio-option");
      if (activeLabel) activeLabel.classList.add("selected");
    }
  }

  // ---------- Format time ----------
  private _formatTime(timestamp: number | null): string {
    if (!timestamp) return "";
    const t = this._getTranslations();
    const now = Math.floor(Date.now() / 1000);
    let diff = now - timestamp;
    diff = Math.floor(diff);
    if (diff < 0) diff = 0;
    if (diff < 60) return t("message-card.seconds_ago", { n: diff });
    if (diff < 3600) return t("message-card.minutes_ago", { n: Math.floor(diff / 60) });
    if (diff < 86400) return t("message-card.hours_ago", { n: Math.floor(diff / 3600) });
    return t("message-card.days_ago", { n: Math.floor(diff / 86400) });
  }

  // ---------- Render messages ----------
  private _renderMessages(loading = false): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;
    const t = this._getTranslations();

    if (loading) {
      container.innerHTML = `<div class="empty-messages loading-spinner">
        <ha-icon icon="mdi:loading" style="--mdc-icon-size: 28px;"></ha-icon><br>${t("message-card.loading")}</div>`;
      return;
    }

    if (this._lastMessages.length === 1 && this._lastMessages[0].direction === "error") {
      const err = this._lastMessages[0];
      container.innerHTML = `<div class="empty-messages" style="color: var(--error-color);">
        <ha-icon icon="mdi:alert-circle"></ha-icon><br>${escapeHtml(err.text)}</div>`;
      return;
    }

    if (this._lastMessages.length === 0) {
      container.innerHTML = `<div class="empty-messages">
        <ha-icon icon="mdi:message-text-off" style="--mdc-icon-size: 32px;"></ha-icon><br>${t("message-card.no_messages")}</div>`;
      return;
    }

    // Remove old expanded states for messages no longer in list
    const currentKeys = new Set(this._lastMessages.map(msg => `${Math.floor(msg.time)}_${this._normalizeText(msg.fullText || msg.text || '')}`));
    for (const key of this._expandedMessages) {
      if (!currentKeys.has(key)) {
        this._expandedMessages.delete(key);
      }
    }

    const messagesHtml = this._lastMessages
      .map((msg) => {
        const isSent = msg.direction === "sent";
        const senderName = msg.sender;
        const timeStr = this._formatTime(msg.time);
        const messageClass = isSent ? "sent" : "";
        const messageHtml = this._linkify(msg.text);
        
        const rawText = msg.fullText || msg.text || '';
        const normalizedText = this._normalizeText(rawText);
        let rxData = null;
        let matchedKey = null;
        const msgTimestamp = Math.floor(msg.time);
        
        for (let offset = 0; offset <= 5; offset++) {
          const ts = msgTimestamp - offset;
          const key = `${ts}_${normalizedText}`;
          if (this._rxLogData.has(key)) {
            rxData = this._rxLogData.get(key);
            matchedKey = key;
            break;
          }
        }
        
        let metricsHtml = "";
        let pathHtml = "";
        const isExpanded = matchedKey ? this._expandedMessages.has(matchedKey) : false;
        
        if (rxData) {
          metricsHtml = `
            <div class="message-metrics" data-key="${matchedKey}">
              <span class="metric" data-key="${matchedKey}">RSSI ${rxData.rssi} dBm</span>
              <span class="metric" data-key="${matchedKey}">SNR ${rxData.snr} dB</span>
              ${rxData.path ? `<span class="metric" data-key="${matchedKey}">Hops ${rxData.path_len || 1}</span>` : ""}
              <span class="metric-toggle" data-key="${matchedKey}">${isExpanded ? '▾' : '▸'}</span>
            </div>
          `;
          
          const formattedPath = rxData.path ? this._formatPath(rxData.path) : 'No path data';
          pathHtml = `
            <div class="message-path ${isExpanded ? 'expanded' : ''}" data-key="${matchedKey}">
              <span class="path-label">🛣️ Path:</span>
              <span class="path-value">${escapeHtml(formattedPath)}</span>
            </div>
          `;
        }
        
        return `
          <div class="message-item ${messageClass}" style="position: relative;">
            <div class="message-icon">
              <ha-icon icon="${isSent ? "mdi:arrow-up-bold" : "mdi:arrow-down-bold"}" 
                       style="color: ${isSent ? "var(--mesh-green)" : "var(--mesh-blue)"}"></ha-icon>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-sender ${isSent ? "sent" : "received"}">${escapeHtml(senderName)}</span>
                ${timeStr ? `<span class="message-time">${timeStr}</span>` : ""}
              </div>
              <div class="message-text">${messageHtml}</div>
              ${metricsHtml}
              ${pathHtml}
            </div>
          </div>
        `;
      })
      .join("");

    container.innerHTML = `<div class="messages-list">${messagesHtml}</div>`;

    this._setupLinkListeners();
    this._setupCopyListeners();
    this._setupExpandListeners();
  }

  // ---------- Expand listeners ----------
  private _setupExpandListeners(): void {
    const container = this.shadowRoot?.querySelector("#messages-container");
    if (!container) return;

    if ((container as any)._expandListener) {
      container.removeEventListener("click", (container as any)._expandListener);
    }

    const expandListener = (e: Event) => {
      const target = e.target as HTMLElement;
      
      if (target.closest(".message-link")) return;
      
      const metricsContainer = target.closest(".message-metrics") as HTMLElement;
      if (!metricsContainer) return;
      
      const key = metricsContainer.dataset["key"];
      if (!key) return;
      
      if (this._expandedMessages.has(key)) {
        this._expandedMessages.delete(key);
      } else {
        this._expandedMessages.add(key);
      }
      
      const pathDiv = container.querySelector(`.message-path[data-key="${key}"]`) as HTMLElement;
      const toggleIcon = metricsContainer.querySelector(`.metric-toggle[data-key="${key}"]`) as HTMLElement;
      
      if (pathDiv) {
        if (this._expandedMessages.has(key)) {
          pathDiv.classList.add('expanded');
          pathDiv.style.display = 'block';
        } else {
          pathDiv.classList.remove('expanded');
          pathDiv.style.display = 'none';
        }
      }
      
      if (toggleIcon) {
        toggleIcon.textContent = this._expandedMessages.has(key) ? '▾' : '▸';
      }
    };

    container.addEventListener("click", expandListener);
    (container as any)._expandListener = expandListener;
  }

  // ---------- Translations ----------
  private _getTranslations(): LocalizeFunc {
    return makeLocalize(this._hass?.language ?? this._hass?.locale?.language ?? "en");
  }

  // ---------- Main render ----------
  private _render(): void {
    if (!this._hass || !this._config) return;

    if (this._defaultChannel !== null) {
      this._messageType = "channel";
    }

    const t = this._getTranslations();
    const channels = this._getChannels();
    const contacts = this._getContacts();

    if (channels.length === 0 && contacts.length === 0) {
      this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style>
        <ha-card>
          <div class="empty-messages">
            <ha-icon icon="mdi:message-alert" style="--mdc-icon-size: 36px;"></ha-icon><br>
            ${t("message-card.no_channels")}
          </div>
          <div class="author-info">${t("message-card.author")}</div>
        </ha-card>`;
      this._initialized = true;
      return;
    }

    this.shadowRoot!.innerHTML = `<style>${STYLES}${MESSAGE_STYLES}</style>
      <ha-card>
        <div class="section-header">
          <ha-icon icon="mdi:message-text"></ha-icon>
          <span>${t("message-card.send_message")}</span>
        </div>

        <div class="radio-group">
          <label class="radio-option ${this._messageType === "channel" ? "selected" : ""}">
            <input type="radio" name="message-type" value="channel" ${this._messageType === "channel" ? "checked" : ""}>
            <ha-icon icon="mdi:pound"></ha-icon>
            <span>${t("message-card.channel")}</span>
          </label>
          <label class="radio-option ${this._messageType === "contact" ? "selected" : ""}">
            <input type="radio" name="message-type" value="contact" ${this._messageType === "contact" ? "checked" : ""}>
            <ha-icon icon="mdi:account"></ha-icon>
            <span>${t("message-card.contact")}</span>
          </label>
        </div>

        <div class="input-group">
          <div class="label" id="target-label">
            <ha-icon icon="mdi:chat"></ha-icon>
            <span>${this._messageType === "channel" ? t("message-card.select_channel") : t("message-card.select_contact")}</span>
          </div>
          <select id="target-select">
            <option value="">${t("message-card.select_prompt")}</option>
          </select>
        </div>

        <div class="input-group">
          <div class="label">
            <ha-icon icon="mdi:message"></ha-icon>
            <span>${t("message-card.message_placeholder")}</span>
          </div>
          <textarea id="message-input" rows="3" placeholder="${t("message-card.message_placeholder")}"></textarea>
        </div>

        <button id="send-btn">
          <ha-icon icon="mdi:send"></ha-icon>
          ${t("message-card.send")}
        </button>

        <div id="status" class="status"></div>

        <div class="messages-section">
          <div class="messages-header">
            <ha-icon icon="mdi:history"></ha-icon>
            <span>${t("message-card.message_history")} ${t("message-card.today")}</span>
            <ha-icon icon="mdi:refresh" class="refresh-btn" id="refresh-history"></ha-icon>
          </div>
          <div id="messages-container">
            <div class="empty-messages">
              ${t("message-card.select_channel")}...
            </div>
          </div>
        </div>
      </ha-card>`;

    const radioChannel = this.shadowRoot!.querySelector('input[value="channel"]');
    const radioContact = this.shadowRoot!.querySelector('input[value="contact"]');
    if (radioChannel) radioChannel.addEventListener("change", (e) => this._onTypeChange(e));
    if (radioContact) radioContact.addEventListener("change", (e) => this._onTypeChange(e));

    const sendBtn = this.shadowRoot!.querySelector("#send-btn");
    if (sendBtn) sendBtn.addEventListener("click", () => this._sendMessage());

    const refreshBtn = this.shadowRoot!.querySelector("#refresh-history");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this._loadMessages());

    const targetSelect = this.shadowRoot!.querySelector("#target-select");
    if (targetSelect) targetSelect.addEventListener("change", () => this._fullUpdate());

    const updateRadioStyles = () => {
      const opts = this.shadowRoot!.querySelectorAll(".radio-option");
      opts.forEach((opt) => opt.classList.remove("selected"));
      const activeLabel = this.shadowRoot!
        .querySelector(`.radio-option input[value="${this._messageType}"]`)
        ?.closest(".radio-option");
      if (activeLabel) activeLabel.classList.add("selected");
    };
    if (radioChannel) radioChannel.addEventListener("change", updateRadioStyles);
    if (radioContact) radioContact.addEventListener("change", updateRadioStyles);

    this._updateTargetListOnly();

    if (this._defaultChannel !== null) {
      const targetSelect2 = this.shadowRoot!.querySelector("#target-select") as HTMLSelectElement | null;
      if (targetSelect2) {
        const defaultVal = String(this._defaultChannel);
        const options = Array.from(targetSelect2.options);
        let found = options.some(opt => opt.value === defaultVal);
        if (!found) {
          const channelsList = this._getChannels();
          const matchedChannel = channelsList.find(ch => String(ch.name).toLowerCase() === defaultVal.toLowerCase());
          if (matchedChannel) {
            targetSelect2.value = String(matchedChannel.idx);
          }
        } else {
          targetSelect2.value = defaultVal;
        }
      }
    }

    this._fullUpdate();
    this._initialized = true;
  }

  getCardSize(): number {
    return 7;
  }
}

// ---------- Editor ----------
export class MeshcoreMessageCardEditor extends HTMLElement {
  private _config?: MeshcoreMessageCardConfig;

  setConfig(config: MeshcoreMessageCardConfig): void {
    this._config = { ...config };
  }

  set hass(_hass: HomeAssistant) {}

  connectedCallback(): void {
    while (this.lastChild) this.removeChild(this.lastChild);
    const msg = document.createElement("p");
    msg.style.cssText = "margin: 16px; color: var(--secondary-text-color); font-size: 14px;";
    msg.textContent = "The message card automatically discovers channels and contacts. No manual configuration needed.";
    this.appendChild(msg);
  }
}