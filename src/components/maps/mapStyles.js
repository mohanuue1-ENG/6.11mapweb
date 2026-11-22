import L from 'leaflet';

// The map looks a driver or an administrator can choose. Free tile servers only.
export const MAP_STYLES = [
  { id: 'street', label: 'Day', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 },
  { id: 'light', label: 'Light', url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri', maxZoom: 16 },
  { id: 'terrain', label: 'Terrain', url: 'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri, USGS, NOAA', maxZoom: 18 },
  { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri World Imagery', maxZoom: 19 },
  { id: 'dark', label: 'Night', url: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', attribution: '&copy; Esri &mdash; World Dark Gray Base', maxZoom: 16 },
];

export const styleById = (id) => MAP_STYLES.find((s) => s.id === id) || MAP_STYLES[0];

export function tileLayerFor(id) {
  const s = styleById(id);
  return L.tileLayer(s.url, { attribution: s.attribution, maxZoom: s.maxZoom });
}
