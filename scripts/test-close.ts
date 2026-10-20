import assert from "node:assert/strict";
import { buildPlan } from "../lib/master/engine";
import { canPublish, canSubmit, monthView, tickKey, ymAdd, misKey } from "../lib/close/state";
import { data as d, xploro as answers } from "./fixture";

const plan = buildPlan(answers, d, new Date("2026-10-20"));
const today = new Date("2026-10-20");
const files = new Set<string>();
const has = (k: string, p: string) => files.has(`${k}|${p}`);
const mk = (ym: string, over: Partial<Parameters<typeof monthView>[0]> = {}) => monthView({ ym, today, trackFrom: "2026-04", plan, has, submitted: false, published: false, ...over });

assert.equal(mk("2026-11").state, "upcoming");
assert.equal(mk("2026-10").state, "open");
assert.equal(mk("2026-03").state, "untracked");
assert.equal(mk("2026-08").state, "late");                       // ended, nothing in, past the 3rd
assert.equal(mk("2026-09").state, "late");
assert.equal(mk("2026-09", { submitted: true }).state, "submitted");
assert.equal(mk("2026-09", { submitted: true, published: true }).state, "published");
assert.equal(mk("2026-09", { published: true, trackFrom: "2026-10" }).state, "untracked");   // before the tracking start wins

// Fill September completely: ready, then each missing piece blocks it again.
const v = mk("2026-09"); assert.ok(v.total > 5 && !v.ready);
const all = [...v.docs, ...v.books].map((r) => r.key).concat(v.filings.flatMap((f) => f.ticks.map((t) => tickKey(f.key, t))), [misKey]);
all.forEach((k) => files.add(`${k}|2026-09`));
assert.ok(mk("2026-09").ready && mk("2026-09").state === "collecting");
for (const k of [misKey, v.books[0]?.key, v.filings[0] && tickKey(v.filings[0].key, v.filings[0].ticks[0])].filter(Boolean) as string[]) {
  files.delete(`${k}|2026-09`); assert.ok(!mk("2026-09").ready, `missing ${k} must block`); files.add(`${k}|2026-09`);
}
const must = v.docs.find((r) => r.tier === "mandatory"); if (must) { files.delete(`${must.key}|2026-09`); assert.ok(!mk("2026-09").ready); files.add(`${must.key}|2026-09`); }
const good = v.docs.find((r) => r.tier !== "mandatory"); if (good) { files.delete(`${good.key}|2026-09`); assert.ok(mk("2026-09").ready, "good-to-have never blocks"); files.add(`${good.key}|2026-09`); }

// Submit and publish rules.
const ready = mk("2026-09");
assert.equal(canSubmit("external", "firm", ready, "2026-09", today), null);
assert.match(canSubmit("founder", "firm", ready, "2026-09", today)!, /books/);
assert.match(canSubmit("external", "firm", mk("2026-10"), "2026-10", today)!, /before it ends/);
assert.match(canSubmit("pba", "firm", ready, "2026-09", today)!, /external practitioner/);
assert.equal(canSubmit("pba", "pba", ready, "2026-09", today), null);
assert.match(canPublish("external", null, "u1")!, /Only Prime Bottomline/);
assert.match(canPublish("pba", "u1", "u1")!, /someone else/);
assert.equal(canPublish("pba", "u2", "u1"), null);
assert.equal(ymAdd("2026-12", 1), "2027-01");
console.log("ok - monthly close: states, close conditions, submit and publish rules");
