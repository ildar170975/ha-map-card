import {
  LitElement,
  html,
  css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

import "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";



/*
 * Native Map
 * https://github.com/home-assistant/frontend/blob/master/src/components/map/ha-map.ts 
 * https://github.com/home-assistant/frontend/blob/master/src/panels/lovelace/cards/hui-map-card.ts
 */


class EntityConfig {
  /** @type {String} */
  id;
  /** @type {String} */
  display;
  /** @type {Int} */
  size;
  /** @type {Date} */
  historyStart;
  /** @type {Date} */
  historyEnd;
  /** @type {String} */
  historyLineColor;
  /** @type {Boolean} */
  historyShowDots;
  /** @type {Boolean} */
  historyShowLines;

  constructor(config) {
    this.id = (typeof config === 'string' || config instanceof String)? config : config.entity;
    this.display = config.display ? config.display : "marker";
    this.size = config.size ? config.size : 24;
    this.historyStart = config.history_start ? this._convertToAbsoluteDate(config.history_start) : null;
    this.historyEnd = config.history_end ? this._convertToAbsoluteDate(config.history_end) : "now";
    this.historyLineColor = config.history_line_color ?? this._generateRandomColor();
    this.historyShowDots = config.history_show_dots ?? true;
    this.historyShowLines = config.history_show_lines ?? true;
  }

  get hasHistory() {
    return this.historyStart != null;
  }  

  _generateRandomColor() {
    return "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0");
  }

  _convertToAbsoluteDate(inputStr) {  
    // Check if the input string is a relative timestamp  
    var relativeTimePattern = /^\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i;  
    if (inputStr === 'now') {
      return null;
    } else if (relativeTimePattern.test(inputStr)) {  
      // Split the input string into parts  
      var parts = inputStr.split(' ');  

      // Get the number and the unit of time  
      var num = parseInt(parts[0]);  
      var unit = parts[1];  

      // Create a new Date object for the current time  
      var date = new Date();  

      // Subtract the appropriate amount of time  
      if (unit.startsWith('second')) {  
          date.setSeconds(date.getSeconds() - num);  
      } else if (unit.startsWith('minute')) {  
          date.setMinutes(date.getMinutes() - num);  
      } else if (unit.startsWith('hour')) {  
          date.setHours(date.getHours() - num);  
      } else if (unit.startsWith('day')) {  
          date.setDate(date.getDate() - num);  
      } else if (unit.startsWith('week')) {  
        date.setDate(date.getDate() - num * 7);  
      } else if (unit.startsWith('month')) {  
          date.setMonth(date.getMonth() - num);  
      } else if (unit.startsWith('year')) {  
          date.setFullYear(date.getFullYear() - num);  
      }    
      return date;  
    } else {  
      // If the input string is not a relative timestamp, try to parse it as an absolute date  
      var date = new Date(inputStr);  
      if (isNaN(date.getTime())) {  
        // If the date could not be parsed, throw an error  
        throw new Error("Invalid input string for Date: " + inputStr);  
      } else {  
        return date;  
      }  
    }  
  }  

}

class LayerConfig {
  /** @type {String} */
  url;
  /** @type {Object} */
  options;

  constructor(url, options, attribution = null) {
    this.url = url;
    this.options = {...{attribution: attribution}, ...options};
  }

}

class TileLayerConfig extends LayerConfig {};
class WmsLayerConfig extends LayerConfig {};

class MapConfig {
  /** @type {String} */
  title;
  focusEntity;
  x;
  y;
  /** @type {Int} */
  zoom;
  /** @type {Int} */
  cardSize;
  /** @type {[EntityConfig]} */
  entities;
  /** @type {[WmsLayerConfig]} */
  wms;
  /** @type {[TileLayerConfig]} */
  tileLayers;
  /** @type {TileLayerConfig} */
  tileLayer;


