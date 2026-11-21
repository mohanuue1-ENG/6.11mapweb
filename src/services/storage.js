// 6.11 BIS - Storage & Seed Database Service
// Strictly follows PRD Database Requirements & Data Isolation

const STORAGE_KEYS = {
  COMPANIES: '611_companies',
  USERS: '611_users',
  TRUCKS: '611_trucks',
  DRIVERS: '611_drivers',
  TRIPS: '611_trips',
  GPS_HISTORY: '611_gps_location_history',
  CURRENT_LOCATIONS: '611_current_locations',
  NOTIFICATIONS: '611_notifications',
  PLANS: '611_subscription_plans',
  PAYMENTS: '611_payments',
  AUDIT_LOGS: '611_audit_logs',
  SETTINGS: '611_platform_settings',
  THEME: '611_theme_preference',
  AUTH: '611_auth_session',
};

// Initial Seed Data
const initialPlans = [
  {
    id: 'plan-internal',
    name: 'NEB Internal Fleet',
    price: 0,
    interval: 'monthly',
    truckLimit: 9999,
    description: 'Internal zero-fee platform access for NEB Trucking.',
    features: ['Unlimited Trucks & Drivers', 'Continuous 24/7 Live GPS', 'Route Replay & History', 'Priority Platform Support', 'Audit Logs & Reporting'],
    isInternalOnly: true,
  },
  {
    id: 'plan-starter',
    name: 'Starter Fleet',
    price: 49,
    interval: 'monthly',
    truckLimit: 5,
    description: 'Perfect for small trucking operations starting with GPS telematics.',
    features: ['Up to 5 Trucks', 'Continuous Live GPS Tracking', 'Start/End Trip Recording', '30-Day Location History', 'Email & In-App Alerts', 'Standard Support'],
    isInternalOnly: false,
  },
  {
    id: 'plan-pro',
    name: 'Fleet Pro',
    price: 149,
    interval: 'monthly',
    truckLimit: 20,
    popular: true,
    description: 'Engineered for growing regional carriers and multi-driver fleets.',
    features: ['Up to 20 Trucks', 'High-frequency GPS (10-30s)', 'Unlimited Trip History & Replay', 'Separate GPS Location Breadcrumbs', 'Instant SMS/Push Alert Triggers', 'Advanced Fleet Analytics', 'Driver Mobile Portal Access'],
    isInternalOnly: false,
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise Carrier',
    price: 399,
    interval: 'monthly',
    truckLimit: 100,
    description: 'For large freight operations requiring massive scale and security.',
    features: ['Unlimited Fleet Capacity', 'Continuous 24/7 Redundant GPS', 'Full Audit Trail & Security Logs', 'Multi-Admin Access', 'Custom Retention Policy', 'Dedicated 24/7 Tech Support', 'REST API & Webhook Integrations'],
    isInternalOnly: false,
  },
];

const initialCompanies = [
  {
    id: 'comp-neb',
    name: 'NEB Trucking',
    dotNumber: 'US-DOT-892341',
    mcNumber: 'MC-774102',
    email: 'admin@nebtrucking.com',
    phone: '+1 (555) 234-5678',
    address: '4420 Transportation Way, Dallas, TX 75201',
    isInternal: true,
    subscriptionPlanId: 'plan-internal',
    subscriptionFee: 0,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2099-12-31T23:59:59Z',
    status: 'active',
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'comp-apex',
    name: 'Apex Freight Logistics',
    dotNumber: 'US-DOT-441290',
    mcNumber: 'MC-992144',
    email: 'admin@apexfreight.com',
    phone: '+1 (555) 890-1234',
    address: '1200 Logistics Blvd, Chicago, IL 60607',
    isInternal: false,
    subscriptionPlanId: 'plan-pro',
    subscriptionFee: 149,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2026-12-15T00:00:00Z',
    status: 'active',
    createdAt: '2026-02-01T14:30:00Z',
  },
  {
    id: 'comp-horizon',
    name: 'Horizon Haulers LLC',
    dotNumber: 'US-DOT-671239',
    mcNumber: 'MC-318920',
    email: 'ops@horizonhaulers.com',
    phone: '+1 (555) 678-9012',
    address: '850 Interstate Dr, Atlanta, GA 30303',
    isInternal: false,
    subscriptionPlanId: 'plan-starter',
    subscriptionFee: 49,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: '2026-11-30T00:00:00Z',
    status: 'active',
    createdAt: '2026-03-05T09:15:00Z',
  },
];

