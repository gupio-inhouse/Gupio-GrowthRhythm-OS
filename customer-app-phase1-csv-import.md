# Customer App Phase 1 — CSV Import Sheet (GrowthRhythm OS)

Every task from `Customer App Phase 1.pdf` (13 not-yet-built features), converted into GrowthRhythm's task-import CSV format (`title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence`), ready to paste into `.csv` files and upload via **Tasks → Import from CSV**.

## What's filled in vs. left for you

- **`assigneeEmail`** — left blank on every row; the task is created unassigned and can be assigned later from the task's edit dialog.
- **`projectName`** — set to `Customer App` on every row, matching the existing active team **"Customer APP"** (Engineering dept) in GrowthRhythm — the importer's team lookup is case-insensitive, so `Customer App` resolves to it correctly.
- **`priority`** — left blank on every row; the importer defaults blank priority to `MEDIUM`.
- **`departmentName`** — set to `Engineering` on every row (all 13 features are engineering/product build work).
- **`description`** — carries the layer tag (`backend`/`mobile`/`data-model`/`design`/`integration`/`qa`) and source feature name, so context survives outside the PDF once these are flat CSV rows.
- **`startDate` / `dueDate`** — mandatory on every row per the app's current Add Task rules (Start Date/Time is always required to create a task; End Date/Time is required once a task carries a start). Both are filled on every row below — see basis right below.

## Scheduling basis

Every task's Start Date/Time is the same fixed anchor — **Wed, Jul 15, 2026, 9:30 AM** — and its End Date/Time is computed independently from that anchor using the app's own working-hours window (9:30 AM–7:30 PM, Mon–Fri): Start + the task's own hour estimate, rolling into the next working day if it runs past 7:30 PM. Tasks are **not** chained to each other — task B's start doesn't depend on task A's end, so every row is self-contained and matches exactly what a single Add Task submission would require (a real Start Date/Time and, once hours are applied, a real End Date/Time).

These are placeholder dates that satisfy the app's mandatory-field validation, not a project plan — the 13 features total **965h** (945h excluding the optional 20h masked-calling stretch in feature 10), far beyond what one engineer does in a single working block. Once assignees and real project sequencing are decided, go back and move each task's actual Start/End to when it will really be worked.

## Three data notes from the source PDF

The per-task hours in three features don't add up to the doc's own stated header/total for that feature. Used the actual row-level sum (real task list) in every case, not the stated headline:

- **Feature 2 (Parking Payments):** listed task rows sum to 72h, not the 68h stated.
- **Feature 8 (Rent a Car/Bike):** listed task rows sum to 80h, not the 88h stated.
- **Feature 11 (Accessories Marketplace):** listed task rows sum to 118h, not the 121h stated.

## CSV-safety note

GrowthRhythm's CSV importer splits each row on a plain comma with no quoted-field support, so any comma inside a task title would silently shift every column after it. Commas inside titles/descriptions below have been swapped for semicolons (`;`) to keep every row intact on import — cosmetic only, doesn't change the task's meaning.

---

