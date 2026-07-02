import { MeshcoreHubCard, MeshcoreHubCardEditor } from "./hub-card.js";
import { MeshcoreNodeCard, MeshcoreNodeCardEditor } from "./node-card.js";
import { MeshcoreContactCard, MeshcoreContactCardEditor } from "./contact-card.js";
import { MeshcoreChannelCard, MeshcoreChannelCardEditor } from "./channel-card.js";
import { MeshcoreMessageCard, MeshcoreMessageCardEditor } from "./message-card.js";
import { MeshcoreQuickRepeaterCard,  MeshcoreQuickRepeaterCardEditor,} from "./quick-repeater-card.js";

// ── Registration ──────────────────────────────────────────────────────────────

if (!customElements.get("meshcore-card")) {
  customElements.define("meshcore-card", MeshcoreHubCard);
}
if (!customElements.get("meshcore-card-editor")) {
  customElements.define("meshcore-card-editor", MeshcoreHubCardEditor);
}
if (!customElements.get("meshcore-hub-card")) {
  customElements.define("meshcore-hub-card", MeshcoreHubCard);
}
if (!customElements.get("meshcore-hub-card-editor")) {
  customElements.define("meshcore-hub-card-editor", MeshcoreHubCardEditor);
}
if (!customElements.get("meshcore-node-card")) {
  customElements.define("meshcore-node-card", MeshcoreNodeCard);
}
if (!customElements.get("meshcore-node-card-editor")) {
  customElements.define("meshcore-node-card-editor", MeshcoreNodeCardEditor);
}
if (!customElements.get("meshcore-contact-card")) {
  customElements.define("meshcore-contact-card", MeshcoreContactCard);
}
if (!customElements.get("meshcore-contact-card-editor")) {
  customElements.define("meshcore-contact-card-editor", MeshcoreContactCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "meshcore-card")) {
  window.customCards.push({
    type: "meshcore-card",
    name: "MeshCore Card",
    description: "Displays hub statistics from the MeshCore integration",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}
// MeshCore Hub Card
if (!window.customCards.find((c) => c.type === "meshcore-hub-card")) {
  window.customCards.push({
    type: "meshcore-hub-card",
    name: "MeshCore Hub Card",
    description: "Displays hub statistics from the MeshCore integration",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}
if (!window.customCards.find((c) => c.type === "meshcore-node-card")) {
  window.customCards.push({
    type: "meshcore-node-card",
    name: "MeshCore Node Card",
    description: "Displays node statistics from the MeshCore integration",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}
if (!window.customCards.find((c) => c.type === "meshcore-contact-card")) {
  window.customCards.push({
    type: "meshcore-contact-card",
    name: "MeshCore Contact Card",
    description: "Lists all MeshCore contact nodes sorted by most recently heard",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}

if (!customElements.get("meshcore-channel-card")) {
  customElements.define("meshcore-channel-card", MeshcoreChannelCard);
}
if (!customElements.get("meshcore-channel-card-editor")) {
  customElements.define("meshcore-channel-card-editor", MeshcoreChannelCardEditor);
}
if (!window.customCards.find((c) => c.type === "meshcore-channel-card")) {
  window.customCards.push({
    type: "meshcore-channel-card",
    name: "MeshCore Channel Card",
    description: "Shows active MeshCore channels by hub",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}

if (!customElements.get("meshcore-message-card")) {
  customElements.define("meshcore-message-card", MeshcoreMessageCard);
}
if (!customElements.get("meshcore-message-card-editor")) {
  customElements.define("meshcore-message-card-editor", MeshcoreMessageCardEditor);
}
if (!window.customCards.find((c) => c.type === "meshcore-message-card")) {
  window.customCards.push({
    type: "meshcore-message-card",
    name: "MeshCore Message Card",
    description: "Send and receive MeshCore messages (channel/direct)",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}

if (!customElements.get("meshcore-quick-repeater-card")) {
  customElements.define("meshcore-quick-repeater-card", MeshcoreQuickRepeaterCard);
}
if (!customElements.get("meshcore-quick-repeater-card-editor")) {
  customElements.define("meshcore-quick-repeater-card-editor", MeshcoreQuickRepeaterCardEditor);
}
if (!window.customCards.find((c) => c.type === "meshcore-quick-repeater-card")) {
  window.customCards.push({
    type: "meshcore-quick-repeater-card",
    name: "MeshCore Quick Repeater Card",
    description: "Quickly view MeshCore repeaters",
    preview: true,
    documentationURL: "https://github.com/dida886/meshcore-card",
  });
}