const initialUsers = [
  {
    id: 'usr-super',
    name: '6.11 Super Admin',
    email: 'superadmin@611gps.com',
    phone: '+1 (800) 611-4771',
    password: 'password123',
    role: 'SUPER_ADMIN',
    companyId: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'usr-neb-admin',
    name: 'Mohamed Warsame',
    email: 'admin@nebtrucking.com',
    phone: '+1 (555) 234-5678',
    password: 'password123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-neb',
    status: 'active',
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'usr-apex-admin',
    name: 'David Vance',
    email: 'admin@apexfreight.com',
    phone: '+1 (555) 890-1234',
    password: 'password123',
    role: 'COMPANY_ADMIN',
    companyId: 'comp-apex',
    status: 'active',
    createdAt: '2026-02-01T14:30:00Z',
  },
  // Drivers with accounts
  {
    id: 'usr-drv-neb-1',
    name: 'Ahmed Hassan',
    email: 'ahmed@nebtrucking.com',
    phone: '+1 (555) 301-4421',
    password: 'password123',
    role: 'DRIVER',
    companyId: 'comp-neb',
    driverId: 'drv-neb-1',
    status: 'active',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'usr-drv-neb-2',
    name: 'Farah Nur',
    email: 'farah@nebtrucking.com',
    phone: '+1 (555) 301-8842',
    password: 'password123',
    role: 'DRIVER',
    companyId: 'comp-neb',
    driverId: 'drv-neb-2',
    status: 'active',
    createdAt: '2026-01-15T08:30:00Z',
  },
];

