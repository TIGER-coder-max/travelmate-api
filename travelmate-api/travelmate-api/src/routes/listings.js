const router = require('express').Router();
const { query } = require('../config/db');
const { auth, requireRole } = require('../middleware/auth');

// ─── GET /api/listings — search with filters ──────────────────
router.get('/', async (req, res) => {
  try {
    const {
      type, region, search,
      min_price, max_price,
      difficulty, duration_min, duration_max,
      sort = 'rating', page = 1, limit = 20
    } = req.query;

    const conditions = ['l.is_active = true'];
    const params = [];
    let i = 1;

    if (type)        { conditions.push(`l.type = $${i++}`);                  params.push(type); }
    if (region)      { conditions.push(`l.region ILIKE $${i++}`);            params.push(`%${region}%`); }
    if (search)      { conditions.push(`(l.title ILIKE $${i} OR l.description ILIKE $${i++})`); params.push(`%${search}%`); }
    if (min_price)   { conditions.push(`l.price_from >= $${i++}`);           params.push(Number(min_price)); }
    if (max_price)   { conditions.push(`l.price_from <= $${i++}`);           params.push(Number(max_price)); }
    if (difficulty)  { conditions.push(`l.difficulty = $${i++}`);            params.push(difficulty); }
    if (duration_min){ conditions.push(`l.duration_days >= $${i++}`);        params.push(Number(duration_min)); }
    if (duration_max){ conditions.push(`l.duration_days <= $${i++}`);        params.push(Number(duration_max)); }

    const sortMap = {
      rating:     'l.rating DESC, l.review_count DESC',
      price_asc:  'l.price_from ASC',
      price_desc: 'l.price_from DESC',
      newest:     'l.created_at DESC',
      popular:    'l.review_count DESC'
    };
    const orderBy = sortMap[sort] || sortMap.rating;
    const offset = (Number(page) - 1) * Number(limit);

    params.push(Number(limit), offset);

    const sql = `
      SELECT
        l.id, l.type, l.title, l.description, l.location, l.region,
        l.price_from, l.price_unit, l.duration_days, l.difficulty,
        l.max_group_size, l.images, l.amenities, l.rating, l.review_count,
        l.created_at,
        v.business_name AS vendor_name,
        v.is_verified   AS vendor_verified
      FROM listings l
      LEFT JOIN vendors v ON l.vendor_id = v.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT $${i++} OFFSET $${i}
    `;

    const countSql = `
      SELECT COUNT(*) FROM listings l
      WHERE ${conditions.join(' AND ')}
    `;

    const [results, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, -2))
    ]);

    res.json({
      listings: results.rows,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      pages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit))
    });
  } catch (err) {
    console.error('Listings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/listings/:id — single listing ───────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT
        l.*,
        v.business_name, v.is_verified AS vendor_verified,
        v.phone AS vendor_phone, v.email AS vendor_email,
        v.description AS vendor_description
       FROM listings l
       LEFT JOIN vendors v ON l.vendor_id = v.id
       WHERE l.id = $1 AND l.is_active = true`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Get recent reviews
    const reviews = await query(
      `SELECT r.*, u.first_name, u.last_name, u.nationality, u.avatar_url
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.listing_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ ...result.rows[0], reviews: reviews.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/listings — create listing (vendors) ───────────
router.post('/', auth, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendor = await query('SELECT id FROM vendors WHERE user_id = $1 AND is_active = true', [req.user.id]);
    if (!vendor.rows.length) {
      return res.status(403).json({ error: 'Active vendor account required' });
    }

    const {
      title, type, description, location, region,
      price_from, price_unit = 'per_person',
      duration_days, difficulty, max_group_size,
      images = [], amenities = [], includes = [], excludes = []
    } = req.body;

    if (!title || !type || !price_from) {
      return res.status(400).json({ error: 'title, type and price_from are required' });
    }

    const result = await query(
      `INSERT INTO listings
        (vendor_id, title, type, description, location, region,
         price_from, price_unit, duration_days, difficulty,
         max_group_size, images, amenities, includes, excludes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [vendor.rows[0].id, title, type, description, location, region,
       price_from, price_unit, duration_days, difficulty,
       max_group_size, images, amenities, includes, excludes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /api/listings/:id — update listing ─────────────────
router.patch('/:id', auth, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const listing = await query(
      `SELECT l.id FROM listings l
       JOIN vendors v ON l.vendor_id = v.id
       WHERE l.id = $1 AND (v.user_id = $2 OR $3 = 'admin')`,
      [req.params.id, req.user.id, req.user.role]
    );
    if (!listing.rows.length) return res.status(403).json({ error: 'Not authorized' });

    const fields = ['title','description','location','region','price_from','duration_days','difficulty','max_group_size','images','amenities','includes','excludes','is_active'];
    const updates = [];
    const values = [];
    let i = 1;

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        values.push(req.body[f]);
      }
    });

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);

    const result = await query(
      `UPDATE listings SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/listings/:id — soft delete ───────────────────
router.delete('/:id', auth, requireRole('vendor', 'admin'), async (req, res) => {
  try {
    await query('UPDATE listings SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Listing removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
