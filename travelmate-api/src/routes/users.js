// ─── users.js ─────────────────────────────────────────────────
const userRouter = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

// GET profile
userRouter.get('/profile', auth, async (req, res) => {
  const result = await query(
    `SELECT id, first_name, last_name, email, phone, nationality, avatar_url, role, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
});

// PATCH update profile
userRouter.patch('/profile', auth, async (req, res) => {
  try {
    const { first_name, last_name, phone, nationality, avatar_url } = req.body;
    const result = await query(
      `UPDATE users SET
        first_name = COALESCE($1, first_name),
        last_name  = COALESCE($2, last_name),
        phone      = COALESCE($3, phone),
        nationality= COALESCE($4, nationality),
        avatar_url = COALESCE($5, avatar_url)
       WHERE id = $6
       RETURNING id, first_name, last_name, email, phone, nationality, avatar_url`,
      [first_name, last_name, phone, nationality, avatar_url, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = userRouter;
