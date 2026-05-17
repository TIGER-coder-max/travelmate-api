const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email skipped - no SMTP config] To: ${to}, Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: `"TravelMate Nepal" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};

// ─── Email Templates ──────────────────────────────────────────

const bookingConfirmationEmail = (booking, user) => ({
  to: user.email,
  subject: `Booking Confirmed — ${booking.reference} | TravelMate Nepal`,
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1B4332;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px">🏔️ TravelMate Nepal</h1>
      </div>
      <div style="padding:32px;background:#fff">
        <h2 style="color:#1A1A2E">Booking Confirmed! 🎉</h2>
        <p style="color:#6B6B7B">Hi ${user.first_name}, your booking is confirmed.</p>
        <div style="background:#F0EBE3;border-radius:12px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>Reference:</strong> ${booking.reference}</p>
          <p style="margin:0 0 8px"><strong>Trek:</strong> ${booking.title}</p>
          <p style="margin:0 0 8px"><strong>Start Date:</strong> ${booking.start_date}</p>
          <p style="margin:0 0 8px"><strong>Travelers:</strong> ${booking.travelers}</p>
          <p style="margin:0"><strong>Total Paid:</strong> $${booking.total_amount}</p>
        </div>
        <p style="color:#6B6B7B">Your guide will contact you within 24 hours. Safe travels!</p>
        <a href="https://sanketpokharel.com.np/dashboard.html" style="display:inline-block;background:#1B4332;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px">View My Dashboard</a>
      </div>
      <div style="background:#F0EBE3;padding:16px;text-align:center">
        <p style="margin:0;font-size:12px;color:#6B6B7B">© 2025 TravelMate Nepal Pvt. Ltd. · <a href="https://sanketpokharel.com.np">sanketpokharel.com.np</a></p>
      </div>
    </div>
  `
});

const welcomeEmail = (user) => ({
  to: user.email,
  subject: 'Welcome to TravelMate Nepal! 🏔️',
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1B4332;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:24px">🏔️ TravelMate Nepal</h1>
      </div>
      <div style="padding:32px;background:#fff">
        <h2 style="color:#1A1A2E">Welcome, ${user.first_name}! 👋</h2>
        <p style="color:#6B6B7B">Your account is ready. Start exploring Nepal's best hotels, treks, guides and adventures.</p>
        <a href="https://sanketpokharel.com.np/search.html" style="display:inline-block;background:#1B4332;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;margin-top:16px">Explore Nepal →</a>
      </div>
    </div>
  `
});

module.exports = { sendEmail, bookingConfirmationEmail, welcomeEmail };
