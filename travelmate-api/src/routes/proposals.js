const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');

// Traveler creates an inquiry. This never confirms a booking or requests payment.
router.post('/inquiries', auth, async (req, res) => {
  try {
    const { listing_id, trip_slug, title, preferred_date, travelers = 1, package_preference, customer_message } = req.body;
    if (!title || (!listing_id && !trip_slug)) return res.status(400).json({ error: 'A listing or journey is required' });
    const count = Math.max(1, Math.min(50, Number.parseInt(travelers, 10) || 1));
    let vendorId = null;
    if (listing_id) {
      const listing = await query('SELECT vendor_id FROM listings WHERE id=$1 AND is_active=true', [listing_id]);
      if (!listing.rows.length) return res.status(404).json({ error: 'Listing not found' });
      vendorId = listing.rows[0].vendor_id;
    }
    const result = await query(
      `INSERT INTO proposals (user_id,vendor_id,listing_id,trip_slug,title,preferred_date,travelers,package_preference,customer_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id,vendorId,listing_id||null,trip_slug||null,title,preferred_date||null,count,package_preference||null,customer_message||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/my', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,v.business_name FROM proposals p LEFT JOIN vendors v ON p.vendor_id=v.id
       WHERE p.user_id=$1 ORDER BY p.created_at DESC`, [req.user.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/vendor/all', auth, requireRole('vendor','admin'), async (req, res) => {
  try {
    const vendor = req.user.role === 'admin' ? null : await query('SELECT id FROM vendors WHERE user_id=$1', [req.user.id]);
    if (req.user.role !== 'admin' && !vendor.rows.length) return res.status(403).json({ error: 'Vendor account required' });
    const result = await query(
      `SELECT p.*,u.first_name,u.last_name,u.email FROM proposals p JOIN users u ON p.user_id=u.id
       WHERE ($1::uuid IS NULL OR p.vendor_id=$1) ORDER BY p.created_at DESC`,
      [req.user.role === 'admin' ? null : vendor.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/offer', auth, requireRole('vendor','admin'), async (req, res) => {
  try {
    const { itinerary, inclusions=[], exclusions=[], cancellation_terms, total_amount, currency='USD', valid_until } = req.body;
    if (!itinerary || !cancellation_terms || !total_amount || !valid_until) return res.status(400).json({ error: 'Itinerary, cancellation terms, total amount and validity are required' });
    const vendor = req.user.role === 'admin' ? null : await query('SELECT id FROM vendors WHERE user_id=$1', [req.user.id]);
    if (req.user.role !== 'admin' && !vendor.rows.length) return res.status(403).json({ error: 'Vendor account required' });
    const result = await query(
      `UPDATE proposals SET itinerary=$1,inclusions=$2,exclusions=$3,cancellation_terms=$4,total_amount=$5,
       currency=$6,valid_until=$7,status='sent',updated_at=NOW()
       WHERE id=$8 AND ($9::uuid IS NULL OR vendor_id=$9) AND status IN ('requested','draft') RETURNING *`,
      [itinerary,inclusions,exclusions,cancellation_terms,Number(total_amount),currency,valid_until,req.params.id,req.user.role === 'admin' ? null : vendor.rows[0].id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Proposal not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/respond', auth, async (req, res) => {
  try {
    if (!['accepted','declined'].includes(req.body.status)) return res.status(400).json({ error: 'Choose accepted or declined' });
    const result = await query(
      `UPDATE proposals SET status=$1,responded_at=NOW(),updated_at=NOW()
       WHERE id=$2 AND user_id=$3 AND status='sent' AND valid_until>=CURRENT_DATE RETURNING *`,
      [req.body.status,req.params.id,req.user.id]
    );
    if (!result.rows.length) return res.status(400).json({ error: 'Proposal is unavailable or expired' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
