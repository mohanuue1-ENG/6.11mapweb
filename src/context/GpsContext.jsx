import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { storageService } from '../services/storage';
import { gpsEngine } from '../services/gpsSimulator';
import { api } from '../services/api';
import { connectLive } from '../services/realtime';
import { withLocation } from '../services/freshness';
import { useAuth } from './AuthContext';

const isNewer = (candidate, existing) =>
  !existing || Date.parse(candidate.gpsTimestamp) > Date.parse(existing.gpsTimestamp);

const GpsContext = createContext();

// The pages were written against the prototype's shapes. Trucks and drivers
// now come from the API; live location fields stay empty until GPS ingestion
// and the real-time map are built, so nothing here invents a position.
function toTruck(t, companyId) {
  return {
    id: t.id,
    companyId,
    truckNumber: t.truckNumber,
    plateNumber: t.plateNumber || '',
    make: t.make || '',
    model: t.model || '',
    year: t.year,
    vin: t.vin || '',
    status: t.status,
    assignedDriverId: t.assignedDriver?.id || '',
    assignmentId: t.assignmentId,
    trackingStatus: 'offline',
    currentLat: null,
    currentLng: null,
    currentAddress: '',
    speed: 0,
    heading: 0,
    lastUpdate: null,
  };
}

function toDriver(d, companyId) {
  return {
    id: d.id,
    companyId,
    name: d.name,
    phone: d.phone || '',
    driverIdNumber: d.driverNumber || '',
    licenseNumber: d.licenseNumber || '',
    status: d.status,
    hasLogin: d.hasLogin,
    email: d.loginEmail || '',
    assignedTruckId: d.assignedTruck?.id || '',
    assignmentId: d.assignmentId,
    gpsStatus: 'offline',
  };
}

// Trips and notifications keep the shape the dashboard widgets expect.
function toTripRow(t) {
  return {
    id: t.id,
    status: t.status === 'ACTIVE' ? 'active' : 'completed',
    truckId: t.truck.id,
    driverId: t.driver.id,
    startAddress: `${t.start.latitude.toFixed(4)}, ${t.start.longitude.toFixed(4)}`,
    distance: t.distanceMeters == null ? null : Number((t.distanceMeters / 1609.344).toFixed(1)),
    startedAt: t.startedAt,
  };
}

const toNotificationRow = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  severity: n.severity,
  read: n.read,
  timestamp: n.createdAt,
});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Form values -> API body, sending only the fields the caller provided.
function truckBody(data) {
  const body = {};
  if (has(data, 'truckNumber')) body.truckNumber = data.truckNumber;
  if (has(data, 'plateNumber')) body.plateNumber = data.plateNumber || null;
  if (has(data, 'make')) body.make = data.make || null;
  if (has(data, 'model')) body.model = data.model || null;
  if (has(data, 'vin')) body.vin = data.vin ? data.vin.toUpperCase() : null;
  if (has(data, 'year')) body.year = data.year === '' || data.year == null ? null : Number(data.year);
  if (has(data, 'status')) body.status = data.status;
  return body;
}

function driverBody(data) {
  const body = {};
  if (has(data, 'name')) body.name = data.name;
  if (has(data, 'phone')) body.phone = data.phone || null;
  if (has(data, 'driverIdNumber')) body.driverNumber = data.driverIdNumber ? data.driverIdNumber.toUpperCase() : null;
  if (has(data, 'licenseNumber')) body.licenseNumber = data.licenseNumber ? data.licenseNumber.toUpperCase() : null;
  if (has(data, 'status')) body.status = data.status;
  return body;
}

