// Thin email-sending wrapper for consumer design recovery links.
// No provider is wired in yet - getMailer() returns null until a real
// provider (e.g. RESEND_API_KEY) is configured in the environment, so
// routes that depend on it fail clearly with 503 instead of silently
// pretending an email was sent. Mirrors the same defensive pattern used
// for Stripe in routes/consumerEventPass.js (getStripe()).
function getMailer() {
  if (process.env.RESEND_API_KEY) {
    // eslint-disable-next-line global-require
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    return {
      send: (to, subject, text) => resend.emails.send({
        from: process.env.MAIL_FROM || 'RentSketch <no-reply@rentsketch.com>',
        to,
        subject,
        text,
      }),
    };
  }
  return null;
}

module.exports = { getMailer };
