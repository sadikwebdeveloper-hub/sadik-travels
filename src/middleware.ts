import type { RequestHandler, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { verifyToken, ACCESS_COOKIE } from './security.js';
import type { Store } from './store.js';

export function requestContext(): RequestHandler {
  return (req, res, next) => {
    req.requestId = req.header('x-request-id') || randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

function getAccessToken(req: Request) {
  const authorization = req.header('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  return req.cookies?.[ACCESS_COOKIE] as string | undefined;
}

export function optionalAuth(store: Store): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = getAccessToken(req);
      if (!token) return next();
      const claims = await verifyToken(token, 'access');
      const session = await store.findSessionById(claims.sid);
      if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date() || session.userId !== claims.sub) return next();
      const user = await store.findUserById(claims.sub);
      if (user && user.status === 'active') { req.auth = claims; req.user = user; }
      next();
    } catch { next(); }
  };
}

export function requireAdmin(store: Store): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = getAccessToken(req);
      if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Admin login is required');
      const claims = await verifyToken(token, 'access');
      const session = await store.findSessionById(claims.sid);
      if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date() || session.userId !== claims.sub) throw new AppError(401, 'SESSION_INVALID', 'Your admin session has expired');
      const user = await store.findUserById(claims.sub);
      if (!user || !['admin', 'manager', 'super_admin'].includes(user.role) || user.status !== 'active') throw new AppError(403, 'ADMIN_REQUIRED', 'Admin access is required');
      req.auth = claims; req.user = user; next();
    } catch (error) { next(error); }
  };
}

export function requireAuth(store: Store): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = getAccessToken(req);
      if (!token) throw new AppError(401, 'AUTH_REQUIRED', 'Login is required');
      const claims = await verifyToken(token, 'access');
      const session = await store.findSessionById(claims.sid);
      if (!session || session.revokedAt || new Date(session.expiresAt) <= new Date() || session.userId !== claims.sub) throw new AppError(401, 'SESSION_INVALID', 'Your session has expired. Please login again.');
      const user = await store.findUserById(claims.sub);
      if (!user || user.status !== 'active') throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available');
      req.auth = claims; req.user = user; next();
    } catch (error) { next(error); }
  };
}

export function notFound(_req: Request, _res: Response, next: NextFunction) { next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found')); }