  constructor(inputConfig) {
    this.title = inputConfig.title;
    this.focusEntity = inputConfig.focus_entity;
    this.x = inputConfig.x;
    this.y = inputConfig.y;
    this.zoom = this._setConfigWithDefault(inputConfig.zoom, 12);
    this.cardSize = this._setConfigWithDefault(inputConfig.card_size, 5);
    
    this.entities = (inputConfig["entities"] ? inputConfig.entities : []).map((ent) => {
      return new EntityConfig(ent);
    });
    this.wms = (this._setConfigWithDefault(inputConfig.wms, [])).map((wms) => {
      return new WmsLayerConfig(wms.url, wms.options);
    });
    this.tileLayers = (this._setConfigWithDefault(inputConfig.tile_layers, [])).map((tile) => {
      return new TileLayerConfig(tile.url, tile.options);
    });

    this.tileLayer = new TileLayerConfig(
      this._setConfigWithDefault(inputConfig.tile_layer_url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
      this._setConfigWithDefault(inputConfig.tile_layer_options, {}),
      this._setConfigWithDefault(inputConfig.tile_layer_attribution, '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>')
    );
    if(!(Number.isFinite(this.x) && Number.isFinite(this.y)) && this.focusEntity == null && this.entities.length == 0) {
      throw new Error("We need a map latitude & longitude; set at least [x, y], a focus_entity or have at least 1 entities defined.");
    }
  }

  _setConfigWithDefault(input, d = null) {
    if (!input) {
      if (d == null) {
        throw new Error("Missing key " + name);
      }
      return d;
    } else {
      return input;
    }
  }

  get hasTitle() {
    return this.title != null;
  }

  /** @returns {Int} */
  get mapHeight() {
    if (this.hasTitle) {
      return (this.cardSize * 50) + 20 - 76 - 2;
    } else {
      return (this.cardSize * 50) + 20;
    }
  }
  
  /** @returns {[EntityConfig]} */
  get entitiesWithShowPath() {
    return this.entities.filter((ent) => ent.showPath);
  }

}

class EntityHistory {

  /** @type {String} */
  entityId;
  /** @type {[TimelineEntry]} */
  entries = [];
  /** @type {String} */
  color;
  /** @type {[Polyline|CircleMarker]} */
  mapPaths = [];
  showDots = true;
  showLines = true;
  needRerender = false;

  constructor(entityId, color, showDots, showLines) {
    this.entityId = entityId;
    this.color = color;
    this.showDots = showDots;
    this.showLines = showLines;
  }

  retrieve = (entry) => {
    this.entries.push(entry);
    this.needRerender = true;
  };

  /**
   * @returns {[(Polyline|CircleMarker)]}
   */
  render() {
    if(this.needRerender == false || this.entries.length == 0) {
      return [];
    }
    this.mapPaths.forEach((marker) => marker.remove());
    this.mapPaths = [];

    for (let i = 0; i < this.entries.length - 1; i++) {
      const entry = this.entries[i];

      if(this.showDots) {
        this.mapPaths.push(
          L.circleMarker([entry.latitude, entry.longitude], 
            {
              color: this.color,
              radius: 3,
              interactive: true,
            }
          ).bindTooltip(entry.timestamp.toLocaleString(), {direction: 'top'})
        );
      }

      const nextEntry = this.entries[i + 1];
      const latlngs = [[entry.latitude, entry.longitude], [nextEntry.latitude, nextEntry.longitude]];

      if(this.showLines) {
        this.mapPaths.push(
          L.polyline(latlngs, {
            color: this.color,
            interactive: false,
          })
        );
      }
    }

    this.needRerender = false;
    return this.mapPaths;
  }



}

class Entity {
  /** @type {EntityConfig} */
  config;  
  marker;
  /** @type {[EntityHistory]} */
  histories = [];

  get id() {
    return this.config.id;
  }

  _markerCss(size) {
    return `style="height: ${size}px; width: ${size}px;"`;
  }

  _abbr(title) {
    return title
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substr(0, 3)
      .toUpperCase();
  }

  get hasHistory() {
    return this.config.hasHistory;
  }

  update(map, latitude, longitude, state) {
    this.marker.setLatLng([latitude, longitude]);
  }

  setupHistory(historyService) {
    if(this.hasHistory) {
      const entHist = new EntityHistory(this.id, this.config.historyLineColor, this.config.historyShowDots, this.config.historyShowLines);
      historyService.subscribe(entHist.entityId, this.config.historyStart, this.config.historyEnd, entHist.retrieve);      
      this.histories.push(entHist);
    }  
  }

  /** @returns {[Polyline|CircleMarker]} */
  renderHistory() {
    return this.histories.map((entHist) => entHist.render()).flat();  
  }
}

class MarkerEntity extends Entity {

  constructor(config, latitude, longitude, icon, title, picture) {
    super();
    this.config = config;
    this.marker = this._createMapMarker(latitude, longitude, icon, title, picture);
  }

  _createMapMarker(latitude, longitude, icon, title, entityPicture) {
    const marker = L.marker([latitude, longitude], {
      icon: L.divIcon({
        html: `
          <ha-entity-marker
            entity-id="${this.id}"
            entity-name="${this._abbr(title)}"
            entity-icon="${icon}"
            entity-picture="${
              entityPicture ?? ""
            }"
          ></ha-entity-marker>
        `,
        iconSize: [48, 48],
        className: "",
      }),
      title: this.id,
    });
    return marker;
  }

}

class StateEntity extends Entity {

  _currentState;
  
