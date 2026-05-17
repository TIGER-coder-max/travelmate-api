// TravelMate Nepal — Real eSewa Payment Integration
// eSewa v2 API with HMAC-SHA256 signature

const router = require('express').Router();
const crypto = require('crypto');
const { query } = require('../config/db');
const { auth } = require('../middleware/auth');
const { sendEmail, bookingConfirmationEmail, adminNewBookingEmail } = require('../config/email');

const ESEWA_SECRET = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';
const ESEWA_PRODUCT_CODE = process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST';
const ESEWA_BASE = process.env.NODE_ENV === 'production'
  ? 'https://epay.esewa.com.np'
  : 'https://rc-epay.esewa.com.np';
const FRONTEND = process.env.FRONTEND_URL || 'https://sanketpokharel.com.np';

// ── Generate HMAC-SHA256 signature ────────────────────────────
function generateSignature(message) {
  return crypto
    .createHmac('sha256', ESEWA_SECRET)
    .update(message)
    .digest('base64');
}

// ── POST /api/esewa/initiate ───────────────────────────────────
// Frontend calls this to get payment params, then submits form to eSewa
router.post('/initiate', auth, async (req, res) => {
  try {
    const { booking_id } = req.body;

    const result = await query(
      'SELECT * FROM bookings WHERE id=$1 AND user_id=$2',
      [booking_id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
    const booking = result.rows[0];

    if (booking.payment_status === 'paid') {
      return res.status(400).json({ error: 'Already paid' });
    }

    const amount = parseFloat(booking.total_amount);
    const taxAmount = 0;
    const totalAmount = amount;
    const transactionUuid = booking.reference + '-' + Date.now();

    // eSewa v2 requires signed message
    const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${ESEWA_PRODUCT_CODE}`;
    const signature = generateSignature(message);

    // Save transaction UUID for verification
    await query(
      'UPDATE bookings SET special_requests = COALESCE(special_requests, \'\') || $1 WHERE id = $2',
      [`|esewa_uuid:${transactionUuid}`, booking_id]
    );

    res.json({
      gateway_url: `${ESEWA_BASE}/api/epay/main/v2/form`,
      params: {
        amount: amount.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        transaction_uuid: transactionUuid,
        product_code: ESEWA_PRODUCT_CODE,
        product_service_charge: '0',
        product_delivery_charge: '0',
        success_url: `${FRONTEND}/esewa-success.html?booking_id=${booking_id}`,
        failure_url: `${FRONTEND}/booking.html?id=${booking.listing_id}&error=payment_failed`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature: signature
      }
    });
  } catch(err) {
    console.error('eSewa initiate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/esewa/verify ─────────────────────────────────────
// Called after eSewa redirects back to success URL
router.post('/verify', auth, async (req, res) => {
  try {
    const { booking_id, data } = req.body;

    // Decode eSewa response (base64 encoded JSON)
    let esewaData;
    try {
      esewaData = JSON.parse(Buffer.from(data, 'base64').toString());
    } catch(e) {
      return res.status(400).json({ error: 'Invalid eSewa response data' });
    }

    const {
      transaction_code,
      status,
      total_amount,
      transaction_uuid,
      product_code,
      signed_field_names,
      signature
    } = esewaData;

    // Verify signature
    const fields = signed_field_names.split(',');
    const message = fields.map(f => `${f}=${esewaData[f]}`).join(',');
    const expectedSig = generateSignature(message);

    if (signature !== expectedSig) {
      return res.status(400).json({ error: 'Signature verification failed' });
    }

    if (status !== 'COMPLETE') {
      return res.status(400).json({ error: `Payment status: ${status}` });
    }

    // Update booking
    await query(
      `UPDATE bookings SET status='confirmed', payment_status='paid', updated_at=NOW() WHERE id=$1 AND user_id=$2`,
      [booking_id, req.user.id]
    );

    // Save payment record
    await query(
      `INSERT INTO payments (booking_id, method, amount, currency, status, gateway_ref, gateway_response)
       VALUES ($1, 'esewa', $2, 'NPR', 'completed', $3, $4)`,
      [booking_id, total_amount, transaction_code, JSON.stringify(esewaData)]
    );

    // Send emails
    const [bookingResult, userResult] = await Promise.all([
      query('SELECT b.*, l.title FROM bookings b LEFT JOIN listings l ON b.listing_id=l.id WHERE b.id=$1', [booking_id]),
      query('SELECT * FROM users WHERE id=$1', [req.user.id])
    ]);

    if (bookingResult.rows.length && userResult.rows.length) {
      const booking = bookingResult.rows[0];
      const user = userResult.rows[0];
      sendEmail(bookingConfirmationEmail(booking, user)).catch(console.error);
      sendEmail(adminNewBookingEmail(booking, user)).catch(console.error);
    }

    res.json({ success: true, transaction_code });
  } catch(err) {
    console.error('eSewa verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/esewa/status/:booking_id ─────────────────────────
router.get('/status/:booking_id', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT status, payment_status FROM bookings WHERE id=$1 AND user_id=$2',
      [req.params.booking_id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
