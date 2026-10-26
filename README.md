# Asterisk Parking Card

A custom Lovelace card for the [Asterisk Parking Monitor](https://github.com/anazario93/ha-asterisk-parking-mon) Home Assistant integration. Display parked calls, caller ID, slot state, and parking capacity in a compact panel.

## Preview

The card includes a connection/status header, parked/available/capacity counters, and a row for each configured parking slot. Occupied slots show caller name and number when exposed by your sensors; free slots are clearly marked.

## Install

### Manual install

1. Download `asterisk-parking-card.js` from this repository.
2. Copy it to your Home Assistant `config/www` directory.
3. In Home Assistant, go to **Settings → Dashboards → Resources** and add:
   - URL: `/local/asterisk-parking-card.js`
   - Resource type: **JavaScript Module**
4. Refresh the browser.

### HACS

This repository is a standalone Lovelace resource. You can add it through HACS using Custom repositories with category Dashboard if your HACS version offers that category; otherwise use the manual install instructions above.

## Add the card

In a dashboard, add a **Manual** card and paste a configuration like this:

```yaml
type: custom:asterisk-parking-card
title: Parking Monitor
# Optional: show the online badge. It is a visual label only; it does not probe AMI.
show_header: true
# You can set these explicitly, or leave them blank to auto-discover
# entities from your Asterisk Parking Monitor integration.
entities:
  - sensor.asterisk_parking_parking_401
  - sensor.asterisk_parking_parking_402
  - sensor.asterisk_parking_parking_403
count_entity: sensor.asterisk_parking_total_parked_calls
```

**Important:** entity IDs can differ depending on how Home Assistant named your entities. Check **Developer Tools → States** and replace the example IDs with your actual IDs. If `entities` is omitted or empty, the card attempts discovery using the integration's `parking_slot` and `parking_lot` attributes.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | string | required | `custom:asterisk-parking-card` |
| `title` | string | `Parking Monitor` | Card heading |
| `entities` | list | auto-discover | Parking-slot sensor entity IDs |
| `count_entity` | string | auto-discover | Optional total parked calls sensor |
| `show_header` | boolean | `true` | Display the header and summary counters |
| `parking_lot` | string | auto-discover | Optional parking lot name filter |

## Compatibility

The card is a display-only frontend component. It doesn't connect to Asterisk or change your working integration. It reads state and attributes from Home Assistant entities, including `caller_id_name`, `caller_id_number` (or `caller_id`), `parking_slot`, and `parking_lot`.

## Troubleshooting

- If a slot is missing, check the entity ID and verify that it has a `parking_slot` attribute.
- If caller details are blank, confirm the source sensor has `caller_id_name` or `caller_id_number` / `caller_id` attributes while a call is parked.
- If your entity IDs differ from the example, update the card YAML accordingly.
- The card status is based on the sensor data Home Assistant exposes; it does not independently validate AMI connectivity.

## Development

Pure JavaScript custom element; no build step or external libraries are required. Validate the card after adding the resource by refreshing the browser and checking the dashboard.