  constructor(config, latitude, longitude, state) {
    super();
    this.config = config;
    this.marker = this._createMapMarker(latitude, longitude, state);
  }

  _createMapMarker(latitude, longitude, state) {
    const marker = L.marker([latitude, longitude], {
      icon: L.divIcon({
        html: `
          <ha-entity-marker
            entity-id="${this.id}"
            entity-name="${state}"
          ></ha-entity-marker>
        `,
        iconSize: [48, 48],
        className: "",
      }),
      title: this.id,
    });
    return marker;
  }

  update(map, latitude, longitude, state) {    
    if(state != this._currentState) {
      this.marker.remove();
      this.marker = this._createMapMarker(latitude, longitude, state);
      this.marker.addTo(map);
    }
    this.marker.setLatLng([latitude, longitude]);    
  }
  
}

class IconEntity extends Entity {

  constructor(config, latitude, longitude, icon, title) {
    super();
    this.config = config;
    this.marker = this._createMapMarker(latitude, longitude, icon, title);
  }

  _createMapMarker(latitude, longitude, icon, title) {
    let iconHtml = "";
    if(icon) {
      iconHtml = `<div class="marker" ${this._markerCss(this.config.size)}><ha-icon icon="${icon}">icon</ha-icon></div>`
    } else {
        iconHtml = `<div class="marker" ${this._markerCss(this.config.size)}>${this._abbr(title)}</div>`
    }
    const marker = L.marker([latitude, longitude], {
      icon: L.divIcon({
        html: iconHtml,
        iconSize: [this.config.size, this.config.size],
        className: "",
      }),
      title: this.id,
    });
    return marker;
  }
}

class TimelineEntry {  
  /** @type {Date} */
  timestamp;
  /** @type {Double} */
  latitude;
  /** @type {Double} */
  longitude;

  constructor(timestamp, latitude, longitude) {  
    this.timestamp = timestamp;  
    this.latitude = latitude;  
    this.longitude = longitude;  
  }  
}

class HaHistoryService {  

  connection = {};

  constructor(hass) {  
    this.hass = hass;  
  }  

  /** 
   * @param {String} entityId
   * @param {Date} start  
   * @param {Date} end
   * @param {Function} f
   **/
  subscribe(entityId, start, end, f) {  
    let params = {  
      type: 'history/stream',  
      entity_ids: [entityId],
      significant_changes_only: true,
      start_time: start.toISOString()
    };

    if(end) {
      params.end_time = end.toISOString();
    }

    try {  
      this.connection[entityId] = this.hass.connection.subscribeMessage(
        (message) => {
          message.states[entityId].map((state) => {
            if(state.a.latitude && state.a.longitude) {
              f(new TimelineEntry(new Date(state.lu * 1000), state.a.latitude, state.a.longitude))
            }
          });
        },
        params);
      console.log("HaHistoryService: successfully subscribed to history from " + entityId);
    } catch (error) {        
      console.error(`Error retrieving history for entity ${entityId}: ${error}`);  
      console.error(error);
    }  
  }  