const initialDrivers = [
  {
    id: 'drv-neb-1',
    companyId: 'comp-neb',
    name: 'Ahmed Hassan',
    phone: '+1 (555) 301-4421',
    driverIdNumber: 'NEB-D101',
    licenseNumber: 'TX-DL-8902194',
    assignedTruckId: 'trk-neb-101',
    hasLogin: true,
    gpsStatus: 'active', // active | delayed | offline
    status: 'active',
    lastActiveAt: new Date().toISOString(),
  },
  {
    id: 'drv-neb-2',
    companyId: 'comp-neb',
    name: 'Farah Nur',
    phone: '+1 (555) 301-8842',
    driverIdNumber: 'NEB-D102',
    licenseNumber: 'TX-DL-4419208',
    assignedTruckId: 'trk-neb-102',
    hasLogin: true,
    gpsStatus: 'active',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'drv-neb-3',
    companyId: 'comp-neb',
    name: 'Omar Jama',
    phone: '+1 (555) 301-9953',
    driverIdNumber: 'NEB-D103',
    licenseNumber: 'TX-DL-7729104',
    assignedTruckId: 'trk-neb-103',
    hasLogin: false,
    gpsStatus: 'active',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'drv-neb-4',
    companyId: 'comp-neb',
    name: 'Khadar Ali',
    phone: '+1 (555) 301-1124',
    driverIdNumber: 'NEB-D104',
    licenseNumber: 'TX-DL-1192847',
    assignedTruckId: null,
    hasLogin: false,
    gpsStatus: 'offline',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  // Apex Freight Drivers
  {
    id: 'drv-apx-1',
    companyId: 'comp-apex',
    name: 'John Miller',
    phone: '+1 (555) 777-3311',
    driverIdNumber: 'APX-D201',
    licenseNumber: 'IL-DL-993817',
    assignedTruckId: 'trk-apx-201',
    hasLogin: true,
    gpsStatus: 'active',
    status: 'active',
    lastActiveAt: new Date().toISOString(),
  },
  {
    id: 'drv-apx-2',
    companyId: 'comp-apex',
    name: 'Sarah Davis',
    phone: '+1 (555) 777-4422',
    driverIdNumber: 'APX-D202',
    licenseNumber: 'IL-DL-662518',
    assignedTruckId: 'trk-apx-202',
    hasLogin: true,
    gpsStatus: 'delayed',
    status: 'active',
    lastActiveAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  },
];

const initialTrucks = [
  {
    id: 'trk-neb-101',
    companyId: 'comp-neb',
    truckNumber: '101',
    plateNumber: 'TX-992-AKR',
    truckType: 'Reefer (Refrigerated)',
    make: 'Freightliner',
    model: 'Cascadia 126',
    year: 2024,
    vin: '1FUJGLDR5PL681021',
    assignedDriverId: 'drv-neb-1',
    status: 'active',
    trackingStatus: 'moving', // moving | stopped | offline
    currentLat: 32.7767,
    currentLng: -96.7970,
    currentAddress: 'I-35E Southbound, Dallas, TX',
    speed: 63,
    heading: 185,
    battery: 98,
    lastUpdate: new Date().toISOString(),
  },
  {
    id: 'trk-neb-102',
    companyId: 'comp-neb',
    truckNumber: '102',
    plateNumber: 'TX-448-BFT',
    truckType: 'Dry Van 53ft',
    make: 'Peterbilt',
    model: '579 Ultraloft',
    year: 2023,
    vin: '1XP5DB9X6ND771092',
    assignedDriverId: 'drv-neb-2',
    status: 'active',
    trackingStatus: 'stopped',
    currentLat: 32.8998,
    currentLng: -97.0403,
    currentAddress: 'DFW Logistics Park, Grapevine, TX',
    speed: 0,
    heading: 45,
    battery: 100,
    lastUpdate: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    id: 'trk-neb-103',
    companyId: 'comp-neb',
    truckNumber: '103',
    plateNumber: 'TX-310-CKL',
    truckType: 'Flatbed',
    make: 'Kenworth',
    model: 'T680 Next Gen',
    year: 2024,
    vin: '1XKYDP9X1RP552019',
    assignedDriverId: 'drv-neb-3',
    status: 'active',
    trackingStatus: 'moving',
    currentLat: 33.2148,
    currentLng: -97.1331,
    currentAddress: 'US-380 West, Denton, TX',
    speed: 57,
    heading: 270,
    battery: 91,
    lastUpdate: new Date().toISOString(),
  },
  {
    id: 'trk-neb-104',
    companyId: 'comp-neb',
    truckNumber: '104',
    plateNumber: 'TX-771-MPQ',
    truckType: 'Dry Van 53ft',
    make: 'Volvo',
    model: 'VNL 860',
    year: 2022,
    vin: '4V4NC9EH8NN239011',
    assignedDriverId: null,
    status: 'active',
    trackingStatus: 'offline',
    currentLat: 32.7431,
    currentLng: -96.8123,
    currentAddress: 'NEB Terminal Yard, Oak Cliff, Dallas, TX',
    speed: 0,
    heading: 0,
    battery: 42,
    lastUpdate: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
  },
  // Apex Freight Trucks
  {
    id: 'trk-apx-201',
    companyId: 'comp-apex',
    truckNumber: '201',
    plateNumber: 'IL-551-ZZP',
    truckType: 'Dry Van 53ft',
    make: 'Mack',
    model: 'Anthem 70',
    year: 2023,
    vin: '1M2AX19C9NM119283',
    assignedDriverId: 'drv-apx-1',
    status: 'active',
    trackingStatus: 'moving',
    currentLat: 41.8781,
    currentLng: -87.6298,
    currentAddress: 'I-90 East, Chicago, IL',
    speed: 54,
    heading: 95,
    battery: 94,
    lastUpdate: new Date().toISOString(),
  },
  {
    id: 'trk-apx-202',
    companyId: 'comp-apex',
    truckNumber: '202',
    plateNumber: 'IL-882-QQW',
    truckType: 'Reefer (Refrigerated)',
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2023,
    vin: '1FUJGLDR2PL339011',
    assignedDriverId: 'drv-apx-2',
    status: 'active',
    trackingStatus: 'stopped',
    currentLat: 41.7500,
    currentLng: -87.7000,
    currentAddress: 'Distribution Depot, Bedford Park, IL',
    speed: 0,
    heading: 180,
    battery: 89,
    lastUpdate: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
];

// Seed Trips: Active and Completed
const initialTrips = [
  {
    id: 'TRP-611-2026-001',
    companyId: 'comp-neb',
    driverId: 'drv-neb-1',
    truckId: 'trk-neb-101',
    startLatitude: 32.7767,
    startLongitude: -96.7970,
    startAddress: 'Dallas Distribution Hub, Dallas, TX',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    endLatitude: null,
    endLongitude: null,
    endAddress: null,
    endTime: null,
    distance: 86.4, // miles
    duration: '1h 58m',
    status: 'active',
    routePoints: [
      { lat: 32.7767, lng: -96.7970, speed: 0, time: '18:30:00' },
      { lat: 32.7850, lng: -96.8000, speed: 28, time: '18:35:00' },
      { lat: 32.8100, lng: -96.8150, speed: 52, time: '18:42:00' },
      { lat: 32.8600, lng: -96.8400, speed: 64, time: '18:55:00' },
      { lat: 32.9500, lng: -96.8800, speed: 65, time: '19:15:00' },
      { lat: 33.0200, lng: -96.9300, speed: 62, time: '19:35:00' },
      { lat: 33.1100, lng: -97.0200, speed: 66, time: '20:00:00' },
      { lat: 33.1900, lng: -97.0900, speed: 63, time: '20:25:00' },
    ],
  },
  {
    id: 'TRP-611-2026-002',
    companyId: 'comp-neb',
    driverId: 'drv-neb-2',
    truckId: 'trk-neb-102',
    startLatitude: 32.7555,
    startLongitude: -97.3308,
    startAddress: 'Fort Worth Intermodal Rail, Fort Worth, TX',
    startTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    endLatitude: 32.8998,
    endLongitude: -97.0403,
    endAddress: 'DFW Logistics Park, Grapevine, TX',
    endTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    distance: 38.2,
    duration: '1h 14m',
    status: 'completed',
    routePoints: [
      { lat: 32.7555, lng: -97.3308, speed: 0, time: '12:00:00' },
      { lat: 32.7800, lng: -97.2800, speed: 45, time: '12:15:00' },
      { lat: 32.8200, lng: -97.2000, speed: 58, time: '12:35:00' },
      { lat: 32.8600, lng: -97.1200, speed: 60, time: '12:55:00' },
      { lat: 32.8998, lng: -97.0403, speed: 0, time: '13:14:00' },
    ],
  },
  {
    id: 'TRP-611-2026-003',
    companyId: 'comp-neb',
    driverId: 'drv-neb-3',
    truckId: 'trk-neb-103',
    startLatitude: 32.4487,
    startLongitude: -96.7970,
    startAddress: 'Ellis County Industrial Park, Waxahachie, TX',
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    endLatitude: 33.2148,
    endLongitude: -97.1331,
    endAddress: 'US-380 West, Denton, TX',
    endTime: new Date(Date.now() - 21 * 60 * 60 * 1000).toISOString(),
    distance: 74.8,
    duration: '2h 22m',
    status: 'completed',
    routePoints: [
      { lat: 32.4487, lng: -96.7970, speed: 0, time: '19:00:00' },
      { lat: 32.6000, lng: -96.8200, speed: 55, time: '19:30:00' },
      { lat: 32.8000, lng: -96.8500, speed: 62, time: '20:10:00' },
      { lat: 33.0500, lng: -97.0000, speed: 65, time: '20:45:00' },
      { lat: 33.2148, lng: -97.1331, speed: 0, time: '21:22:00' },
    ],
  },
  // Apex Freight Trip
  {
    id: 'TRP-611-2026-004',
    companyId: 'comp-apex',
    driverId: 'drv-apx-1',
    truckId: 'trk-apx-201',
    startLatitude: 41.5250,
    startLongitude: -88.0817,
    startAddress: 'Joliet Gateway Terminal, Joliet, IL',
    startTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    endLatitude: null,
    endLongitude: null,
    endAddress: null,
    endTime: null,
    distance: 42.1,
    duration: '1h 05m',
    status: 'active',
    routePoints: [
      { lat: 41.5250, lng: -88.0817, speed: 0, time: '17:20:00' },
      { lat: 41.6500, lng: -87.9500, speed: 58, time: '17:45:00' },
      { lat: 41.7800, lng: -87.7500, speed: 62, time: '18:05:00' },
      { lat: 41.8781, lng: -87.6298, speed: 54, time: '18:25:00' },
    ],
  },
];

// GPS Location History (Continuous 24/7 background breadcrumbs - PRD requirement 7 & 15)
const initialGpsHistory = [
  {
    id: 'gps-hist-01',
    companyId: 'comp-neb',
    driverId: 'drv-neb-1',
    truckId: 'trk-neb-101',
    tripId: 'TRP-611-2026-001',
    latitude: 33.1900,
    longitude: -97.0900,
    accuracy: 3.2,
    speed: 63,
    heading: 185,
    status: 'moving',
    gpsTimestamp: new Date().toISOString(),
    receivedTimestamp: new Date().toISOString(),
  },
  {
    id: 'gps-hist-02',
    companyId: 'comp-neb',
    driverId: 'drv-neb-1',
    truckId: 'trk-neb-101',
    tripId: 'TRP-611-2026-001',
    latitude: 33.1500,
    longitude: -97.0600,
    accuracy: 2.8,
    speed: 64,
    heading: 185,
    status: 'moving',
    gpsTimestamp: new Date(Date.now() - 30 * 1000).toISOString(),
    receivedTimestamp: new Date(Date.now() - 29 * 1000).toISOString(),
  },
  {
    id: 'gps-hist-03',
    companyId: 'comp-neb',
    driverId: 'drv-neb-2',
    truckId: 'trk-neb-102',
    tripId: null, // continuous tracking when stopped / no active trip!
    latitude: 32.8998,
    longitude: -97.0403,
    accuracy: 1.9,
    speed: 0,
    heading: 45,
    status: 'stopped',
    gpsTimestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    receivedTimestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    id: 'gps-hist-04',
    companyId: 'comp-neb',
    driverId: 'drv-neb-3',
    truckId: 'trk-neb-103',
    tripId: null,
    latitude: 33.2148,
    longitude: -97.1331,
    accuracy: 4.1,
    speed: 57,
    heading: 270,
    status: 'moving',
    gpsTimestamp: new Date().toISOString(),
    receivedTimestamp: new Date().toISOString(),
  },
  {
    id: 'gps-hist-05',
    companyId: 'comp-neb',
    driverId: null,
    truckId: 'trk-neb-104',
    tripId: null,
    latitude: 32.7431,
    longitude: -96.8123,
    accuracy: 5.0,
    speed: 0,
    heading: 0,
    status: 'stopped',
    gpsTimestamp: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    receivedTimestamp: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
  },
];

// Notifications (PRD Section 10 - The 7 exact notification categories)
const initialNotifications = [
  {
    id: 'notif-01',
    companyId: 'comp-neb',
    type: 'TRIP_STARTED',
    title: 'Trip Started',
    message: 'Driver Ahmed Hassan started Trip TRP-611-2026-001 on Truck 101 from Dallas Distribution Hub.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
    severity: 'info',
  },
  {
    id: 'notif-02',
    companyId: 'comp-neb',
    type: 'TRIP_COMPLETED',
    title: 'Trip Completed',
    message: 'Driver Farah Nur completed Trip TRP-611-2026-002 on Truck 102 (38.2 miles in 1h 14m).',
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    read: true,
    severity: 'success',
  },
  {
    id: 'notif-03',
    companyId: 'comp-neb',
    type: 'TRUCK_OFFLINE',
    title: 'Truck Offline Alert',
    message: 'Truck #104 has not reported GPS updates for over 24 hours.',
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
    read: false,
    severity: 'warning',
  },
  {
    id: 'notif-04',
    companyId: 'comp-neb',
    type: 'GPS_UPDATE_DELAYED',
    title: 'GPS Update Delayed',
    message: 'GPS updates for Truck #102 are delayed (> 5 mins since last satellite handshake).',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false,
    severity: 'warning',
  },
  {
    id: 'notif-05',
    companyId: 'comp-neb',
    type: 'DRIVER_LOGIN',
    title: 'Driver Login Detected',
    message: 'Driver Ahmed Hassan authenticated via mobile device (Android 14).',
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    read: true,
    severity: 'info',
  },
  {
    id: 'notif-06',
    companyId: 'comp-apex',
    type: 'SUBSCRIPTION_EXPIRY',
    title: 'Subscription Expiry Notice',
    message: 'Monthly subscription for Fleet Pro will renew on Dec 15, 2026.',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: false,
    severity: 'info',
  },
];

// Audit & Security Logs (PRD Section 11 & 16)
const initialAuditLogs = [
  {
    id: 'aud-01',
    companyId: 'comp-neb',
    actorName: 'Mohamed Warsame (Company Admin)',
    action: 'TRUCK_ASSIGNMENT',
    details: 'Assigned Driver Ahmed Hassan to Truck #101',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    ipAddress: '198.51.100.22',
  },
  {
    id: 'aud-02',
    companyId: 'comp-neb',
    actorName: 'Ahmed Hassan (Driver)',
    action: 'TRIP_START',
    details: 'Initiated active trip TRP-611-2026-001 (Lat: 32.7767, Lng: -96.7970)',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ipAddress: '172.56.21.90',
  },
  {
    id: 'aud-03',
    companyId: null,
    actorName: '6.11 Super Admin',
    action: 'COMPANY_APPROVED',
    details: 'Approved registration for Apex Freight Logistics under Fleet Pro Plan',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    ipAddress: '64.233.160.1',
  },
  {
    id: 'aud-04',
    companyId: null,
    actorName: '6.11 Super Admin',
    action: 'INTERNAL_COMPANY_SETUP',
    details: 'Set NEB Trucking to $0 Internal Subscription plan (No fee)',
    timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    ipAddress: '64.233.160.1',
  },
];

// Payments History
const initialPayments = [
  {
    id: 'pay-001',
    companyId: 'comp-neb',
    companyName: 'NEB Trucking',
    amount: 0,
    currency: 'USD',
    planName: 'NEB Internal Fleet',
    status: 'paid',
    date: '2026-11-01T00:00:00Z',
    invoiceNumber: 'INV-NEB-2026-11',
    notes: 'Internal $0 Company Plan Waiver',
  },
  {
    id: 'pay-002',
    companyId: 'comp-apex',
    companyName: 'Apex Freight Logistics',
    amount: 149,
    currency: 'USD',
    planName: 'Fleet Pro',
    status: 'paid',
    date: '2026-11-15T10:00:00Z',
    invoiceNumber: 'INV-APX-2026-11',
    notes: 'Monthly Recurring Plan - 20 Trucks',
  },
  {
    id: 'pay-003',
    companyId: 'comp-horizon',
    companyName: 'Horizon Haulers LLC',
    amount: 49,
    currency: 'USD',
    planName: 'Starter Fleet',
    status: 'paid',
    date: '2026-11-05T09:30:00Z',
    invoiceNumber: 'INV-HRZ-2026-11',
    notes: 'Monthly Recurring Plan - 5 Trucks',
  },
];

// Helper functions for safe local storage
export const storageService = {
  get(key, defaultValue) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      console.error(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error writing ${key} to localStorage:`, e);
    }
  },

  // Initialize DB if empty
  initDb() {
    if (!localStorage.getItem(STORAGE_KEYS.COMPANIES)) {
      this.set(STORAGE_KEYS.COMPANIES, initialCompanies);
    }
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.set(STORAGE_KEYS.USERS, initialUsers);
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRUCKS)) {
      this.set(STORAGE_KEYS.TRUCKS, initialTrucks);
    }
    if (!localStorage.getItem(STORAGE_KEYS.DRIVERS)) {
      this.set(STORAGE_KEYS.DRIVERS, initialDrivers);
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRIPS)) {
      this.set(STORAGE_KEYS.TRIPS, initialTrips);
    }
    if (!localStorage.getItem(STORAGE_KEYS.GPS_HISTORY)) {
      this.set(STORAGE_KEYS.GPS_HISTORY, initialGpsHistory);
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      this.set(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PLANS)) {
      this.set(STORAGE_KEYS.PLANS, initialPlans);
    }
    if (!localStorage.getItem(STORAGE_KEYS.PAYMENTS)) {
      this.set(STORAGE_KEYS.PAYMENTS, initialPayments);
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      this.set(STORAGE_KEYS.AUDIT_LOGS, initialAuditLogs);
    }
  },

  // Database accessors
  getCompanies: () => storageService.get(STORAGE_KEYS.COMPANIES, initialCompanies),
  saveCompanies: (data) => storageService.set(STORAGE_KEYS.COMPANIES, data),

  getUsers: () => storageService.get(STORAGE_KEYS.USERS, initialUsers),
  saveUsers: (data) => storageService.set(STORAGE_KEYS.USERS, data),

  getTrucks: () => storageService.get(STORAGE_KEYS.TRUCKS, initialTrucks),
  saveTrucks: (data) => storageService.set(STORAGE_KEYS.TRUCKS, data),

  getDrivers: () => storageService.get(STORAGE_KEYS.DRIVERS, initialDrivers),
  saveDrivers: (data) => storageService.set(STORAGE_KEYS.DRIVERS, data),

  getTrips: () => storageService.get(STORAGE_KEYS.TRIPS, initialTrips),
  saveTrips: (data) => storageService.set(STORAGE_KEYS.TRIPS, data),

  getGpsHistory: () => storageService.get(STORAGE_KEYS.GPS_HISTORY, initialGpsHistory),
  saveGpsHistory: (data) => storageService.set(STORAGE_KEYS.GPS_HISTORY, data),

  getNotifications: () => storageService.get(STORAGE_KEYS.NOTIFICATIONS, initialNotifications),
  saveNotifications: (data) => storageService.set(STORAGE_KEYS.NOTIFICATIONS, data),

  getPlans: () => storageService.get(STORAGE_KEYS.PLANS, initialPlans),
  savePlans: (data) => storageService.set(STORAGE_KEYS.PLANS, data),

  getPayments: () => storageService.get(STORAGE_KEYS.PAYMENTS, initialPayments),
  savePayments: (data) => storageService.set(STORAGE_KEYS.PAYMENTS, data),

  getAuditLogs: () => storageService.get(STORAGE_KEYS.AUDIT_LOGS, initialAuditLogs),
  saveAuditLogs: (data) => storageService.set(STORAGE_KEYS.AUDIT_LOGS, data),

  // Reset to initial seed
  resetAll() {
    this.set(STORAGE_KEYS.COMPANIES, initialCompanies);
    this.set(STORAGE_KEYS.USERS, initialUsers);
    this.set(STORAGE_KEYS.TRUCKS, initialTrucks);
    this.set(STORAGE_KEYS.DRIVERS, initialDrivers);
    this.set(STORAGE_KEYS.TRIPS, initialTrips);
    this.set(STORAGE_KEYS.GPS_HISTORY, initialGpsHistory);
    this.set(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
    this.set(STORAGE_KEYS.PLANS, initialPlans);
    this.set(STORAGE_KEYS.PAYMENTS, initialPayments);
    this.set(STORAGE_KEYS.AUDIT_LOGS, initialAuditLogs);
  }
};
