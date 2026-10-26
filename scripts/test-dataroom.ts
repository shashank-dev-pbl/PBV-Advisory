import assert from "node:assert/strict";
import { data, xploro } from "./fixture";
import { buildPlan } from "../lib/master/engine";
import { roomEvents, standardGroups, timelineYears } from "../lib/dataroom/model";
const today = new Date(Date.UTC(2026, 9, 20));
const plan = buildPlan(xploro, data, today);
const groups = standardGroups(plan);
assert.deepEqual(groups.map((g) => g.title), ["Constitution", "Tax registrations", "Financials", "Ownership and agreements", "People"]);
assert.equal(groups.reduce((n, g) => n + g.items.length, 0), plan.standard.length, "every standard document lands in a group");
const ev = roomEvents(plan, () => "founder");
assert.equal(ev.length, 3, "incorporation, CCD round, HDFC loan");
assert.ok(ev[0].date! <= ev[1].date! && ev[1].date! <= ev[2].date!, "sorted by date");
assert.equal(ev.find((e) => e.cat === "found")!.docs.length, 11);
// the certificate, PAN and TAN are the same records as the standard documents, so they share a key
const inc = ev.find((e) => e.cat === "found")!;
const stdKeys = new Set(plan.standard.map((s) => s.key));
assert.equal(inc.docs.filter((d) => stdKeys.has(d.key)).length, 3, "COI, PAN and TAN shared with the standard documents");
assert.deepEqual(timelineYears(xploro, today), [2023, 2024, 2025, 2026], "starts in the incorporation year");
console.log("ok - data room model");
