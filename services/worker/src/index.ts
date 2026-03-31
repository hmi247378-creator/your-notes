import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { Env } from './db.js';
import { auth } from './auth.js';
import { notes } from './notes.js';
import { tags } from './tags.js';
import { classify } from './classify.js';
import { reminders } from './reminders.js';
import { reports } from './reports.js';
import { sync } from './sync.js';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors({
  origin: '*', // Adjust for production
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Route: Health
app.get('/api/health', (c) => c.json({ ok: true }));

// Auth Routes (Public)
app.route('/api/auth', auth);

// JWT Middleware for Protected Routes
// We apply it only to routes under /api/notes for example,
// but we need to ensure the secret is shared.
app.use('/api/*', (c, next) => {
  const isPublic = c.req.path.startsWith('/api/auth');
  if (isPublic) return next();

  // For protected routes, use JWT middleware
  const handler = jwt({
    secret: c.env.JWT_SECRET,
    alg: 'HS256',
  });
  return handler(c, next);
});

// Protected Routes
app.route('/api/notes', notes);
app.route('/api/tags', tags);
app.route('/api/classify', classify);
app.route('/api/reminders', reminders);
app.route('/api/reports', reports);
app.route('/api/sync', sync);

// Basic error handling
app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
});

export default app;
