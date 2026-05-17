const router = require('express').Router();
const { query, getClient } = require('../config/db');
const { auth } = require('../middleware/auth');
const { sendEmail, bookingConfirmationEmail, adminNewBookingEmail, vendorNewBookingEmail } = require('../config/email');

// Generate booking reference
const genRef = () => 'TM-' + Date.now().toString().slice(-8);

// ─── POST /api/bookings — create booking ──────────────────────
router.post('/', auth, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const {
      listing_id, start_date, end_date,
      travelers = 1, package_type = 'standard',
      addons = [], special_requests, traveler_details
    } = req.body;

    if (!listing_id || !start_date) {
      return res.status(400).json({ error: 'listing_id and start_date are required' });
    }

    // Get listing + vendor
    const listingResult = await client.query(
      'SELECT * FROM listings WHERE id = $1 AND is_active = true',
      [listing_id]
    );
    if (!listingResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not found or unavailable' });
    }
    const listing = listingResult.rows[0];

    // Calculate pricing
    const multiplier = package_type === 'luxury' ? 1.65 : package_type === 'premium' ? 1.3 : 1;
    const base_price  = parseFloat((listing.price_from * travelers * multiplier).toFixed(2));
    const addon_price = parseFloat(addons.reduce((sum, a) => sum + (a.price || 0), 0).toFixed(2));
    const service_fee = parseFloat(((base_price + addon_price) * 0.06).toFixed(2));
    const total_amount = parseFloat((base_price + addon_price + service_fee).toFixed(2));

    const result = await client.query(
      `INSERT INTO bookings
        (reference, user_id, listing_id, vendor_id, start_date, end_date,
         travelers, package_type, addons, base_price, addon_price,
         service_fee, total_amount, special_requests, traveler_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        genRef(), req.user.id, listing_id, listing.vendor_id,
        start_date, end_date || null, travelers, package_type,
        JSON.stringify(addons), base_price, addon_price,
        service_fee, total_amount, special_requests || null,
        JSON.stringify(traveler_details || {})
      ]
    );

    await client.query('COMMIT');
    const booking = { ...result.rows[0], title: listing.title };

    // Send confirmation email
    const user = await query(
      'SELECT first_name, email FROM users WHERE id = $1', [req.user.id]
    );
    if (user.rows.length) {
      sendEmail(bookingConfirmationEmail(booking, user.rows[0])).catch(console.error);
      // Notify admin
      sendEmail(adminNewBookingEmail(booking, user.rows[0])).catch(console.error);
      // Notify vendor
      const vendorEmail = await query('SELECT email, business_name FROM vendors WHERE id=$1', [listing.vendor_id]);
      if (vendorEmail.rows.length && vendorEmail.rows[0].email) {
        sendEmail(vendorNewBookingEmail(booking, vendorEmail.rows[0])).catch(console.error);
      }
    }

    res.status(201).json(booking);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Booking error:', err);
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ─── GET /api/bookings/my — user's bookings ───────────────────
router.get('/my', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const conditions = ['b.user_id = $1'];
    const params = [req.user.id];
    let i = 2;

    if (status) { conditions.push(`b.status = $${i++}`); params.push(status); }
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const result = await query(
      `SELECT b.*, l.title, l.type, l.location, l.images[1] AS thumbnail,
              v.business_name AS vendor_name
       FROM bookings b
       LEFT JOIN listings l ON b.listing_id = l.id
       LEFT JOIN vendors v ON b.vendor_id = v.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/bookings/:id — single booking ───────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT b.*, l.title, l.type, l.location, l.images, l.includes, l.excludes,
              v.business_name, v.phone AS vendor_phone, v.email AS vendor_email
       FROM bookings b
       LEFT JOIN listings l ON b.listing_id = l.id
       LEFT JOIN vendors v ON b.vendor_id = v.id
       WHERE b.id = $1 AND (b.user_id = $2 OR $3 = 'admin')`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/bookings/:id/cancel ──────────────────────────
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const booking = await query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!booking.rows.length) return res.status(404).json({ error: 'Booking not found' });
    if (!['pending', 'confirmed'].includes(booking.rows[0].status)) {
      return res.status(400).json({ error: 'This booking cannot be cancelled' });
    }

    const result = await query(
      `UPDATE bookings SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/bookings/vendor/all — vendor bookings ──────────
router.get('/vendor/all', auth, async (req, res) => {
  try {
    const vendor = await query('SELECT id FROM vendors WHERE user_id = $1', [req.user.id]);
    if (!vendor.rows.length) return res.status(403).json({ error: 'Vendor account required' });

    const { status, page = 1, limit = 20 } = req.query;
    const conditions = ['b.vendor_id = $1'];
    const params = [vendor.rows[0].id];
    let i = 2;

    if (status) { conditions.push(`b.status = $${i++}`); params.push(status); }
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const result = await query(
      `SELECT b.*, l.title, u.first_name, u.last_name, u.email AS user_email, u.phone AS user_phone
       FROM bookings b
       LEFT JOIN listings l ON b.listing_id = l.id
       LEFT JOIN users u ON b.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
