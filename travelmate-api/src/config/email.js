const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email skipped] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: `"TravelMate Nepal 🏔️" <${process.env.SMTP_USER}>`, to, subject, html });
    console.log(`✉️ Email sent to ${to}`);
  } catch(err) { console.error(`❌ Email failed:`, err.message); }
};

const base = (content) => `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Arial,sans-serif}.wrap{max-width:600px;margin:0 auto;padding:24px 16px}.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}.hdr{background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:32px;text-align:center}.logo{font-size:24px;font-weight:700;color:#fff}.logo span{color:#D4A017}.tag{font-size:13px;color:rgba(255,255,255,.7);margin-top:4px}.body{padding:32px}.title{font-size:22px;font-weight:700;color:#1A1A2E;margin-bottom:8px}.sub{font-size:15px;color:#6B6B7B;margin-bottom:24px;line-height:1.6}.ibox{background:#F0EBE3;border-radius:12px;padding:20px;margin:20px 0}.irow{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(27,67,50,.1);font-size:14px}.irow:last-child{border-bottom:none;font-weight:700;color:#1B4332}.ilbl{color:#6B6B7B}.ival{color:#1A1A2E;font-weight:500}.btn{display:inline-block;padding:14px 32px;background:#1B4332;color:#fff;text-decoration:none;border-radius:12px;font-size:15px;font-weight:600;margin:16px 0}.tips{background:#e8f5e9;border-radius:12px;padding:16px 20px}.tips h4{color:#1B4332;font-size:14px;margin:0 0 8px}.tips ul{margin:0;padding-left:16px}.tips li{color:#2D6A4F;font-size:13px;margin-bottom:4px}.ftr{background:#1A1A2E;padding:24px 32px;text-align:center}.ftr p{color:rgba(255,255,255,.5);font-size:12px;margin:4px 0}.ftr a{color:#D4A017;text-decoration:none}hr{border:none;border-top:1px solid #f0f0f0;margin:24px 0}</style></head><body><div class="wrap"><div class="card"><div class="hdr"><div class="logo">Travel<span>Mate</span> Nepal</div><div class="tag">Your Nepal Adventure Companion 🏔️</div></div>${content}<div class="ftr"><p>© 2025 TravelMate Nepal Pvt. Ltd.</p><p><a href="https://sanketpokharel.com.np">sanketpokharel.com.np</a> · <a href="tel:+9779706329774">+977 9706329774</a></p></div></div></div></body></html>`;

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '–';

const welcomeEmail = (u) => ({
  to: u.email,
  subject: `Welcome to TravelMate Nepal, ${u.first_name}! 🏔️`,
  html: base(`<div class="body"><div style="text-align:center"><span style="font-size:56px">🏔️</span><div class="title" style="margin-top:12px">Welcome, ${u.first_name}!</div><div class="sub">Your TravelMate Nepal account is ready. Start exploring Nepal's best hotels, treks, vehicles and adventures.</div></div><div class="tips"><h4>🚀 Get started:</h4><ul><li>Browse 500+ hotels and 120+ trekking packages</li><li>Book your adventure in under 2 minutes</li><li>Pay securely via eSewa or Kumari Bank</li><li>24/7 support in English and Nepali</li></ul></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/search.html" class="btn">Explore Nepal Now →</a></div><hr/><p style="font-size:13px;color:#6B6B7B;text-align:center">Need help? WhatsApp: <strong>+977 9706329774</strong></p></div>`)
});

const bookingConfirmationEmail = (booking, user) => ({
  to: user.email,
  subject: `✅ Booking Confirmed — ${booking.reference} | TravelMate Nepal`,
  html: base(`<div class="body"><div style="text-align:center"><span style="font-size:56px">🎉</span><div class="title" style="margin-top:12px">Booking Confirmed!</div><div class="sub">Hi ${user.first_name}, your Nepal adventure is officially booked. Get ready for an amazing experience!</div></div><div class="ibox"><div class="irow"><span class="ilbl">📋 Reference</span><span class="ival" style="color:#1B4332;font-weight:700">${booking.reference}</span></div><div class="irow"><span class="ilbl">🏔️ Listing</span><span class="ival">${booking.title||'Nepal Experience'}</span></div><div class="irow"><span class="ilbl">📅 Start Date</span><span class="ival">${fmt(booking.start_date)}</span></div><div class="irow"><span class="ilbl">👥 Travelers</span><span class="ival">${booking.travelers} person${booking.travelers>1?'s':''}</span></div><div class="irow"><span class="ilbl">💰 Total</span><span class="ival">$${Number(booking.total_amount).toLocaleString()} USD</span></div><div class="irow"><span class="ilbl">✅ Status</span><span class="ival" style="color:#1B4332">Confirmed</span></div></div><div class="tips"><h4>📋 What happens next:</h4><ul><li>Your guide will contact you within 24 hours</li><li>Download all permits from your dashboard</li><li>Free cancellation up to 30 days before your trip</li><li>Emergency support: +977 9706329774</li></ul></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/dashboard.html" class="btn">View My Dashboard →</a></div></div>`)
});