export function GpsProvider({ children }) {
  const auth = useAuth();
  const { user, isSuperAdmin, isDriver } = auth;
  // A company that has not paid for a plan yet has no fleet data to load.
  const isCompanyAdmin = auth.isCompanyAdmin && user?.subscribed !== false;

  // Company fleet, from the API.
  const [fleetTrucks, setFleetTrucks] = useState([]);
  const [fleetDrivers, setFleetDrivers] = useState([]);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetError, setFleetError] = useState('');
  const [fleetTrips, setFleetTrips] = useState([]);
  const [fleetNotifications, setFleetNotifications] = useState([]);

  // Prototype data (browser storage) still behind the pages that have no API yet.
  const [allTrucks, setAllTrucks] = useState(() => storageService.getTrucks());
  const [allDrivers, setAllDrivers] = useState(() => storageService.getDrivers());
  const [allTrips, setAllTrips] = useState(() => storageService.getTrips());
  const [allGpsHistory, setAllGpsHistory] = useState(() => storageService.getGpsHistory());
  const [allNotifications, setAllNotifications] = useState(() => storageService.getNotifications());

  useEffect(() => {
    storageService.initDb();
    // The GPS simulator is no longer started: it produced made-up positions.
    const unsubscribe = gpsEngine.subscribe((event) => {
      if (event === 'TRIP_STARTED' || event === 'TRIP_COMPLETED') {
        setAllTrips(storageService.getTrips());
        setAllTrucks(storageService.getTrucks());
        setAllNotifications(storageService.getNotifications());
        setAllGpsHistory(storageService.getGpsHistory());
      }
    });
    return unsubscribe;
  }, []);

  const companyId = user?.companyId;

  const reloadFleet = useCallback(async () => {
    const [t, d] = await Promise.all([api('/trucks'), api('/drivers')]);
    setFleetTrucks(t.trucks.map((x) => toTruck(x, companyId)));
    setFleetDrivers(d.drivers.map((x) => toDriver(x, companyId)));
  }, [companyId]);

  useEffect(() => {
    if (!isCompanyAdmin) {
      setFleetTrucks([]);
      setFleetDrivers([]);
      setFleetError('');
      return undefined;
    }
    let cancelled = false;
    setFleetLoading(true);
    setFleetError('');
    reloadFleet()
      .catch((err) => {
        if (!cancelled) setFleetError(err.message || 'Could not load your fleet.');
      })
      .finally(() => {
        if (!cancelled) setFleetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isCompanyAdmin, reloadFleet]);

  // ---- Trips and notifications of the company admin, from the API. They also
  // refresh on every live trip event and every 30 s as a safety net.
  const reloadActivity = useCallback(async () => {
    const [t, n] = await Promise.all([api('/trips?limit=100'), api('/notifications')]);
    setFleetTrips(t.trips.map(toTripRow));
    setFleetNotifications(n.notifications.map(toNotificationRow));
  }, []);

  useEffect(() => {
    if (!isCompanyAdmin) {
      setFleetTrips([]);
      setFleetNotifications([]);
      return undefined;
    }
    const load = () => reloadActivity().catch(() => {});
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [isCompanyAdmin, companyId, reloadActivity]);

  // ---- Live locations: REST snapshot first, then Socket.IO updates (PRD section 7).
  const [locations, setLocations] = useState({}); // truckId -> latest location
  const [liveStatus, setLiveStatus] = useState('offline');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isCompanyAdmin) {
      setLocations({});
      setLiveStatus('offline');
      return undefined;
    }
    let cancelled = false;

    // Keeps whichever fix is newer, so a slow snapshot never overwrites a live event.
    const merge = (incoming) =>
      setLocations((prev) => {
        let next = prev;
        for (const loc of incoming) {
          if (isNewer(loc, next[loc.truckId])) {
            if (next === prev) next = { ...prev };
            next[loc.truckId] = loc;
          }
        }
        return next;
      });

    const loadSnapshot = () =>
      api('/gps/locations/current')
        .then((res) => {
          if (!cancelled) merge(res.locations);
        })
        .catch(() => {});

    loadSnapshot();
    const live = connectLive({
      onLocation: (loc) => merge([loc]),
      onTrip: () => reloadActivity().catch(() => {}),
      // Re-read after every (re)connect to pick up anything missed while away.
      onSubscribed: loadSnapshot,
      onStatus: (s) => {
        if (!cancelled) setLiveStatus(s);
      },
    });

    return () => {
      cancelled = true;
      live.close();
    };
  }, [isCompanyAdmin, companyId, reloadActivity]);

  // Re-evaluate current / stale / offline as time passes, even with no new data.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);

  const refreshData = useCallback(() => {
    setAllTrucks(storageService.getTrucks());
    setAllTrips(storageService.getTrips());
    setAllGpsHistory(storageService.getGpsHistory());
    setAllNotifications(storageService.getNotifications());
    if (isCompanyAdmin) reloadFleet().catch(() => {});
  }, [isCompanyAdmin, reloadFleet]);

  const trucks = React.useMemo(() => {
    if (isCompanyAdmin) return fleetTrucks.map((t) => withLocation(t, locations[t.id], now));
    if (isSuperAdmin) return allTrucks;
    if (companyId) return allTrucks.filter((t) => t.companyId === companyId);
    return [];
  }, [isCompanyAdmin, isSuperAdmin, fleetTrucks, locations, now, allTrucks, companyId]);

  const drivers = React.useMemo(() => {
    if (isCompanyAdmin) {
      // A driver's GPS state follows the truck they are assigned to.
      const gpsStatusOf = (truckId) => {
        const f = trucks.find((t) => t.id === truckId)?.freshness;
        return f === 'current' ? 'active' : f === 'stale' ? 'delayed' : 'offline';
      };
      return fleetDrivers.map((d) => ({ ...d, gpsStatus: gpsStatusOf(d.assignedTruckId) }));
    }
    if (isSuperAdmin) return allDrivers;
    if (companyId) return allDrivers.filter((d) => d.companyId === companyId);
    return [];
  }, [isCompanyAdmin, isSuperAdmin, fleetDrivers, trucks, allDrivers, companyId]);

  const trips = React.useMemo(() => {
    if (isCompanyAdmin) return fleetTrips;
    if (isSuperAdmin) return allTrips;
    if (isDriver && user.driverId) return allTrips.filter((t) => t.driverId === user.driverId);
    if (companyId) return allTrips.filter((t) => t.companyId === companyId);
    return [];
  }, [allTrips, fleetTrips, user, companyId, isSuperAdmin, isCompanyAdmin, isDriver]);

  const gpsHistory = React.useMemo(() => {
    if (isSuperAdmin) return allGpsHistory;
    if (companyId) return allGpsHistory.filter((h) => h.companyId === companyId);
    return [];
  }, [allGpsHistory, companyId, isSuperAdmin]);

  const notifications = React.useMemo(() => {
    if (isCompanyAdmin) return fleetNotifications;
    if (isSuperAdmin) return allNotifications;
    if (companyId) return allNotifications.filter((n) => n.companyId === companyId);
    return [];
  }, [allNotifications, fleetNotifications, companyId, isSuperAdmin, isCompanyAdmin]);

  const unreadCount = React.useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  // Shown as read straight away; the next reload corrects it if the server refused.
  const markNotificationRead = async (notifId) => {
    setFleetNotifications((list) => list.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
    try {
      await api(`/notifications/${notifId}/read`, { method: 'PATCH' });
    } catch {
      reloadActivity().catch(() => {});
    }
  };

  const markAllNotificationsRead = async () => {
    setFleetNotifications((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await api('/notifications/read-all', { method: 'POST' });
    } catch {
      reloadActivity().catch(() => {});
    }
  };

  const startTrip = (params) => {
    const trip = gpsEngine.startTrip(params);
    refreshData();
    return trip;
  };

  const endTrip = (params) => {
    const trip = gpsEngine.endTrip(params);
    refreshData();
    return trip;
  };

  // Makes the driver/truck pairing match what a form asked for.
  const applyAssignment = async ({ driverId, truckId, currentAssignmentId, currentlyPaired }) => {
    if (driverId && truckId) {
      if (!currentlyPaired) await api('/assignments', { method: 'POST', body: { driverId, truckId } });
    } else if (currentAssignmentId) {
      await api(`/assignments/${currentAssignmentId}`, { method: 'DELETE' });
    }
  };

  // Each mutation reloads the lists afterwards, also when a later step fails,
  // so the tables always show what the server actually holds.
  const mutate = async (work) => {
    try {
      return await work();
    } finally {
      await reloadFleet().catch(() => {});
    }
  };

  // ---- Trucks (all of these reject with an ApiError the page can show)
  const addTruck = (data) =>
    mutate(async () => {
      const { truck } = await api('/trucks', { method: 'POST', body: truckBody(data) });
      if (data.assignedDriverId) {
        await applyAssignment({ driverId: data.assignedDriverId, truckId: truck.id });
      }
      return truck;
    });

  const updateTruck = (id, updates) =>
    mutate(async () => {
      const current = fleetTrucks.find((t) => t.id === id);
      const body = truckBody(updates);
      if (Object.keys(body).length) await api(`/trucks/${id}`, { method: 'PATCH', body });
      if (has(updates, 'assignedDriverId')) {
        await applyAssignment({
          driverId: updates.assignedDriverId,
          truckId: id,
          currentAssignmentId: current?.assignmentId,
          currentlyPaired: !!updates.assignedDriverId && current?.assignedDriverId === updates.assignedDriverId,
        });
      }
    });

  const deleteTruck = (id) => mutate(() => api(`/trucks/${id}`, { method: 'DELETE' }));

  // ---- Drivers
  const loginFrom = (data) =>
    data.hasLogin && data.email && data.password ? { email: data.email, password: data.password } : undefined;

  const addDriver = (data) =>
    mutate(async () => {
      const body = driverBody(data);
      const login = loginFrom(data);
      if (login) body.login = login;
      const { driver } = await api('/drivers', { method: 'POST', body });
      if (data.assignedTruckId) {
        await applyAssignment({ driverId: driver.id, truckId: data.assignedTruckId });
      }
      return driver;
    });

  const updateDriver = (id, updates) =>
    mutate(async () => {
      const current = fleetDrivers.find((d) => d.id === id);
      const body = driverBody(updates);
      const login = !current?.hasLogin ? loginFrom(updates) : undefined;
      if (login) body.login = login;
      if (Object.keys(body).length) await api(`/drivers/${id}`, { method: 'PATCH', body });
      if (has(updates, 'assignedTruckId')) {
        await applyAssignment({
          driverId: id,
          truckId: updates.assignedTruckId,
          currentAssignmentId: current?.assignmentId,
          currentlyPaired: !!updates.assignedTruckId && current?.assignedTruckId === updates.assignedTruckId,
        });
      }
    });

  const deleteDriver = (id) => mutate(() => api(`/drivers/${id}`, { method: 'DELETE' }));

  return (
    <GpsContext.Provider
      value={{
        trucks,
        allTrucks,
        drivers,
        allDrivers,
        trips,
        gpsHistory,
        notifications,
        unreadCount,
        fleetLoading,
        fleetError,
        liveStatus,
        now,
        reloadActivity,
        markNotificationRead,
        markAllNotificationsRead,
        startTrip,
        endTrip,
        addTruck,
        updateTruck,
        deleteTruck,
        addDriver,
        updateDriver,
        deleteDriver,
        refreshData,
        isSimulating: false,
        toggleSimulation: () => {},
      }}
    >
      {children}
    </GpsContext.Provider>
  );
}

export function useGps() {
  return useContext(GpsContext);
}
