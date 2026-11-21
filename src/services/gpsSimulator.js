// 6.11 BIS - Continuous 24/7 GPS Tracking & Socket.IO Simulation Engine
// Meets PRD Sections 4, 7, 15, and 17: continuous movement updates, separate GPS breadcrumb logging,
// and trip distance calculation.

import { storageService } from './storage';

class GpsSimulatorEngine {
  constructor() {
    this.listeners = new Set();
    this.intervalId = null;
    this.isRunning = false;
    this.updateIntervalMs = 7000; // 7 seconds simulation tick (within 10-30s PRD recommendation)
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.tick(), this.updateIntervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, payload);
      } catch (err) {
        console.error('GPS listener error:', err);
      }
    });
  }

  tick() {
    const trucks = storageService.getTrucks();
    const trips = storageService.getTrips();
    const history = storageService.getGpsHistory();

    let hasTruckUpdates = false;

    // Simulate minor movement for trucks that are 'moving'
    const updatedTrucks = trucks.map((truck) => {
      if (truck.trackingStatus !== 'moving') return truck;

      hasTruckUpdates = true;

      // Small delta movement (simulating ~60mph = ~0.001-0.002 lat/lng per tick)
      // Drift slightly south/north/west/east depending on heading
      const rad = (truck.heading * Math.PI) / 180;
      const step = 0.0012 + (Math.random() - 0.5) * 0.0004;
      const dLat = Math.cos(rad) * step;
      const dLng = Math.sin(rad) * step;

      const newLat = parseFloat((truck.currentLat + dLat).toFixed(6));
      const newLng = parseFloat((truck.currentLng + dLng).toFixed(6));
      const newSpeed = Math.max(45, Math.min(72, Math.round(truck.speed + (Math.random() * 6 - 3))));
      const newHeading = Math.round((truck.heading + (Math.random() * 4 - 2) + 360) % 360);
      const timestamp = new Date().toISOString();

      // Find active trip for this truck if any
      const activeTrip = trips.find((t) => t.truckId === truck.id && t.status === 'active');

      // Add to GPS Location History (Continuous 24/7 record - PRD 7 & 15)
      history.unshift({
        id: `gps-${Date.now()}-${truck.id.slice(-4)}`,
        companyId: truck.companyId,
        driverId: truck.assignedDriverId || null,
        truckId: truck.id,
        tripId: activeTrip ? activeTrip.id : null,
        latitude: newLat,
        longitude: newLng,
        accuracy: parseFloat((2.0 + Math.random() * 2).toFixed(1)),
        speed: newSpeed,
        heading: newHeading,
        status: 'moving',
        gpsTimestamp: timestamp,
        receivedTimestamp: new Date().toISOString(),
      });

      // Keep history bounded to recent 300 entries in local demo
      if (history.length > 300) {
        history.length = 300;
      }

      // If there is an active trip, update trip distance and route points (PRD Section 5)
      if (activeTrip) {
        if (!activeTrip.routePoints) activeTrip.routePoints = [];
        activeTrip.routePoints.push({
          lat: newLat,
          lng: newLng,
          speed: newSpeed,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        });
        activeTrip.distance = parseFloat((activeTrip.distance + 0.12).toFixed(2));
      }

      return {
        ...truck,
        currentLat: newLat,
        currentLng: newLng,
        speed: newSpeed,
        heading: newHeading,
        lastUpdate: timestamp,
      };
    });

    if (hasTruckUpdates) {
      storageService.saveTrucks(updatedTrucks);
      storageService.saveTrips(trips);
      storageService.saveGpsHistory(history);
      this.notify('GPS_TICK', { trucks: updatedTrucks, trips, history });
    }
  }

  // Driver action: Trigger start trip
  startTrip({ companyId, driverId, truckId, startAddress, lat, lng }) {
    const trips = storageService.getTrips();
    const trucks = storageService.getTrucks();
    const drivers = storageService.getDrivers();
    const notifications = storageService.getNotifications();
    const auditLogs = storageService.getAuditLogs();

    // Verification 1: driver can only have 1 active trip
    const existingActive = trips.find((t) => t.driverId === driverId && t.status === 'active');
    if (existingActive) {
      throw new Error('Driver already has an active trip. Complete current trip first.');
    }

    const truck = trucks.find((t) => t.id === truckId);
    if (!truck) throw new Error('Assigned truck not found.');

    const driver = drivers.find((d) => d.id === driverId);

    const tripId = `TRP-611-${new Date().getFullYear()}-${String(trips.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();

    const newTrip = {
      id: tripId,
      companyId,
      driverId,
      truckId,
      startLatitude: lat || truck.currentLat,
      startLongitude: lng || truck.currentLng,
      startAddress: startAddress || truck.currentAddress || 'Current GPS Coordinate',
      startTime: now,
      endLatitude: null,
      endLongitude: null,
      endAddress: null,
      endTime: null,
      distance: 0.0,
      duration: '0m',
      status: 'active',
      routePoints: [
        {
          lat: lat || truck.currentLat,
          lng: lng || truck.currentLng,
          speed: 0,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        },
      ],
    };

    trips.unshift(newTrip);
    storageService.saveTrips(trips);

    // Update truck status to moving
    truck.trackingStatus = 'moving';
    truck.lastUpdate = now;
    storageService.saveTrucks(trucks);

    // Create Notification: Trip Started
    const notif = {
      id: `notif-${Date.now()}`,
      companyId,
      type: 'TRIP_STARTED',
      title: 'Trip Started',
      message: `Driver ${driver ? driver.name : 'Unknown'} started Trip ${tripId} on Truck #${truck.truckNumber}.`,
      timestamp: now,
      read: false,
      severity: 'info',
    };
    notifications.unshift(notif);
    storageService.saveNotifications(notifications);

    // Audit log
    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      companyId,
      actorName: driver ? `${driver.name} (Driver)` : 'Driver',
      action: 'TRIP_START',
      details: `Started trip ${tripId} at lat: ${newTrip.startLatitude}, lng: ${newTrip.startLongitude}`,
      timestamp: now,
      ipAddress: '172.56.24.11',
    });
    storageService.saveAuditLogs(auditLogs);

    this.notify('TRIP_STARTED', { trip: newTrip });
    return newTrip;
  }

  // Driver action: Trigger end trip
  endTrip({ tripId, endAddress, lat, lng }) {
    const trips = storageService.getTrips();
    const trucks = storageService.getTrucks();
    const drivers = storageService.getDrivers();
    const notifications = storageService.getNotifications();
    const auditLogs = storageService.getAuditLogs();

    const tripIndex = trips.findIndex((t) => t.id === tripId);
    if (tripIndex === -1) throw new Error('Trip not found.');

    const trip = trips[tripIndex];
    const truck = trucks.find((t) => t.id === trip.truckId);
    const driver = drivers.find((d) => d.id === trip.driverId);
    const now = new Date().toISOString();

    const endLat = lat || (truck ? truck.currentLat : trip.startLatitude);
    const endLng = lng || (truck ? truck.currentLng : trip.startLongitude);
    const endAddr = endAddress || (truck ? truck.currentAddress : 'Arrival Destination');

    // Calculate duration
    const startTimeMs = new Date(trip.startTime).getTime();
    const endTimeMs = new Date(now).getTime();
    const diffMins = Math.max(1, Math.round((endTimeMs - startTimeMs) / (1000 * 60)));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    trip.endLatitude = endLat;
    trip.endLongitude = endLng;
    trip.endAddress = endAddr;
    trip.endTime = now;
    trip.status = 'completed';
    trip.duration = durationStr;
    if (!trip.distance || trip.distance === 0) {
      trip.distance = parseFloat((Math.random() * 25 + 15).toFixed(1));
    }

    // Add final route point
    if (!trip.routePoints) trip.routePoints = [];
    trip.routePoints.push({
      lat: endLat,
      lng: endLng,
      speed: 0,
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
    });

    storageService.saveTrips(trips);

    // Note PRD 5.D: "End Trip closes only the trip, not continuous GPS tracking."
    // Truck stays tracked! We can set tracking status to stopped
    if (truck) {
      truck.trackingStatus = 'stopped';
      truck.speed = 0;
      truck.lastUpdate = now;
      storageService.saveTrucks(trucks);
    }

    // Notification: Trip Completed
    notifications.unshift({
      id: `notif-${Date.now()}`,
      companyId: trip.companyId,
      type: 'TRIP_COMPLETED',
      title: 'Trip Completed',
      message: `Trip ${trip.id} completed by ${driver ? driver.name : 'Driver'} on Truck #${truck ? truck.truckNumber : 'N/A'}. Distance: ${trip.distance} mi, Duration: ${durationStr}.`,
      timestamp: now,
      read: false,
      severity: 'success',
    });
    storageService.saveNotifications(notifications);

    // Audit Log
    auditLogs.unshift({
      id: `aud-${Date.now()}`,
      companyId: trip.companyId,
      actorName: driver ? `${driver.name} (Driver)` : 'Driver',
      action: 'TRIP_END',
      details: `Completed trip ${trip.id} with final distance ${trip.distance} miles.`,
      timestamp: now,
      ipAddress: '172.56.24.11',
    });
    storageService.saveAuditLogs(auditLogs);

    this.notify('TRIP_COMPLETED', { trip });
    return trip;
  }
}

export const gpsEngine = new GpsSimulatorEngine();
