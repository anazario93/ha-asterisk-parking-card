/* Asterisk Parking Card — standalone Home Assistant Lovelace resource */
(() => {
  const CARD_TAG = "asterisk-parking-card";

  class AsteriskParkingCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = {};
      this._hass = null;
      this._entities = [];
      this._countEntity = null;
    }

    setConfig(config) {
      if (!config || typeof config !== "object") {
        throw new Error("Asterisk Parking Card requires a valid configuration.");
      }
      this._config = {
        title: "Parking Monitor",
        show_header: true,
        entities: [],
        ...config,
      };
      if (this._config.entities && !Array.isArray(this._config.entities)) {
        throw new Error("The 'entities' option must be a list of entity IDs.");
      }
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._discoverEntities();
      this._render();
    }

    get hass() {
      return this._hass;
    }

    getCardSize() {
      return Math.max(3, (this._entities.length || 3) + 2);
    }

    getLayoutOptions() {
      return {
        grid_columns: 12,
        grid_min_columns: 6,
        grid_rows: 4,
        grid_min_rows: 3,
      };
    }

    _discoverEntities() {
      if (!this._hass) return;
      const states = this._hass.states || {};
      const configured = (this._config.entities || []).filter((id) => id && states[id]);
      const hasExplicitEntities = Array.isArray(this._config.entities) && this._config.entities.length > 0;
      const candidates = hasExplicitEntities ? configured : Object.keys(states).filter((id) => {
        const state = states[id];
        const attrs = state?.attributes || {};
        const hasSlot = attrs.parking_slot !== undefined;
        const plausibleName = /asterisk.*parking|parking.*(401|402|403)/i.test(id);
        const parkingFilter = !this._config.parking_lot ||
          String(attrs.parking_lot || "").toLowerCase() === String(this._config.parking_lot).toLowerCase();
        return (hasSlot || plausibleName) && parkingFilter &&
          !/total_parked_calls|parked_calls_count|available_slots/i.test(id);
      });
      this._entities = [...new Set(candidates)].sort((a, b) => {
        const aa = Number(states[a]?.attributes?.parking_slot ?? a.match(/(\d{3,})/)?.[1] ?? 0);
        const bb = Number(states[b]?.attributes?.parking_slot ?? b.match(/(\d{3,})/)?.[1] ?? 0);
        return aa - bb;
      });
      const explicitCount = this._config.count_entity;
      if (explicitCount && states[explicitCount]) {
        this._countEntity = explicitCount;
      } else {
        this._countEntity = Object.keys(states).find((id) => {
          const attrs = states[id]?.attributes || {};
          const name = String(attrs.friendly_name || "");
          return /total parked calls|parked calls count/i.test(name) ||
            /asterisk.*parking.*(total_parked_calls|parked_calls_count)|total_parked_calls/i.test(id);
        }) || null;
      }
    }

    _normalizeStatus(value) {
      const s = String(value ?? "").trim().toLowerCase();
      if (["waiting", "call waiting", "occupied", "in use", "parked"].includes(s)) return "occupied";
      if (["free", "available", "idle"].includes(s)) return "free";
      if (["unknown", "unavailable", "none", ""].includes(s)) return "unknown";
      return "unknown";
    }

    _formatPhone(value) {
      if (value === undefined || value === null || String(value).trim() === "") return "";
      return String(value);
    }

    _escape(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[char]);
    }

    _readSlots() {
      const states = this._hass?.states || {};
      return this._entities.map((entityId) => {
        const entity = states[entityId] || {};
        const attrs = entity.attributes || {};
        const state = entity.state ?? "unavailable";
        const status = this._normalizeStatus(state);
        const slot = attrs.parking_slot ?? entityId.match(/(\d{3,})/)?.[1] ?? entityId;
        const name = this._formatPhone(attrs.caller_id_name);
        const number = this._formatPhone(attrs.caller_id_number ?? attrs.caller_id);
        return { entityId, slot: String(slot), state: String(state), status, name, number };
      });
    }

    _render() {
      if (!this.shadowRoot || !this._config) return;
      if (!this._hass) {
        this.shadowRoot.innerHTML = `<style>${this._styles()}</style><ha-card><div class="loading">Loading parking data…</div></ha-card>`;
        return;
      }
      const slots = this._readSlots();
      const occupied = slots.filter((slot) => slot.status === "occupied").length;
      const free = slots.filter((slot) => slot.status === "free").length;
      const unknown = slots.filter((slot) => slot.status === "unknown").length;
      const capacity = slots.length;
      const states = this._hass.states || {};
      const countState = this._countEntity ? states[this._countEntity]?.state : null;
      const parked = countState !== null && countState !== undefined && !["unknown", "unavailable"].includes(String(countState))
        ? Number(countState)
        : occupied;
      const full = capacity > 0 && free === 0 && unknown === 0;
      const connectionLabel = unknown > 0 ? "DATA UNKNOWN" : "LIVE STATUS";
      const rows = slots.length ? slots.map((slot) => {
        const stateLabel = slot.status === "occupied" ? "Call Waiting" :
          slot.status === "free" ? "Free" : "Unavailable";
        const caller = slot.name || slot.number;
        const secondary = slot.name && slot.number ? slot.number : (slot.status === "free" ? "Ready for a call" : "");
        const icon = slot.status === "occupied" ? "phone-in-talk" :
          slot.status === "free" ? "phone" : "phone-alert";
        return `
          <div class="slot-row ${slot.status}">
            <div class="slot-icon" aria-hidden="true">${this._icon(icon)}</div>
            <div class="slot-info">
              <div class="slot-title">Slot ${this._escape(slot.slot)}</div>
              ${caller ? `<div class="caller">${this._escape(caller)}</div>` : ""}
              ${secondary ? `<div class="phone-number">${this._escape(secondary)}</div>` : ""}
              ${slot.status === "unknown" ? `<div class="phone-number">Sensor state: ${this._escape(slot.state)}</div>` : ""}
            </div>
            <div class="status-pill ${slot.status}"><span class="status-dot"></span>${stateLabel}</div>
          </div>`;
      }).join("") : `
        <div class="empty">
          <div class="empty-icon">${this._icon("phone-off")}</div>
          <strong>No parking sensors found</strong>
          <span>Set the sensor entity IDs in this card's YAML configuration.</span>
        </div>`;

      this.shadowRoot.innerHTML = `
        <style>${this._styles()}</style>
        <ha-card>
          <div class="card-shell">
            ${this._config.show_header ? `
              <div class="header">
                <div class="brand-icon">${this._icon("phone-call")}</div>
                <div class="heading">
                  <div class="title">${this._escape(this._config.title)}</div>
                  <div class="eyebrow">ASTERISK · PARKING LOT</div>
                </div>
                <div class="connection ${unknown ? "unknown" : "connected"}"><span></span>${connectionLabel}</div>
              </div>
              <div class="summary">
                <div class="metric">
                  <div class="metric-label">PARKED</div>
                  <div class="metric-value">${Number.isFinite(parked) ? parked : occupied}</div>
                  <div class="metric-sub">Active calls</div>
                </div>
                <div class="metric">
                  <div class="metric-label">AVAILABLE</div>
                  <div class="metric-value good">${free}</div>
                  <div class="metric-sub">Open slots</div>
                </div>
                <div class="metric">
                  <div class="metric-label">CAPACITY</div>
                  <div class="metric-value">${capacity ? `${occupied}/${capacity}` : "—"}</div>
                  <div class="metric-sub">${full ? "At capacity" : unknown ? "Partial data" : "Slots occupied"}</div>
                </div>
              </div>
            ` : ""}
            <div class="section-heading">
              <span>Parking slots</span>
              <span class="section-count">${slots.length} total</span>
            </div>
            <div class="slot-list">${rows}</div>
            ${unknown > 0 ? `<div class="notice">${unknown} slot${unknown === 1 ? "" : "s"} currently report unknown or unavailable data.</div>` : ""}
          </div>
        </ha-card>`;
    }

    _icon(name) {
      const paths = {
        "phone-call": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92z"/><path d="M14 2a8 8 0 0 1 8 8M14 6a4 4 0 0 1 4 4"/>',
        "phone-in-talk": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92z"/><path d="M14 2a8 8 0 0 1 8 8M14 6a4 4 0 0 1 4 4"/>',
        "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92z"/>',
        "phone-alert": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92z"/><path d="M12 2v6M12 12h.01"/>',
        "phone-off": '<path d="M10.68 13.31a16 16 0 0 0 3.99 2.59l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07M6.53 6.53a19.5 19.5 0 0 0-1.34 1.39L3 9.9M2 2l20 20"/>',
      };
      return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.phone}</svg>`;
    }

    _styles() {
      return `
        :host { display:block; color:var(--primary-text-color, #eef4f8); }
        ha-card {
          overflow:hidden;
          border:1px solid var(--ha-card-border-color, var(--divider-color, rgba(130,155,170,.18)));
          border-radius:22px;
          background:var(--ha-card-background, var(--card-background-color, #101820));
          box-shadow:var(--ha-card-box-shadow, 0 8px 26px rgba(0,0,0,.14));
        }
        .card-shell { padding:clamp(14px, 3vw, 24px); }
        .header { display:flex; align-items:center; gap:13px; margin-bottom:20px; }
        .brand-icon {
          width:48px; height:48px; flex:0 0 48px; display:grid; place-items:center;
          border-radius:15px; color:#65d6a0; background:rgba(101,214,160,.12);
        }
        svg { width:22px; height:22px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
        .heading { min-width:0; flex:1; }
        .title { font-size:clamp(18px, 3vw, 23px); font-weight:750; letter-spacing:-.025em; line-height:1.2; overflow-wrap:anywhere; }
        .eyebrow { margin-top:5px; font-size:10px; letter-spacing:.16em; font-weight:750; color:var(--secondary-text-color, #91a4b3); }
        .connection { display:flex; align-items:center; gap:6px; font-size:9px; letter-spacing:.08em; font-weight:800; white-space:nowrap; }
        .connection span { height:7px; width:7px; border-radius:50%; background:#65d6a0; }
        .connection.unknown { color:#e2ae68; }
        .connection.unknown span { background:#e2ae68; }
        .connection.connected { color:#65d6a0; }
        .summary { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:23px; }
        .metric { min-width:0; padding:15px 14px 13px; border-radius:15px; background:var(--secondary-background-color, rgba(127,151,166,.10)); }
        .metric-label { font-size:10px; letter-spacing:.12em; font-weight:800; color:var(--secondary-text-color, #9db0bf); }
        .metric-value { margin-top:6px; font-size:clamp(23px, 4vw, 33px); font-weight:750; letter-spacing:-.045em; line-height:1.1; overflow-wrap:anywhere; }
        .metric-value.good { color:var(--success-color, #65d6a0); }
        .metric-sub { margin-top:5px; font-size:11px; color:var(--secondary-text-color, #9db0bf); }
        .section-heading { display:flex; align-items:center; justify-content:space-between; margin:0 1px 10px; font-size:14px; font-weight:750; }
        .section-count { font-size:11px; font-weight:550; color:var(--secondary-text-color, #91a4b3); }
        .slot-list { display:flex; flex-direction:column; border-radius:16px; background:var(--secondary-background-color, rgba(127,151,166,.07)); padding:0 13px; }
        .slot-row { display:flex; align-items:center; gap:12px; padding:14px 0; min-width:0; }
        .slot-row + .slot-row { border-top:1px solid var(--divider-color, rgba(130,155,170,.18)); }
        .slot-icon { display:grid; place-items:center; height:42px; width:42px; flex:0 0 42px; border-radius:12px; }
        .slot-row.occupied .slot-icon { color:#f0bd69; background:rgba(240,189,105,.13); }
        .slot-row.free .slot-icon { color:var(--success-color, #65d6a0); background:rgba(101,214,160,.12); }
        .slot-row.unknown .slot-icon { color:var(--warning-color, #e2ae68); background:rgba(226,174,104,.13); }
        .slot-info { flex:1; min-width:0; }
        .slot-title { font-size:13px; font-weight:800; letter-spacing:.01em; }
        .caller { margin-top:4px; font-size:13px; font-weight:650; overflow-wrap:anywhere; }
        .phone-number { margin-top:3px; font-size:11px; color:var(--secondary-text-color, #91a4b3); overflow-wrap:anywhere; }
        .status-pill { display:flex; align-items:center; gap:6px; flex:0 0 auto; padding:7px 9px; border-radius:999px; font-size:10px; font-weight:750; white-space:nowrap; }
        .status-pill .status-dot { height:6px; width:6px; border-radius:50%; }
        .status-pill.occupied { color:#f0bd69; background:rgba(240,189,105,.12); }
        .status-pill.occupied .status-dot { background:#f0bd69; }
        .status-pill.free { color:var(--success-color, #65d6a0); background:rgba(101,214,160,.12); }
        .status-pill.free .status-dot { background:var(--success-color, #65d6a0); }
        .status-pill.unknown { color:var(--warning-color, #e2ae68); background:rgba(226,174,104,.12); }
        .status-pill.unknown .status-dot { background:var(--warning-color, #e2ae68); }
        .notice { margin-top:12px; padding:10px 12px; border-radius:10px; font-size:11px; color:var(--secondary-text-color, #a6b4be); background:var(--secondary-background-color, rgba(127,151,166,.08)); }
        .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:28px 16px; color:var(--secondary-text-color, #9db0bf); }
        .empty-icon { color:var(--secondary-text-color, #9db0bf); }
        .empty strong { color:var(--primary-text-color, #eef4f8); font-size:14px; }
        .empty span { max-width:300px; font-size:12px; line-height:1.5; }
        .loading { padding:22px; color:var(--secondary-text-color); }
        @media (max-width:430px) {
          .header { flex-wrap:wrap; }
          .connection { margin-left:auto; }
          .summary { gap:6px; }
          .metric { padding:12px 9px; }
          .metric-label { font-size:9px; }
          .metric-sub { font-size:10px; }
          .slot-list { padding:0 9px; }
          .slot-row { gap:9px; }
          .slot-icon { width:37px; height:37px; flex-basis:37px; }
          .status-pill { padding:6px 7px; font-size:9px; gap:5px; }
        }
        @media (max-width:340px) {
          .status-pill { white-space:normal; max-width:76px; text-align:center; }
          .eyebrow { font-size:9px; letter-spacing:.1em; }
        }
      `;
    }
  }

  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, AsteriskParkingCard);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === "asterisk-parking-card")) {
    window.customCards.push({
      type: "asterisk-parking-card",
      name: "Asterisk Parking Card",
      description: "Compact dashboard card for parking slots and caller ID from Asterisk Parking Monitor.",
      preview: true,
    });
  }
})();
