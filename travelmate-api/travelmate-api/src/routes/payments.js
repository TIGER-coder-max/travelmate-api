const router = require('express').Router();
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');

// Stripe — only load if key is set
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

// ─── POST /api/payments/stripe/create-intent ──────────────────
router.post('/stripe/create-intent', auth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
    const { booking_id } = req.body;

    const result = await query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [booking_id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = result.rows[0];

    if (booking.payment_status === 'paid') {
      return res.status(400).json({ error: 'This booking is already paid' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(booking.total_amount * 100), // cents
      currency: 'usd',
      metadata: { booking_id, user_id: req.user.id, reference: booking.reference }
    });

    // Save pending payment record
    await query(
      `INSERT INTO payments (booking_id, method, amount, currency, status, gateway_ref)
       VALUES ($1, 'stripe', $2, 'USD', 'pending', $3)
       ON CONFLICT DO NOTHING`,
      [booking_id, booking.total_amount, intent.id]
    );

    res.json({ client_secret: intent.client_secret, amount: booking.total_amount });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payments/stripe/webhook ───────────────────────
router.post('/stripe/webhook', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const { booking_id } = intent.metadata;
    await query(
      `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', updated_at = NOW()
       WHERE id = $1`,
      [booking_id]
    );
    await query(
      `UPDATE payments SET status = 'completed' WHERE gateway_ref = $1`,
      [intent.id]
    );
    console.log(`✅ Payment confirmed for booking ${booking_id}`);
  }

  if (event.type === 'payment_intent.payment_failed') {
    const { booking_id } = event.data.object.metadata;
    await query(`UPDATE payments SET status = 'failed' WHERE gateway_ref = $1`, [event.data.object.id]);
    console.log(`❌ Payment failed for booking ${booking_id}`);
  }

  res.json({ received: true });
});

// ─── POST /api/payments/esewa/initiate ───────────────────────
router.post('/esewa/initiate', auth, async (req, res) => {
  try {
    const { booking_id } = req.body;
    const result = await query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [booking_id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = result.rows[0];

    // eSewa payment params
    const params = {
      amt: booking.total_amount,
      psc: 0, pdc: 0, txAmt: 0,
      tAmt: booking.total_amount,
      pid: booking.reference,
      scd: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST',
      su: `${process.env.FRONTEND_URL}/booking-success.html?booking=${booking_id}&method=esewa`,
      fu: `${process.env.FRONTEND_URL}/booking-failed.html?booking=${booking_id}`
    };

    res.json({
      gateway_url: process.env.NODE_ENV === 'production'
        ? 'https://esewa.com.np/epay/main'
        : 'https://uat.esewa.com.np/epay/main',
      params
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payments/esewa/verify ─────────────────────────
router.post('/esewa/verify', auth, async (req, res) => {
  try {
    const { booking_id, oid, amt, refId } = req.body;

    const verifyUrl = process.env.NODE_ENV === 'production'
      ? 'https://esewa.com.np/epay/transrec'
      : 'https://uat.esewa.com.np/epay/transrec';

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        amt, rid: refId, pid: oid,
        scd: process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST'
      }).toString()
    });

    const text = await response.text();

    if (text.includes('<response_code>Success</response_code>')) {
      await query(
        `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [booking_id, req.user.id]
      );
      await query(
        `INSERT INTO payments (booking_id, method, amount, currency, status, gateway_ref)
         VALUES ($1, 'esewa', $2, 'NPR', 'completed', $3)`,
        [booking_id, amt, refId]
      );
      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ error: 'eSewa payment verification failed' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/payments/khalti/verify ────────────────────────
router.post('/khalti/verify', auth, async (req, res) => {
  try {
    const { booking_id, token, amount } = req.body;

    const response = await fetch('https://khalti.com/api/v2/payment/verify/', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.KHALTI_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, amount })
    });

    const data = await response.json();

    if (response.ok && data.idx) {
      await query(
        `UPDATE bookings SET status = 'confirmed', payment_status = 'paid', updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [booking_id, req.user.id]
      );
      await query(
        `INSERT INTO payments (booking_id, method, amount, currency, status, gateway_ref)
         VALUES ($1, 'khalti', $2, 'NPR', 'completed', $3)`,
        [booking_id, amount / 100, data.idx]
      );
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Khalti verification failed', details: data });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/payments/booking/:booking_id ────────────────────
router.get('/booking/:booking_id', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.* FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.booking_id = $1 AND b.user_id = $2
       ORDER BY p.created_at DESC`,
      [req.params.booking_id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
