// Central pricing/config constants for RentSketch's consumer monetization.
// Do not scatter literal prices through route files or the frontend -
// change them here. Business subscription prices get their own constants
// when that work starts (see docs/ROADMAP.md).

module.exports = {
    // Direct Consumer Event Pass: one event, 30 days of full editing access.
    EVENT_PASS_CENTS: 999, // $9.99
    EVENT_PASS_DURATION_DAYS: 30,

    // Renewal: +30 more days on an existing (possibly expired) design.
    EVENT_PASS_RENEWAL_CENTS: 499, // $4.99
    EVENT_PASS_RENEWAL_DURATION_DAYS: 30,
};
