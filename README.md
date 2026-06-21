![MeshCore Logo](images/logo.png)

# MeshCore Card Enhanced!

Advanced Home Assistant Lovelace cards for the MeshCore mesh radio network, including full messaging support.

This project is based on the original MeshCore Card by John Pettitt and extends it with advanced messaging capabilities, improved user interaction, and enhanced Home Assistant integration.

Custom [Home Assistant](https://www.home-assistant.io/) Lovelace cards that display hub, node, contact, and channel statistics from the [MeshCore](https://meshcore.co.uk) mesh radio network integration.

[![GitHub Release](https://img.shields.io/github/release/dida886/meshcore-card.svg?style=for-the-badge)](https://github.com/dida886/meshcore-card/releases)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://hacs.xyz)
![GitHub Downloads](https://img.shields.io/github/downloads/dida886/meshcore-card/total?label=downloads&style=for-the-badge)
![GitHub Stars](https://img.shields.io/github/stars/dida886/meshcore-card?style=for-the-badge&logo=github)
[![Maintenance](https://img.shields.io/maintenance/yes/2026?style=for-the-badge)](https://github.com/dida886/meshcore-card)



[![Add Repository](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=dida886&repository=meshcore-card&category=plugin)

---

## ☕ Support Development

If you find this project useful and would like to support future development:


[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/dida886)

Your support helps fund development, testing, bug fixes, and new features.

---

## 🌟 Enhanced Edition

While the original MeshCore Card focuses on monitoring MeshCore hubs, nodes, contacts, and channels, this Enhanced Edition transforms Home Assistant into a complete MeshCore communication dashboard.

### Key Enhancements

* Full MeshCore messaging support
* Message history viewer
* URL detection and copy-to-clipboard
* Long-press message copying
* Mobile-friendly interaction model
* Improved user experience
* Additional translations
* Continuous community-driven development

---

## 📸 Screenshots

### Hub & Remote Nodes Card
![MeshCore Hub Card](images/meshcore-hub-card-logo.png)
![MeshCore Remote Nodes](images/meshcore-remote-nodes-card-logo.png)

### Message Card
![MeshCore Messages](images/message-card-screenshot.png)

### Contacts Card
![MeshCore Contacts](images/contact-card-screenshot.png)


### Channel Card
![MeshCore Channel](images/chanel-card-screenshot.png)


## 🚀 What's New in Version 1.1.0

### 💬 MeshCore Message Card

A complete messaging interface for MeshCore networks directly inside Home Assistant.

Features include:

* Send messages to channels
* Send messages to contacts
* View recent message history
* Automatic refresh after sending messages
* Dynamic channel discovery
* Dynamic contact discovery
* Human-readable timestamps
* Status indicators and notifications

### 🔗 Smart Link Detection

Messages are automatically scanned for URLs.

* Automatic HTTP/HTTPS detection
* Click links to copy URLs
* Secure rendering
* Visual copy confirmation

### 📋 Advanced Copy Actions

Designed for both mobile and desktop users.

* Long press messages to copy content
* Touch support
* Mouse support
* Clipboard fallback support
* Instant visual feedback

### 🎨 Improved User Experience

* Color-coded sent and received messages
* Responsive layout
* Mobile-friendly interface
* Manual refresh controls
* Clean Home Assistant styling

---

## Requirements

* Home Assistant 2023.x or later
* MeshCore Integration installed and configured

The cards read hub, node, contact, and channel information directly from entities created by the MeshCore integration.

---

## Installation

### HACS (Recommended)

1. Open **HACS → Frontend**

2. Select **Custom Repositories**

3. Add:

   https://github.com/dida886/meshcore-card

4. Category:

   Dashboard

5. Install **MeshCore Card Enhanced**

6. Reload your browser

---

### Manual Installation

1. Download the latest release:

   https://github.com/dida886/meshcore-card/releases

2. Copy:

   meshcore-card.js

   to:

   config/www/

3. Open:

   Settings → Dashboards → Resources

4. Add:

   /local/meshcore-card.js

   as a JavaScript Module.

5. Reload your browser.

---

# Cards

This package provides four card types.

---

## custom:meshcore-card

### Hub & Node Card

Displays all MeshCore hubs and their remote nodes automatically discovered from Home Assistant.

### Features

* Hub online/offline status
* Hardware model
* Firmware version
* Node count
* RF parameters
* MQTT broker status
* Hub location links
* Remote node discovery
* RSSI and SNR indicators
* Battery and voltage display
* Last seen timestamps
* Repeater statistics
* Optional sensor values
* Drag-and-drop node ordering
* Throttled rendering

### Configuration

```yaml
type: custom:meshcore-card

hubs:
  55733c:
    enabled: true
    battery_entity: sensor.x
    voltage_entity: sensor.x

nodes:
  MyNode:
    enabled: true
    battery_entity: sensor.x
    voltage_entity: sensor.x
    location_entity: sensor.x
    temperature_entity: sensor.x
    humidity_entity: sensor.x
    illuminance_entity: sensor.x
    pressure_entity: sensor.x

nodes_order:
  - MyNode
  - OtherNode

grid_options:
  rows: 4
```

### Shorthand

```yaml
hubs:
  55733c: true
  aabbcc: false

nodes:
  JPP: true
  YubaMonitor: false
```

---

## custom:meshcore-message-card

### Message Card

Send and receive MeshCore messages directly from Home Assistant.

### Features

* Send messages to channels
* Send messages to contacts
* View message history
* Automatic refresh after sending
* URL detection
* URL copy support
* Long-press message copy
* Mobile and desktop support
* Multi-language support
* Status notifications
* Manual refresh button
* NEW: Default channel selection

### Configuration
The Message Card automatically discovers all available channels and contacts. You can optionally set a default channel to load automatically when the card starts.

```yaml
type: custom:meshcore-message-card
```
Default Channel Configuration
Specify a default channel using the default_channel parameter. This can be either:

Numeric channel index (e.g., 0, 1, 2, ...)

Channel name (e.g., "public", "private", ...)

Examples:

```yaml
# Load channel 0 (public channel) by default
type: custom:meshcore-message-card
default_channel: 0
```

```yaml
# Load channel by name
type: custom:meshcore-message-card
default_channel: "public"
```
```yaml
# Load channel 2 by index
type: custom:meshcore-message-card
default_channel: 2
```
Note: If the specified channel does not exist in the system, the card will show the default "Select channel" prompt. The user can always manually change the channel selection from the dropdown list.

Example Dashboard Configuration
```yaml
views:
  - title: MeshCore
    cards:
      - type: custom:meshcore-message-card
        default_channel: 0
```

---

## custom:meshcore-contact-card

### Contact Card

Displays discovered MeshCore contacts with advanced filtering and contact management capabilities.

### ✨ New in v1.1.2

* **State filtering** – filter contacts by their current state:
  - `all` – show all contacts
  - `discovered` – show only discovered devices (not added to your node)
  - `fresh` – show only active contacts (seen within last 12 hours)
  - `stale` – show only inactive contacts (not seen for over 12 hours)

* **Type filtering** – filter contacts by device type:
  - `all` – show all types
  - `repeater` – show only repeaters
  - `room` – show only room servers
  - `sensor` – show only sensors
  - `client` – show only client devices

* **Quick contact management** – add or remove contacts directly from the card:
  - Green `+` button appears next to discovered contacts – click to add to your node
  - Red `-` button appears next to fresh/stale contacts – click to remove from your node
  - Instant visual feedback – button toggles immediately after clicking
  - Auto-refresh – list updates automatically after successful operation

### Features

* Sort by most recent advertisement
* Online/offline indicators with glow animation
* Contact icons and pictures
* Location links to map view
* Age filtering (max_contact_age_days)
* Grid-aware clipping for dashboard layouts
* Instant add/remove contacts with visual feedback
* State and type filtering with dropdown selectors
* Human-readable timestamps (seconds, minutes, hours, days ago)

### Configuration

```yaml
type: custom:meshcore-contact-card

# Maximum age of contacts to display (default: 7 days)
max_contact_age_days: 7

# Filter by contact state (default: all)
contact_filter: all

# Filter by device type (default: all)
node_type_filter: all

# Grid layout options
grid_options:
  rows: 4
```


---

## custom:meshcore-channel-card

### Channel Card

Displays active MeshCore message channels.

### Features

* Channel list
* Active status indicator
* Hub association
* Channel names
* Grid-aware clipping

### Configuration

```yaml
type: custom:meshcore-channel-card

grid_options:
  rows: 4
```

---

## Localization

Supported languages:

* English
* French
* Dutch
* German
* Polish

The active Home Assistant language is detected automatically.

---

## Contributing

Contributions are welcome.

If you discover a bug, have a feature request, or would like to improve translations, please open an issue or submit a pull request.

---

## License

MIT

Copyright (c) 2026 John Pettitt

Additional enhancements and Message Card functionality:

Copyright (c) 2026 Damian Mainka

---

## Authors

Original Project

John Pettitt

Enhanced Edition

Damian Mainka
