# Friendly Event Designer — Product Spec (v0.1)

## 1. Summary
A guided, web-based event layout tool for Friendly Party Rental customers. Customers answer a few questions about their event, get a recommended tent/table/chair setup built from Friendly's real inventory, drag items around a simple 2D floor plan, see a rough price estimate, and submit it as a booking request. No CAD skills required.

## 2. Problem
Customers currently have to guess tent size, table count, and chair count on their own, or call the office to figure it out. A layout tool should answer "will this fit and what will it cost" in under two minutes, not teach the customer 3D navigation controls first.

## 3. Goals (v1)
- Ask guest count, event type, and space type (backyard/venue/park/lot).
- Recommend a starting tent size + table/chair combo from real inventory.
- Let the customer drag tables/chairs on a clean top-down 2D grid.
- Auto-place chairs around a table when the table is added (no manual per-chair placement).
- Show a live, simple capacity check ("150 guests -> 16 x 5' rounds fits in a 40x60 tent").
- Show a running price estimate using real per-day prices.
- Let the customer save/submit the layout as a quote request (goes to Friendly's team, does not auto-book or charge anything).

## 4. Explicit Non-Goals (v1) — deferred to later phases
- 3D rendering / day-night / walkthrough camera.
- Aerial/satellite address mapping of the customer's yard.
- Automatic collision/clearance physics engine.
- AI "design it for me" auto-layout generation.
- Live inventory availability / date-conflict checking.
- Staff dashboard, crew install sheets, photo proof workflow.
- Direct checkout/payment inside the tool.

These are good ideas — they just don't belong in a first shippable version.

## 5. Primary User Journey (Customer)
1. Landing question screen: event type, guest count, location type.
2. Recommendation screen: suggested tent + starter package, with option to "customize" instead.
3. Designer screen: 2D top-down canvas, left panel of real inventory categories (Tents, Tables, Chairs, Dance Floor, Linens), right panel showing guest count / capacity check / running estimate.
4. Review screen: itemized list + total estimate + "Submit Quote Request".
5. Confirmation screen: thank-you + Friendly's phone number for questions.

## 6. Data Model (draft)

```json
{
  "tent": {
      "id": "pole-40x60",
          "name": "40x60 Pole Tent",
              "type": "pole",
                  "widthFt": 40,
                      "lengthFt": 60,
                          "pricePerDay": 850.00,
                              "recommendedMaxGuests": { "dining": 150, "cocktail": 220 }
                                },
                                  "table": {
                                      "id": "round-5ft",
                                          "name": "5ft Round Table",
                                              "shape": "round",
                                                  "diameterFt": 5,
                                                      "seatsDefault": 8,
                                                          "pricePerDay": 15.00
                                                            },
                                                              "chair": {
                                                                  "id": "chiavari-gold",
                                                                      "name": "Gold Chiavari Chair",
                                                                          "pricePerDay": 11.99
                                                                            },
                                                                              "eventLayout": {
                                                                                  "eventType": "wedding",
                                                                                      "guestCount": 150,
                                                                                          "tentId": "pole-40x60",
                                                                                              "items": [
                                                                                                    { "type": "table", "refId": "round-5ft", "x": 12, "y": 8, "seatCount": 8, "chairId": "chiavari-gold" }
                                                                                                        ],
                                                                                                            "estimateTotal": 5165.00,
                                                                                                                "status": "draft"
                                                                                                                  }
                                                                                                                  }
                                                                                                                  ```
                                                                                                                  
                                                                                                                  ## 7. Real Inventory Reference (pulled from friendlypartyrental.com, Aug 2026)
                                                                                                                  
                                                                                                                  **Tents (per day):** 20x20 $250 · 20x30 $350 · 20x40 $450 · 30x30 $575 · 30x45 $700 · 30x60 $850 · 40x40 $1,500 · 40x60 $850 · 40x80 $1,850 · 40x100 $1,950 · 10x10 pop-up $100 · 10x20 pop-up $175.
                                                                                                                  
                                                                                                                  **Tables/Chairs (per day):** White plastic folding chair $2.50 · White resin folding chair $4.75 · Gold/White/Mahogany Chiavari $11.99–$12.00 · 6ft table $13.00 · 8ft banquet $14.00 · 5ft round $15.00 · Cocktail table $12.00.
                                                                                                                  
                                                                                                                  **Dance floor/stage (per day):** 3x3 floor section $35.00 · Stage section $125.00.
                                                                                                                  
                                                                                                                  **Wedding packages (fixed price, for recommendation logic):** Backyard Elopement $345 (30 guests) · Classic Ceremony $520 (50 guests) · Garden Reception $2,380 (80 guests) · Luxury Estate $5,165 (150 guests) · All-Inclusive Premium $6,925 (200 guests).
                                                                                                                  
                                                                                                                  > Note: pull these live from the site or a shared spreadsheet before launch — prices change, and this list should not be hand-maintained in two places.
                                                                                                                  
                                                                                                                  ## 8. Technical Approach (suggested, not final)
                                                                                                                  - Frontend: React + a 2D canvas library (e.g. Konva.js or Fabric.js) for drag/drop and snapping. Avoid a 3D engine for v1.
                                                                                                                  - Backend: simple API to store draft layouts and submitted quote requests (does not need to touch Friendly's booking/payment system in v1 — quote requests can just email/notify staff).
                                                                                                                  - Inventory data: a single JSON/CSV source of truth kept in sync with the live site's pricing so numbers don't drift.
                                                                                                                  - Hosting: can run as a subpage or subdomain (e.g. design.friendlypartyrental.com) rather than being embedded via iframe, for a cleaner mobile experience — depends on what platform the main site runs on (worth checking with whoever manages the site).
                                                                                                                  
                                                                                                                  ## 9. Roadmap
                                                                                                                  - **Phase 1 (this spec):** guided intake, 2D drag/drop with real inventory, auto chair placement, basic capacity check, price estimate, quote-request submission.
                                                                                                                  - **Phase 2:** 3D "customer view" toggle (day/night, lighting) for the finished layout only — not the main editing mode.
                                                                                                                  - **Phase 3:** basic clearance warnings (aisle width, table spacing), linens/lighting add-ons with live price updates.
                                                                                                                  - **Phase 4:** live inventory/date availability, staff-side crew sheet export, package auto-matching ("this matches our Luxury Estate package").
                                                                                                                  - **Not currently planned:** aerial address mapping, AI auto-layout, full staff ERP/dashboard — revisit only if Phase 1–3 prove useful.
                                                                                                                  
                                                                                                                  ## 10. Open Questions
                                                                                                                  - What platform runs friendlypartyrental.com today (affects whether this is embedded, linked, or subdomain-hosted)?
                                                                                                                  - Should quote requests go straight into an existing booking system, or just email the team for now?
                                                                                                                  - Who owns keeping inventory/pricing data in sync between this tool and the live site?
                                                                                                                  