const bookingReminderEmail = (booking, user) => ({
  to: user.email,
  subject: `⏰ Your Nepal adventure starts in 3 days! — ${booking.reference}`,
  html: base(`<div class="body"><div style="text-align:center"><span style="font-size:56px">⏰</span><div class="title" style="margin-top:12px">3 Days to Go!</div><div class="sub">Hi ${user.first_name}, your Nepal adventure starts on <strong>${fmt(booking.start_date)}</strong>. Are you ready?</div></div><div class="ibox"><div class="irow"><span class="ilbl">📋 Booking</span><span class="ival">${booking.reference}</span></div><div class="irow"><span class="ilbl">🏔️ Experience</span><span class="ival">${booking.title||'Nepal Experience'}</span></div><div class="irow"><span class="ilbl">📅 Start Date</span><span class="ival">${fmt(booking.start_date)}</span></div></div><div class="tips"><h4>✅ Pre-trip checklist:</h4><ul><li>Passport valid 6+ months ✓</li><li>Nepal visa arranged ✓</li><li>Travel insurance purchased ✓</li><li>Cash in NPR ready ✓</li><li>Download offline maps ✓</li><li>Emergency: +977 9706329774 ✓</li></ul></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/dashboard.html" class="btn">View Trip Details →</a></div></div>`)
});

const adminNewBookingEmail = (booking, user) => ({
  to: process.env.ADMIN_EMAIL || process.env.SMTP_USER,
  subject: `💰 New Booking — ${booking.reference} — $${Number(booking.total_amount).toLocaleString()}`,
  html: base(`<div class="body"><div class="title">💰 New Booking!</div><div class="sub">A new booking has been made on TravelMate Nepal.</div><div class="ibox"><div class="irow"><span class="ilbl">Reference</span><span class="ival">${booking.reference}</span></div><div class="irow"><span class="ilbl">Guest</span><span class="ival">${user.first_name} ${user.last_name||''} (${user.email})</span></div><div class="irow"><span class="ilbl">Listing</span><span class="ival">${booking.title||'–'}</span></div><div class="irow"><span class="ilbl">Start Date</span><span class="ival">${fmt(booking.start_date)}</span></div><div class="irow"><span class="ilbl">Travelers</span><span class="ival">${booking.travelers}</span></div><div class="irow"><span class="ilbl">Revenue</span><span class="ival">$${Number(booking.total_amount).toLocaleString()}</span></div></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/admin.html" class="btn">Open Admin Panel →</a></div></div>`)
});

const resetPasswordEmail = (user, resetLink) => ({
  to: user.email,
  subject: `Reset your TravelMate password 🔑`,
  html: base(`<div class="body"><div class="title">Reset Your Password 🔑</div><div class="sub">Hi ${user.first_name}, click the button below to reset your password. This link expires in 1 hour.</div><div style="text-align:center;margin:28px 0"><a href="${resetLink}" class="btn">Reset Password →</a></div><hr/><p style="font-size:13px;color:#6B6B7B;text-align:center">If you didn't request this, ignore this email.</p></div>`)
});

const reviewRequestEmail = (booking, user) => ({
  to: user.email,
  subject: `⭐ How was your Nepal trip? — ${booking.reference}`,
  html: base(`<div class="body"><div style="text-align:center"><span style="font-size:56px">⭐</span><div class="title" style="margin-top:12px">How was your adventure?</div><div class="sub">Hi ${user.first_name}, we hope you had an amazing time in Nepal! Share your experience to help other travelers.</div></div><div class="ibox"><div class="irow"><span class="ilbl">Trip</span><span class="ival">${booking.title||'Nepal Experience'}</span></div><div class="irow"><span class="ilbl">Date</span><span class="ival">${booking.start_date ? new Date(booking.start_date).toLocaleDateString('en-US',{month:'long',year:'numeric'}) : '–'}</span></div></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/review.html?booking_id=${booking.id}&listing_id=${booking.listing_id}" class="btn">Write a Review ⭐</a></div></div>`)
});

const vendorNewBookingEmail = (booking, vendor) => ({
  to: vendor.email,
  subject: `📋 New booking — ${booking.reference} — TravelMate`,
  html: base(`<div class="body"><div class="title">📋 New Booking!</div><div class="sub">A tourist has booked your listing on TravelMate Nepal.</div><div class="ibox"><div class="irow"><span class="ilbl">Reference</span><span class="ival">${booking.reference}</span></div><div class="irow"><span class="ilbl">Listing</span><span class="ival">${booking.title||'–'}</span></div><div class="irow"><span class="ilbl">Start Date</span><span class="ival">${fmt(booking.start_date)}</span></div><div class="irow"><span class="ilbl">Travelers</span><span class="ival">${booking.travelers}</span></div><div class="irow"><span class="ilbl">Your Earnings</span><span class="ival">$${Math.round(booking.total_amount*0.9).toLocaleString()}</span></div></div><div style="text-align:center"><a href="https://sanketpokharel.com.np/vendor.html" class="btn">View Vendor Dashboard →</a></div></div>`)
});

module.exports = { sendEmail, welcomeEmail, bookingConfirmationEmail, bookingReminderEmail, adminNewBookingEmail, resetPasswordEmail, reviewRequestEmail, vendorNewBookingEmail };