  unsubscribe() {
    for (const entityId in this.connection) {
      this.connection[entityId]?.then((unsub) => unsub?.());
      this.connection[entityId] = undefined;
      console.log("HaHistoryService: unsubscribed " + entityId);
    }
  }
}  

class MapCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {}
    };
  }

  firstRenderWithMap = true;
  /** @type {[Entity]} */
  entities = [];
  /** @type {L.Map} */
  map;
  resizeObserver;
  /** @type {HaHistoryService} */
  historyService;


  firstUpdated() {
    this.map = this._setupMap();
    // redraw the map every time it resizes
    this.resizeObserver = this._setupResizeObserver();
  }
  
  render() {
    if (this.map) {
      // First render is without the map
      if (this.firstRenderWithMap) {
        this.historyService = new HaHistoryService(this.hass);
        this.entities = this._firstRender(this.map, this.hass, this.config.entities);
        this.entities.forEach((ent) => {
          ent.setupHistory(this.historyService);
        });
        this.firstRenderWithMap = false;
      }
      this.entities.forEach((ent) => {
        const stateObj = this.hass.states[ent.id];
        const {
          latitude,
          longitude,
        } = stateObj.attributes;
        ent.update(this.map, latitude, longitude, this.hass.formatEntityState(stateObj));
        ent.renderHistory().forEach((marker) => {
          this.map.addLayer(marker)
        });
      });

    }

    return html`
            <link rel="stylesheet" href="/static/images/leaflet/leaflet.css">
            <ha-card header="${this.config.title}" style="height: 100%">
                <div id="map" style="min-height: ${this.config.mapHeight}px"></div>
            </ha-card>
        `;
  }

  _firstRender(map, hass, entities) {
    console.log("First Render with Map object, resetting size.")
    return entities.map((configEntity) => {
      const stateObj = hass.states[configEntity.id];
      const {
        latitude,
        longitude,
        passive,
        icon,
        radius,
        entity_picture: entityPicture,
        gps_accuracy: gpsAccuracy,
        friendly_name
      } = stateObj.attributes;
      if (!(latitude && longitude)) {
        console.warn(configEntity.id + " has no latitude & longitude");
        return;
      }
      let entity = null;
      switch(configEntity.display) {
        case "icon":
          entity = new IconEntity(configEntity, latitude, longitude, icon, friendly_name);
          break;
        case "state":
          entity = new StateEntity(configEntity, latitude, longitude, hass.formatEntityState(stateObj));
          break;
        case 'marker':
        default: 
          let resolvedPicture = entityPicture ? this.hass.hassUrl(entityPicture) : null;
          entity = new MarkerEntity(configEntity, latitude, longitude, icon, friendly_name, resolvedPicture);
          break;
      }
      entity.marker.addTo(map);
      return entity;
    }).filter((ent) => ent != null);
  }

  _setupResizeObserver() {
    if (this.resizeObserver) {
      return this.resizeObserver;
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === this.map?.getContainer()) {
          this.map?.invalidateSize();
        }
      }
    });

    resizeObserver.observe(this.map.getContainer());
    return resizeObserver;
  }

  /** @returns {L.Map} */
  _setupMap() {    
    L.Icon.Default.imagePath = "/static/images/leaflet/images/";

    const mapEl = this.shadowRoot.querySelector('#map');
    let map = L.map(mapEl).setView(this._getLatLong(), this.config.zoom);

    map.addLayer(
      L.tileLayer(this.config.tileLayer.url, this.config.tileLayer.options)
    );
    this._addWmsLayers(map);
    this._addTileLayers(map);
    return map;
  }

  _addWmsLayers(map) {
    this.config.wms.forEach((l) => {
      L.tileLayer.wms(l.url, l.options).addTo(map);
    });
  }

  _addTileLayers(map) {
    this.config.tileLayers.forEach((l) => {
      L.tileLayer(l.url, l.options).addTo(map);
    });
  }

  setConfig(inputConfig) {
    this.config = new MapConfig(inputConfig);    
  }

  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns.
  getCardSize() {
    return this.config.cardSize;
  }

  connectedCallback() {
    super.connectedCallback();
    // Reinitialize the map when the card gets reloaded but it's still in view
    if (this.shadowRoot.querySelector('#map')) {
      this.firstUpdated();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }

    this.resizeObserver?.unobserve(this);
    this.historyService?.unsubscribe();
  }

  /** @returns {[Double, Double]} */
  _getLatLong() {
    if(Number.isFinite(this.config.x) && Number.isFinite(this.config.y)) {
      return [this.config.x, this.config.y];
    } else {
      return this._getLatLongFromFocusedEntity();
    }
  }

  /** @returns {[Double, Double]} */
  _getLatLongFromFocusedEntity() {   
    const entityId = this.config.focus_entity ? this.config.focus_entity : this.config.entities[0].id;
    const entity = this.hass.states[entityId];
    
    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }
    if (!(entity.attributes.latitude || entity.attributes.longitude)) {
      throw new Error(`Entity ${entityId} has no longitude & latitude.`);
    }
    return [entity.attributes.latitude, entity.attributes.longitude];
  }

  

  static get styles() {
    return css`       
      #map {
        height: 100%;
        border-radius: var(--ha-card-border-radius,12px);
      }
      .leaflet-pane {
        z-index: 0 !important;
      }
      .leaflet-edit-resize {
        border-radius: 50%;
        cursor: nesw-resize !important;
      }
      .leaflet-control,
      .leaflet-top,
      .leaflet-bottom {
        z-index: 1 !important;
      }
      .leaflet-tooltip {
        padding: 8px;
        font-size: 90%;
        background: rgba(80, 80, 80, 0.9) !important;
        color: white !important;
        border-radius: 4px;
        box-shadow: none !important;
      }
      .marker {
        display: flex;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        font-size: var(--ha-marker-font-size, 1.5em);
        border-radius: 50%;
        border: 1px solid var(--ha-marker-color, var(--primary-color));
        color: var(--primary-text-color);
        background-color: var(--card-background-color);
      }
      .marker:not(:has(.entity-picture)) {
        text-align: center;
        font-size: 70%;
      }
    `;
  }
}

if (!customElements.get("map-card")) {
  customElements.define("map-card", MapCard);
  console.info(
    `%cnathan-gs/ha-map-card: VERSION`,
    'color: orange; font-weight: bold; background: black'
  )
}