import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { findUserById } from '../repositories/userRepository.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    // EventSource cannot send headers; allow ?token= fallback (validated identically below).
    const token = header.startsWith('Bearer ') ? header.slice(7) : (typeof req.query?.token === 'string' ? req.query.token : null);
    if (!token) throw unauthorized('Missing bearer token');
    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') throw unauthorized('Session expired, please log in again');
      throw unauthorized('Invalid token');
    }
    const user = await findUserById(payload.sub);
    if (!user) throw unauthorized('Account no longer exists');
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
    return next();
  };
}
