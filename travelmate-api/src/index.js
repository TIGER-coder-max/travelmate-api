require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const passport = require('passport');

const app = express();

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    'https://sanketpokharel.com.np',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(morgan('dev'));

// Session (needed for Passport OAuth)
app.use(session({
  secret: process.env.JWT_SECRET || 'travelmate_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// Raw body for Stripe webhooks (must be before express.json)
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────
app.use('/auth',         require('./routes/oauth'));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/esewa',    require('./routes/esewa'));
app.use('/api/reviews',  require('./routes/reviews'));
app.use('/api/vendors',  require('./routes/vendors'));

// ─── Health check ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'TravelMate Nepal API',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// ─── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🏔️  TravelMate Nepal API`);
  console.log(`🚀  Running on port ${PORT}`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
