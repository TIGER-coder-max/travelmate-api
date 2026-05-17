// src/routes/oauth.js
// Google OAuth 2.0 with Passport.js

const router = require('express').Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

// ── Configure Google Strategy ─────────────────────────────────
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'https://travelmate-api-pr3w.onrender.com/auth/google/callback',
  scope: ['profile', 'email']
},
async function(accessToken, refreshToken, profile, done) {
  try {
    const email = profile.emails[0].value;
    const firstName = profile.name.givenName;
    const lastName = profile.name.familyName;
    const avatar = profile.photos[0]?.value;
    const googleId = profile.id;

    // Check if user already exists
    let result = await query(
      'SELECT * FROM users WHERE email = $1', [email]
    );

    let user;

    if (result.rows.length) {
      // Existing user — update google info
      user = result.rows[0];
      await query(
        'UPDATE users SET avatar_url = $1 WHERE id = $2',
        [avatar, user.id]
      );
    } else {
      // New user — create account
      result = await query(
        `INSERT INTO users (first_name, last_name, email, avatar_url, is_verified, role)
         VALUES ($1, $2, $3, $4, true, 'traveler')
         RETURNING *`,
        [firstName, lastName, email, avatar]
      );
      user = result.rows[0];
    }

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// ── Routes ────────────────────────────────────────────────────

// Step 1: Redirect to Google
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

// Step 2: Google calls back here after login
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL}/login.html?error=google_failed` }),
  async (req, res) => {
    try {
      const user = req.user;

      // Generate JWT token (same as email/password login)
      const token = jwt.sign(
        { id: user.id, role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      const { password_hash, ...safeUser } = user;

      // Redirect to frontend with token in URL
      // Frontend will extract token and store in localStorage
      const frontendUrl = process.env.FRONTEND_URL || 'https://sanketpokharel.com.np';
      const userData = encodeURIComponent(JSON.stringify(safeUser));
      
      res.redirect(`${frontendUrl}/oauth-callback.html?token=${token}&user=${userData}`);
    } catch (err) {
      res.redirect(`${process.env.FRONTEND_URL}/login.html?error=server_error`);
    }
  }
);

// Step 3: Handle Google login failure
router.get('/google/failure', (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL}/login.html?error=google_failed`);
});

module.exports = router;
