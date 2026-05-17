// ─── reviews.js ───────────────────────────────────────────────
const reviewRouter = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

// GET reviews for a listing
reviewRouter.get('/:listing_id', async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, u.first_name, u.last_name, u.nationality, u.avatar_url
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.listing_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [req.params.listing_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST a review (must have completed booking)
reviewRouter.post('/', auth, async (req, res) => {
  try {
    const { booking_id, listing_id, rating, title, body, guide_rating, value_rating, safety_rating } = req.body;

    // Verify completed booking
    const booking = await query(
      `SELECT id FROM bookings WHERE id = $1 AND user_id = $2 AND status = 'completed'`,
      [booking_id, req.user.id]
    );
    if (!booking.rows.length) {
      return res.status(403).json({ error: 'You can only review completed bookings' });
    }

    // Check duplicate
    const existing = await query('SELECT id FROM reviews WHERE booking_id = $1', [booking_id]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'You already reviewed this booking' });
    }

    const result = await query(
      `INSERT INTO reviews (booking_id, user_id, listing_id, rating, title, body, guide_rating, value_rating, safety_rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [booking_id, req.user.id, listing_id, rating, title, body, guide_rating, value_rating, safety_rating]
    );

    // Update listing average rating
    await query(
      `UPDATE listings SET
        rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE listing_id = $1),
        review_count = (SELECT COUNT(*) FROM reviews WHERE listing_id = $1)
       WHERE id = $1`,
      [listing_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = reviewRouter;
