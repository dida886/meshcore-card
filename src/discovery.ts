import type { HomeAssistant, HubInfo, NodeInfo } from "./types.js";

// ============================================
// FUNKCJE POMOCNICZE (przeniesione z helpers.ts)
// ============================================

function longestCommonPrefix(strs: string[]): string {
  if (!strs.length) return "";
  let i = 0;
  while (i < strs[0].length && strs.every((s) => s[i] === strs[0][i])) i++;
  return strs[0].slice(0, i);
}

function longestCommonSuffix(strs: string[]): string {
  const rev = strs.map((s) => [...s].reverse().join(""));
  return [...longestCommonPrefix(rev)].reverse().join("");
}

// ============================================
// GŁÓWNE FUNKCJE DISCOVERY
// ============================================

function majoritySuffix(strs: string[]): string {
  if (strs.length <= 1) return longestCommonSuffix(strs);
  const half = Math.ceil(strs.length / 2);
  let best = "";
  for (const candidate of strs) {
    for (let len = candidate.length; len > best.length; len--) {
      const suffix = candidate.slice(-len);
      let count = 0;
      for (const s of strs) if (s.endsWith(suffix)) count++;
      if (count >= half) {
        best = suffix;
        break;
      }
    }
  }
  return best;
}

export function discoverHubs(hass: HomeAssistant): HubInfo[] {
  const hubs: Record<string, HubInfo> = {};
  const re = /^sensor\.meshcore_([a-f0-9]+)_node_count(?:_(.+))?$/;
  for (const id of Object.keys(hass.states)) {
    const m = id.match(re);
    if (m && !hubs[m[1]]) {
      hubs[m[1]] = { pubkey: m[1], name: m[2] || m[1], nodeCountEntity: id };
    }
  }
  return Object.values(hubs);
}

export function discoverNodes(hass: HomeAssistant): NodeInfo[] {
  if (!hass.entities || !hass.devices) return [];

  const hubDeviceIds = new Set<string>();
  const hubDeviceToPubkey = new Map<string, string>();
  for (const [entityId, info] of Object.entries(hass.entities)) {
    const m = entityId.match(/^sensor\.meshcore_([a-f0-9]+)_node_count/);
    if (m && info.device_id) {
      hubDeviceIds.add(info.device_id);
      hubDeviceToPubkey.set(info.device_id, m[1]);
    }
  }

  const meshcoreDeviceIds = new Set<string>();
  for (const [, info] of Object.entries(hass.entities)) {
    if (
      info.platform === "meshcore" &&
      info.device_id &&
      !hubDeviceIds.has(info.device_id)
    ) {
      meshcoreDeviceIds.add(info.device_id);
    }
  }

  const nodes: NodeInfo[] = [];
  for (const deviceId of meshcoreDeviceIds) {
    const device = hass.devices[deviceId];
    if (!device) continue;

    const hubPubkey = hubDeviceToPubkey.get(device.via_device_id ?? "") ?? null;

    const deviceEntityIds = Object.entries(hass.entities)
      .filter(([, info]) => info.device_id === deviceId)
      .map(([id]) => id);
    const ePrefix = longestCommonPrefix(deviceEntityIds);
    const eSuffix = majoritySuffix(deviceEntityIds);
    nodes.push({
      name: device.name_by_user || device.name || deviceId,
      deviceId,
      hubPubkey,
      ePrefix,
      eSuffix,
    });
  }
  return nodes;
}