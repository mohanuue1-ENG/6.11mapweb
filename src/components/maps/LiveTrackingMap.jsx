import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { useGps } from '../../context/GpsContext';
import { formatAge } from '../../services/freshness';
import { formatDuration, useLastStop, usePlace } from '../../services/places';
import {
  Layers,
  Search,
  Maximize2,
  Navigation,
  Gauge,
  Clock,
  Battery,
  User,
  Truck as TruckIcon,
  Filter,
  Eye,
  RotateCcw,
  Radio,
  MapPin
} from 'lucide-react';

// Flies to a point. The detail card covers the bottom of the map, so the point is lifted a little above
// the middle to stay visible: on a narrow screen the card spans the full width and covers much more.
function flyToPoint(map, latlng, zoom, duration) {
  const narrow = map.getSize().x < 640;
  if (narrow) map.once('moveend', () => map.panBy([0, Math.round(map.getSize().y * 0.06)], { animate: true, duration: 0.3 }));
  map.flyTo(latlng, zoom, { duration });
}

export default function LiveTrackingMap({ trucks: allTrucks = [], selectedTruckId = null, onSelectTruck = null, focus = null, height = '600px' }) {
  // A truck with no reported position is never placed on the map.
  const trucks = React.useMemo(
    () => allTrucks.filter((t) => Number.isFinite(t.currentLat) && Number.isFinite(t.currentLng)),
    [allTrucks],
  );
  const { isDark } = useTheme();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const tileLayerRef = useRef(null);

  const [mapType, setMapType] = useState(isDark ? 'dark' : 'street'); // 'dark', 'street', 'satellite'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'moving', 'stopped', 'offline'
  const [activeTruckId, setActiveTruckId] = useState(null);
  const activeTruck = trucks.find((t) => t.id === activeTruckId) || null;
  const setActiveTruck = (truck) => setActiveTruckId(truck ? truck.id : null);
  const { liveStatus, now } = useGps();
  const didFitRef = useRef(false);
  const stopMarkerRef = useRef(null);
  const [followId, setFollowId] = useState(null);
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);

  // Where the selected truck is, and where it last stood still.
  const place = usePlace(activeTruck?.currentLat, activeTruck?.currentLng);
  const lastStop = useLastStop(activeTruck?.id, activeTruck?.lastUpdate);
  const stopPlace = usePlace(lastStop?.latitude, lastStop?.longitude, { minMoveM: 50 });

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = trucks.length > 0 ? trucks[0].currentLat : 32.7767;
      const initialLng = trucks.length > 0 ? trucks[0].currentLng : -96.7970;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 10,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Choose tile layer based on active theme
      const tileUrl = isDark
        ? 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      
      const initialTiles = L.tileLayer(tileUrl, {
        attribution: '&copy; Map Engine',
        maxZoom: 18,
      });

      initialTiles.addTo(map);
      map.on('dragstart', () => setFollowId(null));
      tileLayerRef.current = initialTiles;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update tiles when theme changes if user hasn't explicitly set satellite
  useEffect(() => {
    if (mapType !== 'satellite') {
      switchTiles(isDark ? 'dark' : 'street');
    }
  }, [isDark]);

  // Handle Tile Switcher (Map / Satellite / Street)
  const switchTiles = (type) => {
    if (!mapInstanceRef.current) return;
    setMapType(type);

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    let newLayer;
    if (type === 'satellite') {
      newLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri World Imagery',
        maxZoom: 19,
      });
    } else if (type === 'street') {
      newLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      });
    } else {
      newLayer = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &mdash; World Dark Gray Base',
        maxZoom: 16,
      });
    }

    newLayer.addTo(mapInstanceRef.current);
    tileLayerRef.current = newLayer;
  };

  // Status colors strictly per PRD Section 8.5
  const getStatusColor = (truck) => {
    if (truck.freshness === 'stale') return '#F59E0B'; // Amber: position is a few minutes old
    if (truck.trackingStatus === 'moving') return '#22C55E';
    if (truck.trackingStatus === 'stopped') return '#EF4444';
    return '#9CA3AF'; // Gray: offline, showing the last known position
  };

  // Markers for anything but fresh data say how old the position is.
  const markerLabel = (truck) =>
    truck.freshness === 'stale' || truck.trackingStatus === 'offline'
      ? `#${truck.truckNumber} · ${formatAge(truck.lastUpdate, now)}`
      : `#${truck.truckNumber}`;

  // Filter trucks
  const filteredTrucks = trucks.filter((t) => {
    const matchesSearch =
      (t.truckNumber && t.truckNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.plateNumber && t.plateNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (t.currentAddress && t.currentAddress.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ? true : t.trackingStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Render & Update Live Markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    filteredTrucks.forEach((truck) => {
      const color = getStatusColor(truck);
      const isSelected = selectedTruckId === truck.id || activeTruck?.id === truck.id;

      const customIcon = L.divIcon({
        className: 'custom-truck-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; opacity: ${truck.trackingStatus === 'offline' ? 0.65 : 1};">
            <div style="
              background: #080B10;
              border: 2px solid ${color};
              box-shadow: 0 0 ${isSelected ? '18px' : '10px'} ${color};
              border-radius: 9999px;
              width: 38px;
              height: 38px;
              display: flex;
              align-items: center;
              justify-content: center;
              transform: ${truck.trackingStatus === 'moving' ? `rotate(${truck.heading || 0}deg)` : 'none'};
              transition: transform 0.5s ease;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="m12 2 7 19-7-4-7 4 7-19z"/>
              </svg>
            </div>
            <div style="
              margin-top: 3px;
              background: #0B0F14;
              border: 1px solid ${color}88;
              color: #FFFFFF;
              font-family: 'Inter', system-ui, sans-serif;
              font-size: 10px;
              font-weight: 700;
              padding: 1px 6px;
              border-radius: 6px;
              white-space: nowrap;
              box-shadow: 0 4px 10px rgba(0,0,0,0.8);
            ">
              ${markerLabel(truck)}
            </div>
          </div>
        `,
        iconSize: [110, 54],
        iconAnchor: [55, 27],
      });

      if (markersRef.current[truck.id]) {
        markersRef.current[truck.id].setLatLng([truck.currentLat, truck.currentLng]);
        markersRef.current[truck.id].setIcon(customIcon);
      } else {
        const marker = L.marker([truck.currentLat, truck.currentLng], { icon: customIcon });
        marker.on('click', () => {
          setActiveTruck(truck);
          if (onSelectTruck) onSelectTruck(truck);
          flyToPoint(map, marker.getLatLng(), Math.max(map.getZoom(), 14), 1);
        });
        marker.addTo(map);
        markersRef.current[truck.id] = marker;
      }
    });

    Object.keys(markersRef.current).forEach((id) => {
      if (!filteredTrucks.find((t) => t.id === id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });
  }, [filteredTrucks, selectedTruckId, activeTruckId, now]);

  // Positions arrive after the page loads: frame them the first time they do.
  useEffect(() => {
    if (didFitRef.current || !mapInstanceRef.current || trucks.length === 0) return;
    didFitRef.current = true;
    const bounds = L.latLngBounds(trucks.map((t) => [t.currentLat, t.currentLng]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
  }, [trucks]);

  // Clicking a truck in the list asks the map to go to it straight away.
  useEffect(() => {
    if (!focus || !mapInstanceRef.current) return;
    const truck = trucks.find((t) => t.id === focus.id);
    if (!truck) return;
    setActiveTruckId(truck.id);
    const map = mapInstanceRef.current;
    flyToPoint(map, [truck.currentLat, truck.currentLng], Math.max(map.getZoom(), 15), 1.2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // While following, the map keeps the truck in view as it moves.
  useEffect(() => {
    if (followId && activeTruck?.id === followId && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([activeTruck.currentLat, activeTruck.currentLng], { animate: true, duration: 0.8 });
    }
  }, [followId, activeTruck?.currentLat, activeTruck?.currentLng]);

  // A pin where the truck last stood still (when that is not where it is now).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return undefined;
    if (stopMarkerRef.current) {
      map.removeLayer(stopMarkerRef.current);
      stopMarkerRef.current = null;
    }
    if (activeTruck && lastStop && !lastStop.ongoing) {
      stopMarkerRef.current = L.circleMarker([lastStop.latitude, lastStop.longitude], {
        radius: 9,
        color: '#F59E0B',
        weight: 3,
        fillColor: '#080B10',
        fillOpacity: 1,
      })
        .bindTooltip('Last stop', { direction: 'top' })
        .addTo(map);
    }
    return () => {
      if (stopMarkerRef.current && map) {
        map.removeLayer(stopMarkerRef.current);
        stopMarkerRef.current = null;
      }
    };
  }, [activeTruck?.id, lastStop?.latitude, lastStop?.longitude, lastStop?.ongoing]);

  const showLastStop = () => {
    if (lastStop && mapInstanceRef.current) flyToPoint(mapInstanceRef.current, [lastStop.latitude, lastStop.longitude], 16, 1);
  };

  const centerOnTruck = (truck) => {
    if (!mapInstanceRef.current || !truck) return;
    setActiveTruck(truck);
    setFollowId((id) => (id === truck.id ? null : truck.id));
    flyToPoint(mapInstanceRef.current, [truck.currentLat, truck.currentLng], Math.max(mapInstanceRef.current.getZoom(), 15), 1.2);
  };

  const fitAllTrucks = () => {
    if (!mapInstanceRef.current || filteredTrucks.length === 0) return;
    const bounds = L.latLngBounds(filteredTrucks.map((t) => [t.currentLat, t.currentLng]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  return (
    <div className={`relative isolate rounded-3xl overflow-hidden border shadow-2xl transition-colors ${
      isDark ? 'border-white/10 bg-[#080B10]' : 'border-gray-200 bg-gray-100'
    }`} style={{ height }}>
      {/* Top Map Controls Overlay (isolated within map container) */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pointer-events-none">
        {/* Search & Filter Bar */}
        <div className={`flex items-center gap-1.5 pointer-events-auto backdrop-blur-md p-1.5 rounded-2xl border shadow-xl transition-colors w-full sm:w-auto justify-between sm:justify-start ${
          isDark
            ? 'bg-[#0B0F14]/90 border-white/10 text-white'
            : 'bg-white/95 border-gray-200 text-gray-900 shadow-md'
        }`}>
          <div className="relative flex-1 sm:flex-initial flex items-center min-w-0">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search truck #, plate..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`text-xs rounded-xl pl-8 pr-2.5 py-1.5 border focus:outline-none focus:border-brand-green w-full sm:w-40 transition-colors ${
                isDark
                  ? 'bg-[#111827] border-white/10 text-white placeholder-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>

          <div className={`flex items-center gap-1 border-l pl-1.5 shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
            {['all', 'moving', 'stopped', 'offline'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-1 text-[10px] sm:text-[11px] rounded-lg capitalize font-bold transition-all ${
                  statusFilter === st
                    ? st === 'stopped'
                      ? 'bg-[#EF4444] text-white shadow-sm'
                      : st === 'offline'
                      ? 'bg-gray-500 text-white shadow-sm'
                      : 'bg-[#22C55E] text-black shadow-sm'
                    : isDark
                    ? 'text-gray-400 hover:text-white hover:bg-white/10'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Layer & Center Controls */}
        <div className={`flex items-center justify-between sm:justify-start gap-1 pointer-events-auto backdrop-blur-md p-1.5 rounded-2xl border shadow-xl transition-colors shrink-0 self-start sm:self-auto ${
          isDark
            ? 'bg-[#0B0F14]/90 border-white/10 text-white'
            : 'bg-white/95 border-gray-200 text-gray-900 shadow-md'
        }`}>
          <span
            role="status"
            className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase rounded-xl ${
              liveStatus === 'live' ? 'text-[#22C55E]' : liveStatus === 'offline' ? 'text-gray-400' : 'text-[#F59E0B]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-current ${liveStatus === 'live' ? 'animate-pulse' : ''}`} />
            {liveStatus === 'live' ? 'Live' : liveStatus === 'offline' ? 'Not connected' : 'Reconnecting'}
          </span>
          <button
            onClick={() => switchTiles('street')}
            className={`px-2.5 py-1 text-xs rounded-xl font-bold transition-colors ${
              mapType === 'street'
                ? 'bg-[#22C55E] text-black'
                : isDark
                ? 'text-gray-400 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Day Map
          </button>
          <button
            onClick={() => switchTiles('satellite')}
            className={`px-2.5 py-1 text-xs rounded-xl font-bold transition-colors ${
              mapType === 'satellite'
                ? 'bg-[#22C55E] text-black'
                : isDark
                ? 'text-gray-400 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Satellite
          </button>
          <button
            onClick={() => switchTiles('dark')}
            className={`px-2.5 py-1 text-xs rounded-xl font-bold transition-colors ${
              mapType === 'dark'
                ? 'bg-[#22C55E] text-black'
                : isDark
                ? 'text-gray-400 hover:text-white hover:bg-white/10'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Night Map
          </button>

          <button
            onClick={fitAllTrucks}
            title="Fit all trucks"
            aria-label="Fit all trucks"
            className={`p-1.5 rounded-xl border ml-0.5 transition-colors ${
              isDark
                ? 'border-white/10 text-gray-400 hover:text-brand-green hover:bg-white/10'
                : 'border-gray-200 text-gray-600 hover:text-brand-green hover:bg-gray-100'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Selected Truck Detail Card Overlay */}
      {activeTruck && (
        <div className={`absolute bottom-3 left-3 right-3 sm:right-auto sm:left-4 z-10 sm:w-96 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border transition-colors ${
          isDark
            ? 'bg-[#0B0F14]/95 border-white/10 text-white'
            : 'bg-white/95 border-gray-200 text-gray-900 shadow-2xl'
        }`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-brand-green/15 border border-brand-green/30 flex items-center justify-center text-brand-green">
                <TruckIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-extrabold text-base flex items-center gap-2">
                  Truck #{activeTruck.truckNumber}
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      activeTruck.trackingStatus === 'moving'
                        ? 'bg-brand-green/20 text-brand-green border border-brand-green/40'
                        : activeTruck.trackingStatus === 'stopped'
                        ? 'bg-red-500/20 text-red-500 border border-red-500/40'
                        : isDark
                        ? 'bg-[#1F2937] text-gray-400'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    ● {activeTruck.trackingStatus}
                  </span>
                  {activeTruck.freshness === 'stale' && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-500/20 text-amber-500 border border-amber-500/40">
                      Stale
                    </span>
                  )}
                </div>
                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Plate: {activeTruck.plateNumber || '—'}</div>
              </div>
            </div>
            <button
              onClick={() => setActiveTruck(null)}
              className={`text-xs p-1 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}
            >
              ✕
            </button>
          </div>

          {compact && (
            <div className={`mt-2 text-sm font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`} title={place?.displayName}>
              📍 {place ? place.name : activeTruck.currentAddress}
            </div>
          )}
          <div className={`mt-3 grid grid-cols-2 gap-2 text-xs border-t pt-2.5 ${compact ? 'hidden' : ''} ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
            <div>
              <span className={`text-[10px] block font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>SPEED & HEADING</span>
              <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {activeTruck.speed} mph ({activeTruck.heading}°)
              </span>
            </div>
            <div>
              <span className={`text-[10px] block font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>LAST GPS UPDATE</span>
              <span className={`font-bold ${activeTruck.freshness === 'current' ? 'text-brand-green' : activeTruck.freshness === 'stale' ? 'text-amber-500' : 'text-gray-400'}`}>
                {formatAge(activeTruck.lastUpdate, now)}
              </span>
              <span className={`block text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {new Date(activeTruck.lastUpdate).toLocaleString()}
              </span>
            </div>
            <div className="col-span-2">
              <span className={`text-[10px] block font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{activeTruck.trackingStatus === 'offline' ? 'LAST KNOWN POSITION' : 'CURRENT POSITION'}</span>
              <span className={`text-sm font-bold block ${isDark ? 'text-white' : 'text-gray-900'}`}>
                📍 {place ? place.name : activeTruck.currentAddress}
              </span>
              {place && (
                <span className={`text-[10px] block ${isDark ? 'text-gray-400' : 'text-gray-500'}`} title={place.displayName}>
                  {activeTruck.currentAddress}
                </span>
              )}
            </div>

            <div className={`col-span-2 border-t pt-2 ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
              <span className={`text-[10px] block font-semibold ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {lastStop?.ongoing ? 'STOPPED HERE' : 'LAST STOP'}
              </span>
              {lastStop === undefined && <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Checking…</span>}
              {lastStop === null && <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No stop in the last 24 hours</span>}
              {lastStop && (
                <>
                  <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {lastStop.ongoing
                      ? `Since ${new Date(lastStop.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${formatDuration(lastStop.durationSeconds)}`
                      : `${new Date(lastStop.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · stopped ${formatDuration(lastStop.durationSeconds)}`}
                  </span>
                  {!lastStop.ongoing && (
                    <button type="button" onClick={showLastStop} className="text-xs text-left text-amber-500 hover:underline">
                      {stopPlace ? stopPlace.name : `${lastStop.latitude.toFixed(5)}, ${lastStop.longitude.toFixed(5)}`} · show on map
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={`mt-3 pt-2.5 border-t flex gap-2 ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
            <button
              onClick={() => centerOnTruck(activeTruck)}
              className="flex-1 py-2 bg-brand-green text-black font-extrabold text-xs rounded-xl hover:bg-brand-green-hover transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-brand-green/20"
            >
              <Navigation className="w-3.5 h-3.5" /> {followId === activeTruck.id ? 'Following (tap to stop)' : 'Follow Truck'}
            </button>
            <button
              type="button"
              onClick={() => setCompact((c) => !c)}
              aria-expanded={!compact}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${isDark ? 'border-white/10 text-gray-300 hover:text-white' : 'border-gray-200 text-gray-600 hover:text-gray-900'}`}
            >
              {compact ? 'Details' : 'Less'}
            </button>
          </div>
        </div>
      )}

      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
