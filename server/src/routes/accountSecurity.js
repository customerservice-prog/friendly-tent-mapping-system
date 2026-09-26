const express = require('express');
const { verifyDashboardToken, createDashboardSession } = require('../dashboardSessions');
const { getDashboardToken, requireDashboardBootstrap, sendDashboardSession } = require('../dashboardHttpSession');
const { getMfaStatus, startEnrollment, confirmEnrollment, changeMfa, completeMfaLogin, MfaError } = require('../dashboardMfa');

const router = express.Router();
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(error => {
  if (error instanceof MfaError || [401, 403, 429].includes(error.status)) {
    return res.status(error.status).json({ error: error.message });
  }
  next(error);
});
async function currentUserId(req) {
  const token = getDashboardToken(req);
  if (!token) throw new MfaError(401, 'Sign in again to continue.');
  try { return (await verifyDashboardToken(token)).userId; }
  catch (_) { throw new MfaError(401, 'Your session expired. Sign in again to continue.'); }
}
router.post('/login/mfa', wrap(async (req, res) => {
  requireDashboardBootstrap(req);
  const { challengeToken, code } = req.body || {};
  const result = await completeMfaLogin(challengeToken, code, createDashboardSession);
  sendDashboardSession(req, res, result.user, result.session);
}));
router.get('/security', wrap(async (req, res) => {
  res.json({ mfa: await getMfaStatus(await currentUserId(req)) });
}));
router.post('/security/mfa/enroll', wrap(async (req, res) => {
  res.json(await startEnrollment(await currentUserId(req), req.body?.currentPassword));
}));
router.post('/security/mfa/confirm', wrap(async (req, res) => {
  res.json(await confirmEnrollment(await currentUserId(req), req.body?.currentPassword, req.body?.code));
}));
for (const action of ['disable', 'recovery-codes']) {
  router.post('/security/mfa/' + action, wrap(async (req, res) => {
    res.json(await changeMfa(await currentUserId(req), req.body?.currentPassword, req.body?.code, action));
  }));
}

module.exports = router;
