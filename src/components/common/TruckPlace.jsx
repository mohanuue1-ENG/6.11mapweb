import React from 'react';
import { usePlace } from '../../services/places';

// The street and town a truck is at ("Afgooye Road, Lower Shabelle"). Falls back to the coordinates while
// the name is being looked up, or when place names are switched off.
export default function TruckPlace({ truck, className = '', minMoveM = 300 }) {
  const place = usePlace(truck.currentLat, truck.currentLng, { minMoveM });
  if (!Number.isFinite(truck.currentLat)) return <div className={className}>No GPS yet</div>;
  return (
    <div className={className} title={place?.displayName || truck.currentAddress}>
      📍 {place ? place.name : truck.currentAddress}
    </div>
  );
}
