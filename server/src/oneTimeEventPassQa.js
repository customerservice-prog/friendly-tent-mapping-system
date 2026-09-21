const crypto = require('crypto');
const db = require('./db');
const { fulfillEventPass } = require('./eventPass');
const { accessUrl } = require('./eventPassEmail');

const RUN_ID = 'qa_event_pass_email_recovery_20260921_v1';

async function request(path, options = {}) {
  const port = process.env.PORT || 4000;
  const response = await fetch('http://127.0.0.1:' + port + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000),
  });
  let data = {};
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) throw new Error(path + ' failed: ' + response.status + ' ' + (data.error || ''));
  return { status: response.status, data };
}

async function runOneTimeEventPassQa() {
  if (process.env.RUN_EVENT_PASS_QA_ONCE !== RUN_ID) return;
  const email = String(process.env.QA_EVENT_PASS_EMAIL || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('QA_EVENT_PASS_EMAIL is required');

  const tenant = (await db.query("SELECT id,slug FROM tenants WHERE slug='friendly' LIMIT 1")).rows[0];
  if (!tenant) throw new Error('Friendly tenant not found');

  let payment = (await db.query('SELECT * FROM consumer_payments WHERE stripe_checkout_session_id=$1 LIMIT 1',[RUN_ID])).rows[0];
  let design;

  if (!payment) {
    const sessionOwner = crypto.randomBytes(32).toString('hex');
    const scene = {
      eventName: 'RentSketch QA — Email Recovery',
      eventType: 'qa',
      guestCount: 8,
      qaProof: RUN_ID,
      tent: { id:'pole-20x20', type:'pole', widthFt:20, lengthFt:20 },
      surfaceType: 'grass',
      anchoringMethod: 'stake',
      objects: [
        { id:'qa-table-1', kind:'table', tableId:'round-5ft', shape:'round', widthFt:5, depthFt:5, x:7.5, y:7.5, rotationDeg:0, seatCount:8, chairId:'resin-white', linenId:'linen-round-120', linenColor:'White' }
      ]
    };
    design = (await db.query(
      'INSERT INTO designs(tenant_id,anonymous_session_id,schema_version,scene) VALUES($1,$2,1,$3) RETURNING *',
      [tenant.id, sessionOwner, scene]
    )).rows[0];
    payment = (await db.query(
      `INSERT INTO consumer_payments(design_id,customer_email,payment_type,amount_cents,status,stripe_checkout_session_id,duration_days,currency)
       VALUES($1,$2,'consumer_event_pass',999,'pending',$3,30,'usd') RETURNING *`,
      [design.id, email, RUN_ID]
    )).rows[0];
  } else {
    design = (await db.query('SELECT * FROM designs WHERE id=$1 LIMIT 1',[payment.design_id])).rows[0];
  }

  const session = {
    id: RUN_ID,
    payment_status: 'paid',
    currency: 'usd',
    amount_total: 999,
    payment_intent: 'qa_event_pass_email_recovery_pi',
    customer_details: { email },
    metadata: { kind:'consumer_event_pass', designId:design.id, tenant:'friendly' }
  };

  await fulfillEventPass(session);

  // Exercise the same authenticated save route a paid customer uses.
  design = (await db.query('SELECT * FROM designs WHERE id=$1 LIMIT 1',[design.id])).rows[0];
  const savedScene = {
    ...design.scene,
    qaSavedProof: RUN_ID + '_saved_via_http',
    objects: [
      ...(Array.isArray(design.scene?.objects) ? design.scene.objects.filter(o => o.id !== 'qa-cocktail-1') : []),
      { id:'qa-cocktail-1', kind:'cocktail', widthFt:2.5, depthFt:2.5, x:2, y:2, rotationDeg:0 }
    ]
  };
  const saveResult = await request('/api/tenants/friendly/designs/' + design.id, {
    method: 'PATCH',
    body: JSON.stringify({
      scene: savedScene,
      eventType: 'qa',
      guestCount: 8,
      estimateTotal: 9.99,
      anonymousSessionId: design.anonymous_session_id,
      schemaVersion: design.schema_version || 1,
    })
  });

  const entitlement = (await db.query(
    "SELECT expires_at FROM entitlements WHERE id=(SELECT entitlement_id FROM consumer_payments WHERE stripe_checkout_session_id=$1)",
    [RUN_ID]
  )).rows[0];
  const privateUrl = accessUrl(design, 'friendly', email, entitlement?.expires_at);
  const token = new URLSearchParams(new URL(privateUrl).hash.slice(1)).get('recoveryToken');
  if (!token) throw new Error('Recovery token was not generated');

  // Exercise the same restore route used by the private email link.
  const restoreResult = await request('/api/consumer/event-pass/restore', {
    method: 'POST',
    body: JSON.stringify({ recoveryToken: token })
  });
  if (restoreResult.data.id !== design.id || !restoreResult.data.active ||
      restoreResult.data.scene?.qaSavedProof !== RUN_ID + '_saved_via_http' ||
      !Array.isArray(restoreResult.data.scene?.objects) || restoreResult.data.scene.objects.length < 2) {
    throw new Error('Recovery route did not reopen the saved QA scene');
  }

  const verified = (await db.query(`
    SELECT p.status,p.amount_cents,p.duration_days,e.status AS entitlement_status,e.expires_at,d.scene
    FROM consumer_payments p
    JOIN designs d ON d.id=p.design_id
    LEFT JOIN entitlements e ON e.id=p.entitlement_id
    WHERE p.stripe_checkout_session_id=$1 LIMIT 1`,[RUN_ID])).rows[0];
  const mail = (await db.query(
    "SELECT status,attempts,sent_at,last_error FROM event_pass_emails WHERE receipt_payment_id=$1 ORDER BY created_at DESC LIMIT 1",
    [payment.id]
  )).rows[0];

  console.log('[event-pass-qa]', JSON.stringify({
    runId: RUN_ID,
    designId: design.id,
    paymentStatus: verified?.status,
    entitlementStatus: verified?.entitlement_status,
    expiresAt: verified?.expires_at,
    sceneProof: verified?.scene?.qaProof,
    savedSceneProof: verified?.scene?.qaSavedProof,
    furnishedObjects: Array.isArray(verified?.scene?.objects) ? verified.scene.objects.length : null,
    saveHttpStatus: saveResult.status,
    restoreHttpStatus: restoreResult.status,
    reopenedActive: restoreResult.data.active,
    reopenedDesignId: restoreResult.data.id,
    reopenedSavedSceneProof: restoreResult.data.scene?.qaSavedProof,
    reopenedObjects: Array.isArray(restoreResult.data.scene?.objects) ? restoreResult.data.scene.objects.length : null,
    emailStatus: mail?.status || 'queued',
    emailAttempts: mail?.attempts || 0
  }));
}

module.exports = runOneTimeEventPassQa;
