# Build 5 — modules, order and test gates

Every module ends the same way: unit tests green, database/permission tests green, a browser walkthrough on `dev` (desktop and phone), and the user signs off before the next module starts. Nothing goes to `main` until the user says so.

Status key: done / built, untested / not started.

| # | Module | Scope (spec files) | Status |
|---|---|---|---|
| M0 | Environment | Dev Supabase project, schema copy, migrations, Vercel Preview vars, seed + reset scripts, Twilio, signup hook | in progress (waiting on admin access) |
| M1 | Six fixes to the live build | file 01 | done, on dev |
| M2 | Company master (12-step wizard) | 03, 04, 11, prototype | built, untested (needs M0) |
| M3 | Requests and calendar | 04, 05, 06 (tracking start, due dates 3rd/7th/10th) | engine done; persistence not started |
| M4 | Monthly close page | 06, 07, prototype | not started |
| M5 | Filings, proof ticks, close rules | 05, 06 | not started |
| M6 | Menus, roles, Companies page, Files delivered, data room, timeline | 01, 06 | not started |
| M7 | Dashboard v2 | 08 (needs new MIS fields) | not started |
| M8 | Legal | 09, 10 (needs payment gateway) | not started |

Ship order: M0 → M2 → M3 → M4 → M5 → M6 (this is "ship 1–3" from the plan), then M7, then M8.

## M0 Environment
Tests:
- Dev schema equals production schema (table, column and policy counts match).
- Login with one test number works on dev; a number not registered is refused.
- Upload to the `docs` bucket works on dev and cannot read another company's files.
- Reset script returns dev to one clean test company in under a minute.

## M2 Company master
Unit: rules engine against file 11 (Xploro: 11 standard, 3 events, 21 and 25 items), "None" answers add nothing, blank master asks nothing, redeemed issue dedupes, answer change never deletes files.
Browser:
- Answer all 12 steps; right panel counts match file 11 at each step.
- Change an answer on a finished step: reason asked, history shows it, files kept.
- Upload, replace (reason), remove (reason); version history shows all.
- Later / Not applicable put the item on the owner's list.
- Founder, external and PBA each see the right owner labels; external cannot see Legal.
- Phone width: stepper, panel and drawer usable.

## M3 Requests and calendar
- Tracking start default = FY start or incorporation month if later.
- Moving start earlier adds months and catch-up requests; later marks months "Not tracked" with files kept.
- Due dates are 3rd / 7th / 10th only; no 5th anywhere.
- A request exists only if a master rule created it; changing the master updates next month, not past months.
- Quarter-end months (Jun, Sep, Dec, Mar) add the extra items.

## M4 Monthly close page
- Seven states show the right colour and text; late capsule shows the count.
- Page opens on the latest ended month, selected capsule centred.
- Side panel: explainer text from the CSV, summary figures saved with who entered them, file preview, versions, replace/remove with reason.
- Right after an upload the panel opens with the summary form.
- MIS panel shows no form.

## M5 Filings and close rules
- A tick cannot be set without a proof file; replacing proof asks a reason.
- Submit is disabled until all four conditions are true and until the month has ended.
- Submitter can never publish (try via the UI and by calling the server action directly).
- External practitioner can never publish; PBA practitioner can only if they did not submit.
- Reopen needs a reason; dashboard keeps showing last published figures, marked reopened.
- Good-to-have items never block the close.

## M6 Menus, roles, data room
- Menu per role matches file 01; external has no Legal; founder sees Monthly close.
- Companies page (PBA): columns, filters, legal-to-price column placeholder.
- Files delivered lists delivered files with date.
- Data room is fed by the master; timeline starts in the incorporation year.
- Permissions table on People & Access matches the new roles.

## M7 Dashboard v2
- Unpublished month is never visible to the founder; PBA sees "hidden from the founder".
- Every number states its period and compares with the previous period only.
- Colour only on the eight fixed lines, each with a word.
- Indian number and date formats; never show 0 where unknown.
- Month / Quarter / Year switch keeps the same point in time; part-quarter labelled "2 of 3 months".
- Typed filing figures that disagree with the MIS flag the month before publishing.

## M8 Legal
- External practitioner gets the locked page on every Legal route and action.
- Only founder/admin can pay; only PBA can price, upload, propose extra, deliver.
- Work cannot start without gateway-confirmed payment (callback, not browser).
- Finished file cannot be downloaded while an extra is unpaid.
- A paid price never changes when the price list changes.
- GST shown separately; invoice handles reverse charge (open question for SPARC).
