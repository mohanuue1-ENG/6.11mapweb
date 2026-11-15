import { asyncHandler, unauthorized, forbidden } from '../errors.js';
import { verifyAccessToken, loadUser, assertAccountUsable } from '../services/tokens.js';

// Verifies the bearer token and sets req.auth from the database row.
// req.auth.companyId is the ONLY company scope handlers may use; a company_id
// sent by the client is never trusted (PRD section 6).
export function authenticate({ db, config }) {
  return asyncHandler(async (req, res, next) => {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    const userId = verifyAccessToken(config, token);
    const user = await loadUser(db, userId);
    assertAccountUsable(user);

    req.auth = {
      userId: user.id,
      role: user.role,
      companyId: user.company_id,
      user,
    };
    next();
  });
}

// Allows only the listed roles. Use after authenticate().
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}