## 1. Parking — Locate + Booking (67h, 15 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
ParkingDealer + ParkingListing (location; capacity; hourly/daily rate) + Booking models + migration,,[data-model] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Seed/fixture data for parking dealers/listings,,[data-model] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Dealer listing CRUD API (dealer-role auth),,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Destination-based nearby search endpoint (search near where you're going; not just current GPS),,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Real-time availability engine (slot check for a date/time range),,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Booking create/confirm/cancel endpoints,,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
'Notify me / join waitlist' endpoint for sold-out locations,,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Wire booking confirmation + waitlist alerts into notification service,,[backend] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Update parking search UI to search near a chosen destination,,[mobile] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Listing detail + booking flow UI (date/time picker; price; confirm),,[mobile] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
'My Parking Bookings' screen,,[mobile] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Sold-out listings surfaced at top with 'Notify Me' CTA,,[mobile] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Dealer-facing listing management screens,,[mobile] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Design: destination search results (available/sold-out/waitlist states); booking flow; dealer management,,[design] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
End-to-end QA: destination search; booking; no-availability/waitlist flow; cancellation,,[qa] Parking — Locate + Booking,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
```

## 2. Parking Payments (Customer Payments — shared gateway) (72h, 18 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Customer-scoped payment schema (Payment/Transaction/Order/Refund keyed to customerId) + migration,,[data-model] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Razorpay account/env/SDK setup,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Order creation service + endpoint,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Webhook endpoint: signature verification; idempotent processing; audit log,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Payment status + history endpoints,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Refund initiation + webhook-driven status updates,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Minimal receipt generation,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Ownership checks; auth wiring; rate limiting,,[backend] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Backend tests (order creation; signature verification; idempotency; refunds),,[qa] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
react-native-razorpay SDK integration + native linking (iOS/Android),,[mobile] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Checkout screen UI,,[mobile] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Success/failure/cancel handling + retry UX,,[mobile] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Payment history/receipts screen,,[mobile] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Checkout/receipt/history design,,[design] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Sandbox integration testing (test cards),,[integration] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Webhook registration + go-live checklist,,[integration] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Mobile QA (iOS/Android; native SDK quirks),,[qa] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Full regression QA: failure paths; duplicate webhooks; refund reconciliation; tampering; network drop,,[qa] Parking Payments (Customer Payments — shared gateway),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
```

## 3. Book Car Servicing (Appointment Booking) (60h, 19 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Appointment/Booking Prisma model + migration,,[data-model] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
ServiceSlot/Availability model (garage; date; windows; capacity),,[data-model] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Seed/fixture data for garage slots,,[data-model] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T10:30,NONE
Create-booking endpoint w/ conflict check,,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
List/filter bookings endpoint,,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Cancel/reschedule endpoint,,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Garage availability endpoint (open slots by date range),,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Wire booking confirmation into notification service,,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Auth/ownership + validation,,[backend] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
'Book Service' screen (garage/date/time selection),,[mobile] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Slot picker/calendar component,,[mobile] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Confirmation screen,,[mobile] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
'My Appointments' screen (view/cancel/reschedule),,[mobile] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Add 'Book Service' CTA into existing garage locator,,[mobile] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Link completed booking → ServiceRecord creation,,[integration] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
End-to-end push/email confirmation wiring,,[integration] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
UI mockups (select; slot picker; confirmation; appointments),,[design] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Functional QA: conflicts; cancel/reschedule; timezone edge cases,,[qa] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Regression QA on garage locator/service-history screens,,[qa] Book Car Servicing (Appointment Booking),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
```

## 4. Roadside Assistance (Towing/Mechanic Dispatch) (53h, 10 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
ServiceProvider + DispatchRequest models; linked to SOSRequest,,[data-model] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Vendor management API (CRUD + seed list),,[backend] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Nearest-available-vendor matching engine w/ timeout/reassignment,,[backend] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T18:30,NONE
Job-status lifecycle API w/ Socket.io events + push,,[backend] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Vendor SMS notification w/ accept/reject link,,[integration] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Fix safety bug: remove fake hospital/police fallback in getMockHelp(),,[backend] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Mobile: 'Book roadside assistance' flow,,[mobile] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Mobile: live dispatch tracking screen,,[mobile] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Design: booking + live tracking UX,,[design] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
QA: full dispatch flow; no-vendor/reject/timeout/cancel edge cases; push/socket reliability,,[qa] Roadside Assistance (Towing/Mechanic Dispatch),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
```

## 5. Trip & Travel — Real Weather, Rates & Itinerary (31h, 8 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Wire existing weather service into trip planner; replace hardcoded/random weather,,[backend] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Map weather response shape to what the UI expects; handle API failure,,[integration] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Fix hotel list: replace synthetic 'Live Rates' markup with an honestly-labeled estimate,,[mobile] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Rebuild itinerary generator: real per-destination; per-day plan via Places,,[mobile] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Loading states for now-async itinerary generation; price-label polish,,[design] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QA: weather across routes/toll points; real vs. random variation; API-failure fallback,,[qa] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QA: itinerary across varied destinations; multi-day trips,,[qa] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QA: full trip planner regression,,[qa] Trip & Travel — Real Weather; Rates & Itinerary,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
```

## 6. Hire Driver (local, on-demand) (107h, 19 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Driver profile model (vehicle-class; license; rating; vetting) extending existing KYC model,,[data-model] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
DriverAvailability model,,[data-model] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Extend generic request model for driver-hire bookings,,[data-model] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Shared provider accept/dispatch pattern (reused by Valet + SOS),,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Driver onboarding/vetting endpoints,,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Availability toggle + schedule endpoints,,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Matching/dispatch logic (nearest vetted driver; timeout/no-match),,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Booking endpoints (create/assign/accept/reject/complete/cancel/fare),,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Push notification hookup for driver alerts,,[backend] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Mobile: request-a-driver screen,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Mobile: matching status + confirmed + trip tracking,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T16:30,NONE
Mobile: driver profile/document upload UI,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Mobile: driver availability toggle,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Mobile: driver incoming-request accept/reject UI,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Mobile: driver active/complete-trip screen,,[mobile] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
End-to-end wiring (request→match→notify→accept→status→complete),,[integration] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
UX/wireframes; both customer and driver sides,,[design] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
QA: booking/matching/accept flow; decline/timeout/no-drivers/cancel edge cases,,[qa] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
QA: vetting/admin approval + regression,,[qa] Hire Driver (local; on-demand),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
```

## 7. Hire Driver for Trip (outstation/multi-day) (80h, 14 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Extend driver schema with outstation rates (per-km/day/night-halt) + multi-day calendar,,[data-model] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
OutstationBooking model (date range; distance; fare breakdown; trip link),,[data-model] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Fare/pricing engine (distance + day + night-halt; rate overrides),,[backend] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Extend matching/availability for date-range queries,,[backend] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Booking endpoints: quote/create/extend/cancel/status,,[backend] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Booking notifications (reuse existing service),,[backend] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Pull route distance/dates from Trip Planner to prefill quote,,[integration] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Mobile: 'Hire outstation driver' add-on entry point in trip flow,,[mobile] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Mobile: outstation booking screen (dates; fare breakdown; driver list),,[mobile] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
Mobile: wire selection into trip state + summary,,[mobile] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T16:30,NONE
Mobile: adapt Hire Driver's chat/tracking screens for multi-day context,,[mobile] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Design: quote; confirmation; entry-point screens,,[design] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
QA: pricing accuracy; date-range edge cases; booking lifecycle; trip planner regression,,[qa] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
QA: iOS/Android pass,,[qa] Hire Driver for Trip (outstation/multi-day),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
```

## 8. Rent a Car/Bike — Dealer Listings, Booking & Locate (80h, 15 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Dealer + RentalListing + Booking models + migration,,[data-model] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Seed/fixture data for dealers/listings,,[data-model] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Dealer listing CRUD API (dealer-role auth),,[backend] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Availability engine (date-range overlap vs. existing bookings),,[backend] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Replace synthetic pricing with real geo-radius query against listings,,[backend] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Wire booking confirmation/cancellation into notifications,,[backend] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
API tests + docs,,[qa] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Update rental locator UI to consume real listings,,[mobile] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Listing detail + booking flow UI (dates; price; confirm),,[mobile] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
'My Bookings' screen,,[mobile] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Dealer-facing listing management screens,,[mobile] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Payment hookup for deposit/payment,,[integration] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Dealer + booking-flow UX (empty/error/no-inventory/confirmed/cancelled states),,[design] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
End-to-end QA: booking; double-booking prevention; cancellation; timezone,,[qa] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Regression QA comparing new real pricing vs. old synthetic estimate,,[qa] Rent a Car/Bike — Dealer Listings; Booking & Locate,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
```

## 9. Car Owner Reviews (41h, 11 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Review/Rating model + migration,,[data-model] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
CRUD API (create/list/edit own/delete own),,[backend] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Aggregate rating calculation per target,,[backend] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Rate limiter on submission (extend existing config),,[backend] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Report/flag endpoint + admin hide endpoint,,[backend] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Submission UI (star picker + text),,[mobile] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Review list/display UI w/ average + empty state,,[mobile] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Report-review UI + my-reviews management,,[mobile] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Star component; review card; report modal design,,[design] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Wire screens to endpoints; error/loading/empty states,,[integration] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QA: submit/edit/delete/report; rate-limit behavior; admin hide; cross-device,,[qa] Car Owner Reviews,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
```

## 10. Message Vehicle Owner (QR Code — Anonymous Contact Relay) (84h, 16 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
VehicleQRToken model (per-vehicle opaque token; rotatable) + migration,,[data-model] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QRContactMessage model (token; message text; optional photo; status) + migration,,[data-model] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Token generate/rotate endpoint (owner-authenticated),,[backend] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Public endpoint: resolve token → confirm the vehicle exists; no owner PII returned,,[backend] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Public endpoint: accept a contact message against a token,,[backend] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Rate limiting / abuse prevention on both public (unauthenticated) endpoints,,[backend] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Wire owner push/in-app notification when a new contact message arrives,,[backend] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Add a QR-generation library + 'My QR Code' screen (display/download/print per vehicle),,[mobile] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Add a QR/barcode-scanning library (native linking) + in-app scanner screen,,[mobile] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
In-app 'Contact Owner' composer (message + optional photo),,[mobile] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Owner-side 'Vehicle Messages' inbox screen,,[mobile] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Public web fallback page for scanners without the app (mobile-responsive; no login; message form),,[integration] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Deep-link handling: QR opens the app if installed; else falls back to the web page,,[integration] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Design: QR display card; scan flow; contact form (web + app); owner inbox,,[design] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
End-to-end QA: generate/print/scan; web fallback; message delivery; token security; abuse/rate-limit,,[qa] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
[OPTIONAL/DEFERRED] Masked-calling stretch: Twilio Proxy session; call-bridging; webhook; UI; QA,,[stretch] Message Vehicle Owner (QR Code — Anonymous Contact Relay),,Engineering,Customer App,,2026-07-15T09:30,2026-07-16T19:30,NONE
```

## 11. Accessories Marketplace (118h, 20 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Vendor/Product/Category/Inventory/Cart/Order schema,,[data-model] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Migration + seed data,,[data-model] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Vendor CRUD (admin-facing),,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Product/catalog CRUD + search/filter,,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Inventory/stock tracking (reserve/decrement),,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Cart APIs,,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Checkout/order creation + status machine,,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Wire checkout to shared payment gateway,,[integration] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Order history/tracking endpoints,,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Admin order management,,[backend] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Catalog/product/cart/checkout/tracking design,,[design] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
Mobile: catalog browse (grid; filter; search),,[mobile] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Mobile: product detail,,[mobile] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Mobile: cart UI,,[mobile] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Mobile: checkout flow,,[mobile] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Mobile: order history/tracking,,[mobile] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Mobile payment checkout integration,,[integration] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Order status push notifications,,[integration] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
QA: full browse→cart→checkout→order flow,,[qa] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
QA: out-of-stock; payment failure/retry; inventory races,,[qa] Accessories Marketplace,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
```

## 12. Sell Used Cars (Vehicle Marketplace) (102h, 17 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Listing/ListingPhoto/Inquiry models + migration,,[data-model] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Marketplace search indexing on reference data,,[data-model] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Listing CRUD (draft/publish/mark-sold; ownership checks),,[backend] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Photo upload handling (multi-image),,[backend] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Public browse/search/filter endpoint,,[backend] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Rule-based valuation estimate endpoint (no ML),,[backend] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Lightweight buyer-seller inquiry model + endpoints,,[backend] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
'Sell Your Car' listing creation flow,,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T19:30,NONE
My Listings management screen,,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Public marketplace browse screen,,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
Listing detail screen (photos; price; contact seller),,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Inquiry/contact-seller UI + seller inbox,,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Valuation estimate UI,,[mobile] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Wire screens to endpoints; upload progress,,[integration] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Listing card; browse grid; filters; sell-flow; inbox design,,[design] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
QA: create/edit/delete; search accuracy; valuation edge cases; inquiry; upload,,[qa] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
QA: basic abuse/moderation checks,,[qa] Sell Used Cars (Vehicle Marketplace),,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
```

## 13. Community (70h, 20 tasks)

All tasks below start Wed, Jul 15, 2026 09:30; end times vary by each task's own hours.

```csv
title,assigneeEmail,description,expectedOutcome,departmentName,projectName,priority,startDate,dueDate,recurrence
Post/Comment/Like/Report models + migration,,[data-model] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Post CRUD (feed scoped to vehicle model),,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Comment endpoints,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
Like/unlike + count aggregation,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Wire post images to existing upload infra,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Report/flag + admin hide endpoint,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Feed pagination,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Basic spam/rate-limit guard,,[backend] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Backend tests,,[qa] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Community tab + navigation,,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Feed list (infinite scroll; pull-to-refresh; states),,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Create Post screen,,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T13:30,NONE
Post detail + comment thread,,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T14:30,NONE
Like button (optimistic UI),,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Report/flag modal,,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
API wiring/hooks,,[mobile] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T12:30,NONE
End-to-end image upload flow,,[integration] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Push notification hook for comments/likes,,[integration] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T11:30,NONE
Feed card; composer; thread; report modal design,,[design] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T15:30,NONE
Full functional + moderation QA; iOS/Android,,[qa] Community,,Engineering,Customer App,,2026-07-15T09:30,2026-07-15T17:30,NONE
```
