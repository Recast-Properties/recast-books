# Policies

Written rules the agent cites and a human can audit. "Claude decided this was
capitalized" is not a defense; "the policy says X, confidence was high, Paul approved"
is.

---

## Autofile gate

An item files automatically only when **all** hold:

1. `confidence == "high"`
2. Valid category
3. `amount > 0`
4. Vendor and date present
5. Line items sum to the receipt's stated pre-tax subtotal (±0.5%)
6. **`amount <= <ceiling>`** ← NEW, not yet set
7. **Account is not 6700, 6710 or 6720** ← NEW (§274(d) categories need a human)

Conditions 1–5 are live today. 6 and 7 are additions from the 2026-08-26 review.

**Condition 6 is urgent and cheap.** Today a $13,500 charge can file itself on
self-reported confidence alone. It is one comparison in code that is already deployed.
Ceiling value needs picking with Paul — the review declined to invent one.

Everything failing the gate waits in Pending with the bookkeeper's why-note.

### What confidence is and is not

Self-reported confidence is a weak control. It is a model's estimate of its own
correctness, which is exactly the thing a wrong model is wrong about. The real controls
in the list above are #5 (arithmetic, verifiable) and #6 (a hard ceiling). Do not let
confidence carry more weight than it can.

---

## 1099 / W-9

- **Threshold: $2,000 for 2026-forward** (raised from $600 by the One Big Beautiful
  Bill Act). **$600 for prior years.** Both live in a named cell, not in code.
- **W-9 requested at first dollar**, not at threshold. The threshold monitor is a
  lagging indicator — by the time it fires, the money is gone.
- **Payment-side block, not a warning:** a GL row flagged `is_1099` whose vendor has no
  TIN cannot be appended. Either 24% is withheld to 2020, or an override is recorded
  with a reason and a date.
- **IRS TIN matching before filing.** A mismatched TIN produces a B-notice and reopens
  the withholding obligation.
- **Corporations generally exempt; attorneys never.** An LLC is whatever box it checked
  on the W-9 — the name tells you nothing. Chinos LLC at $13,500 rides on the form, not
  on an assumption.
- **Payments made by Dennis on the LLC's behalf still count** toward the LLC's
  obligation. They are on the cash-advance tab, which Phase 2a must parse.

---

## Capitalize vs. expense

> Provisional — depends on Q-3 (dealer vs investor).

- Costs attributable to a specific property while held → 1000s, `Inventory (held)`
- Company overhead not attributable to a property → 6000s, `Expense`
- On settlement date → the property's whole 1000s balance moves to 5000, `COGS (released)`
- Sub-ceiling tools and equipment → 6510, if Q-7's de minimis election is made
- Over the ceiling → 7000, depreciation schedule

**The failure mode this exists to prevent:** rehab materials landing in overhead.
The current sheet has an irrigation riser and an epoxy wood-repair kit in the RECAST BIZ
Materials block. Both are property costs. The receipts automation has no property
routing yet, so it defaults everything to overhead — which is structurally biased
against this policy until Phase 5 lands.

---

## Model tiering

Tier on **what a mistake costs**, not on how often the job runs.

The instinct is to put the cheap model on high-volume mechanical work. But
capitalize-vs-expense is mechanical *and* the most expensive call to get wrong, because
it compounds silently across a whole year before anyone sees it.

**Golden set:** 30 receipts with known-correct answers, re-run whenever the model or
prompt changes. Without one, a silent regression looks exactly like a normal week.

---

## What never gets automated

- Any arithmetic — totals, tie-outs, roll-ups
- The duplicate gate and the append itself
- Anything above the autofile ceiling
- §274(d) categories (travel, meals, gifts)
- The verification layer, which must be able to contradict the agent
