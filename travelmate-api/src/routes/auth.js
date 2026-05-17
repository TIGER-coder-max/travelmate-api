const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');
const { sendEmail, welcomeEmail } = require('../config/email');

const signToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

// ─── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { first_name, last_name, email, password, phone, nationality } = req.body;

    // Validate
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: 'first_name, last_name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check duplicate
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (first_name, last_name, email, password_hash, phone, nationality)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, first_name, last_name, email, phone, role, created_at`,
      [first_name.trim(), last_name.trim(), email.toLowerCase(), password_hash, phone || null, nationality || null]
    );

    const user = result.rows[0];
    const token = signToken(user);

    // Send welcome email (non-blocking)
    sendEmail(welcomeEmail(user)).catch(console.error);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, first_name, last_name, email, phone, nationality, avatar_url, role, is_verified, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await query('SELECT id, first_name, email FROM users WHERE email = $1', [email?.toLowerCase()]);
    // Always return success (don't reveal if email exists)
    if (result.rows.length) {
      const user = result.rows[0];
      const resetToken = jwt.sign({ id: user.id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const resetLink = `https://sanketpokharel.com.np/reset-password.html?token=${resetToken}`;
      await sendEmail({
        to: user.email,
        subject: 'Reset your TravelMate password',
        html: `<p>Hi ${user.first_name},</p><p>Click below to reset your password (valid 1 hour):</p><a href="${resetLink}" style="display:inline-block;background:#1B4332;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none">Reset Password</a>`
      });
    }
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Reset link is invalid or expired' });
    }
    if (decoded.purpose !== 'reset') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, decoded.id]);
    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
