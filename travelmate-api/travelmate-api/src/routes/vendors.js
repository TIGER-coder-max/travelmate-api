const router = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

// GET my vendor profile
router.get('/me', auth, async (req, res) => {
  const result = await query('SELECT * FROM vendors WHERE user_id = $1', [req.user.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'No vendor account found' });
  res.json(result.rows[0]);
});

// POST register as vendor
router.post('/register', auth, async (req, res) => {
  try {
    const existing = await query('SELECT id FROM vendors WHERE user_id = $1', [req.user.id]);
    if (existing.rows.length) return res.status(409).json({ error: 'Vendor account already exists' });

    const { business_name, business_type, description, location, phone, email, website } = req.body;
    if (!business_name || !business_type) {
      return res.status(400).json({ error: 'business_name and business_type are required' });
    }

    const result = await query(
      `INSERT INTO vendors (user_id, business_name, business_type, description, location, phone, email, website)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, business_name, business_type, description, location, phone, email, website]
    );

    // Update user role
    await query(`UPDATE users SET role = 'vendor' WHERE id = $1`, [req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET vendor dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const vendor = await query('SELECT id FROM vendors WHERE user_id = $1', [req.user.id]);
    if (!vendor.rows.length) return res.status(403).json({ error: 'Vendor account required' });
    const vid = vendor.rows[0].id;

    const [revenue, bookings, listings, rating] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM bookings WHERE vendor_id=$1 AND payment_status='paid'`, [vid]),
      query(`SELECT COUNT(*) AS total, status FROM bookings WHERE vendor_id=$1 GROUP BY status`, [vid]),
      query(`SELECT COUNT(*) AS total FROM listings WHERE vendor_id=$1 AND is_active=true`, [vid]),
      query(`SELECT ROUND(AVG(rating)::numeric,1) AS avg FROM reviews r JOIN listings l ON r.listing_id=l.id WHERE l.vendor_id=$1`, [vid])
    ]);

    res.json({
      total_revenue: parseFloat(revenue.rows[0].total),
      bookings: bookings.rows,
      active_listings: parseInt(listings.rows[0].total),
      average_rating: parseFloat(rating.rows[0].avg) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update vendor profile
router.patch('/me', auth, async (req, res) => {
  try {
    const { business_name, description, location, phone, email, website, logo_url } = req.body;
    const result = await query(
      `UPDATE vendors SET
        business_name = COALESCE($1, business_name),
        description   = COALESCE($2, description),
        location      = COALESCE($3, location),
        phone         = COALESCE($4, phone),
        email         = COALESCE($5, email),
        website       = COALESCE($6, website),
        logo_url      = COALESCE($7, logo_url)
       WHERE user_id = $8 RETURNING *`,
      [business_name, description, location, phone, email, website, logo_url, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
