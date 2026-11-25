import { Server } from 'socket.io';
import { verifyAccessTokenDetailed, loadUser, assertAccountUsable } from './services/tokens.js';

const dataRoom = (companyId) => `company:${companyId}`;
// Every authenticated socket sits in this room from the start, so a company's
// connections can be closed even if they never subscribed.
const sessionRoom = (companyId) => `session:${companyId}`;

const MAX_EVENTS_PER_WINDOW = 20;
const WINDOW_MS = 10 * 1000;

// Live updates for Company Admin dashboards (PRD section 7).
//
// Socket.IO only delivers: every event forwarded here was already saved to the
// database by an HTTP route, which then announced it on the in-process bus.
//
// With more than one API instance, add a shared adapter (e.g. Redis) so an
// event raised on one instance reaches sockets connected to another.
export function attachRealtime(httpServer, { db, config, events }) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientUrls, credentials: true },
    serveClient: false,
    maxHttpBufferSize: 10 * 1024, // clients only ever send tiny control messages
  });

  // The handshake must carry a valid access token for an active Company Admin.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token) throw Object.assign(new Error(), { code: 'UNAUTHORIZED' });
      const { userId, expiresAt } = verifyAccessTokenDetailed(config, token);
      const user = await loadUser(db, userId);
      assertAccountUsable(user);
      if (user.role !== 'COMPANY_ADMIN' && user.role !== 'DISPATCHER') throw Object.assign(new Error(), { code: 'FORBIDDEN' });
      socket.data.userId = user.id;
      socket.data.companyId = user.company_id;
      socket.data.expiresAt = expiresAt;
      next();
    } catch (err) {
      const refusal = new Error(err.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHORIZED');
      refusal.data = { code: refusal.message };
      next(refusal);
    }
  });

  io.on('connection', (socket) => {
    const { companyId, expiresAt } = socket.data;
    socket.join(sessionRoom(companyId));

    // A socket lives no longer than the access token it was opened with. The
    // client then reconnects with a fresh token, which re-checks the account.
    const timer = setTimeout(() => {
      socket.emit('session:expired');
      socket.disconnect(true);
    }, Math.max(0, expiresAt * 1000 - Date.now()));
    socket.on('disconnect', () => clearTimeout(timer));

    // Rate limit incoming events per socket.
    let windowStart = Date.now();
    let count = 0;
    socket.use((packet, next) => {
      const now = Date.now();
      if (now - windowStart > WINDOW_MS) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > MAX_EVENTS_PER_WINDOW) {
        socket.disconnect(true);
        return;
      }
      next();
    });

    // The room is derived from the verified identity. Whatever the client
    // sends with this event is ignored: it cannot name a room.
    socket.on('company:subscribe', (...args) => {
      socket.join(dataRoom(companyId));
      const ack = args[args.length - 1];
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  // Bus -> company room. Payloads carry no driver identity.
  const onLocation = ({ companyId, location }) => io.to(dataRoom(companyId)).emit('truck:location_updated', location);
  const onTripStarted = ({ companyId, trip }) => io.to(dataRoom(companyId)).emit('trip:started', trip);
  const onTripCompleted = ({ companyId, trip }) => io.to(dataRoom(companyId)).emit('trip:completed', trip);
  // A suspended company loses its live connections immediately.
  const onRevoked = ({ companyId }) => io.in(sessionRoom(companyId)).disconnectSockets(true);

  events.on('truck:location_updated', onLocation);
  events.on('trip:started', onTripStarted);
  events.on('trip:completed', onTripCompleted);
  events.on('company:access_revoked', onRevoked);

  return {
    io,
    close: async () => {
      events.off('truck:location_updated', onLocation);
      events.off('trip:started', onTripStarted);
      events.off('trip:completed', onTripCompleted);
      events.off('company:access_revoked', onRevoked);
      await io.close();
    },
  };
}
