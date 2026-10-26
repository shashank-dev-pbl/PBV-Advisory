import assert from "node:assert/strict";
import { can, canEditPrices, canPay, canSee, fixedPrice, gstOf, rup, stepOf, suggestQuote, withGst, type LegalType } from "../lib/legal/model";
const t = (o: Partial<LegalType>): LegalType => ({ id: "x", kind: "review", name: "x", price: 8000, quote_from: null, days: 3, pages_covered: 20, unit_note: null, what_it_is: "", when_needed: "", what_you_get: "", ...o });
assert.equal(rup(10620), "₹10,620"); assert.equal(withGst(9000), 10620); assert.equal(gstOf(9000), 1620);
// fixed price only when within the pages covered; otherwise a quote
assert.equal(fixedPrice(t({}), 14), 8000); assert.equal(fixedPrice(t({}), 26), null); assert.equal(fixedPrice(t({}), null), null);
assert.equal(fixedPrice(t({ pages_covered: null, kind: "draft" }), null), 3000 * 0 + 8000); assert.equal(fixedPrice(t({ price: null }), 5), null);
assert.equal(suggestQuote(t({}), 26), 10500, "a 26-page file against 20 covered pages, rounded to 500");
// who can do what
assert.equal(canSee("external"), false); assert.equal(can("external", "pay", "pay"), false); assert.equal(can("external", "quote", "note"), false);
assert.equal(canPay("founder"), true); assert.equal(canPay("admin"), true); assert.equal(canPay("pba"), false);
assert.equal(can("pba", "quote", "price"), true); assert.equal(can("founder", "quote", "price"), false);
assert.equal(can("founder", "pay", "pay"), true); assert.equal(can("pba", "pay", "pay"), false);
assert.equal(can("pba", "progress", "propose_extra"), true); assert.equal(can("founder", "progress", "propose_extra"), false);
assert.equal(can("founder", "extra", "approve_extra"), true); assert.equal(can("pba", "extra", "approve_extra"), false);
assert.equal(can("pba", "progress", "deliver"), true); assert.equal(can("founder", "progress", "deliver"), false); assert.equal(can("pba", "extra", "deliver"), false, "no delivering while an extra waits");
assert.equal(can("founder", "extra", "download_finished"), false, "locked while an extra is unpaid"); assert.equal(can("founder", "done", "download_finished"), true);
assert.equal(canEditPrices("admin"), true); assert.equal(canEditPrices("pba"), false);
assert.equal(stepOf("quote"), 1); assert.equal(stepOf("done"), 6);
console.log("ok - legal rules");
