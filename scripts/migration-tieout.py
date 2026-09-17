#!/usr/bin/env python3
"""Phase 4 tie-out per property (BUILD-PLAN section 7, step 5; D-024/D-025).

Old side: the property tabs (property-rows.json, corrections applied) and RECAST BIZ.
New side: the staging Journal snapshot (books-cache tab/Journal), receipt lane only.
The gap between them is explained, per property, by what the bookkeeper holds in
Pending, what errored, and the old rows no document covers (comparison report C).

Deterministic. No model, no network.

  python3 scripts/migration-tieout.py --journal <tab-Journal.json> --env <envelope dir> \
      --inv data/migration/2026-09-17 --cmp data/migration/2026-09-17/comparison \
      --out data/migration/2026-09-17/tieout
"""
import argparse, collections, csv, datetime, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from importlib import import_module
load_envelopes = import_module("migration-compare").load_envelopes

TAB_TO_PROP = {"1616 Granite RECONCILED": "1616 Granite", "280 Sparkling RECONCILED": "280 Sparkling",
               "Sparkling for Title": "280 Sparkling", "RECAST BIZ": "OVERHEAD"}
SKIP_TABS = {"Cash Advances"}                       # advances lane (D-011/D-022), not receipts
PAY_SIDE = ("14", "15", "20")                       # cash, prepaid, liabilities: the credit side of a receipt
def money(c): return f"{c/100:,.2f}"

def main():
    ap = argparse.ArgumentParser()
    for k in ("journal", "env", "inv", "cmp", "out"): ap.add_argument("--" + k, required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)

    # old side
    old = collections.defaultdict(int); old_n = collections.Counter(); corrections = collections.defaultdict(list)
    rows = json.load(open(os.path.join(a.inv, "property-rows.json"))) + \
           [dict(r, tab="RECAST BIZ") for r in json.load(open(os.path.join(a.inv, "recast-biz-rows.json")))]
    for r in rows:
        if r["tab"] in SKIP_TABS: continue
        p = TAB_TO_PROP.get(r["tab"], r["tab"]); old[p] += int(round((r.get("amt") or 0) * 100)); old_n[p] += 1
        if r.get("correction"): corrections[p].append(r["correction"])

    # new side: staging Journal, receipt lane, cost side of each entry
    j = json.load(open(a.journal)); H = j["headers"]; J = [dict(zip(H, r)) for r in j["rows"]]
    voided = {r["void_of"] for r in J if r.get("void_of")}
    posted = collections.defaultdict(int); posted_txns = collections.defaultdict(set)
    for r in J:
        if r.get("source") != "receipt" or r["txn_id"] in voided or r.get("void_of"): continue
        if str(r["account"])[:2] in PAY_SIDE: continue
        posted[r["property"]] += int(round((float(r["debit"] or 0) - float(r["credit"] or 0)) * 100)); posted_txns[r["property"]].add(r["txn_id"])

    # envelopes: what is not in the Journal yet, by the property the model chose
    env = load_envelopes(a.env)
    pend = collections.defaultdict(int); pend_n = collections.Counter(); holds = collections.defaultdict(collections.Counter)
    err = collections.defaultdict(int); err_n = collections.Counter()
    for e in env.values():
        if e["status"] not in ("pending", "error"): continue
        by = collections.defaultdict(int)
        for l in e["lines"]: by[l["property"]] += l["cents"]
        if not by: by["(unread)" if e["status"] == "error" else "(no entry)"] = e["total"]
        for p, c in by.items():
            if e["status"] == "pending":
                pend[p] += c; pend_n[p] += 1
                for h in e["holds"]: holds[p][h] += 1
            else: err[p] += c; err_n[p] += 1

    # comparison report C: old rows nothing covers
    unc = collections.defaultdict(int); unc_n = collections.Counter()
    for r in csv.DictReader(open(os.path.join(a.cmp, "C-uncovered-old-rows.csv"))):
        if r["tab"] in SKIP_TABS: continue
        p = TAB_TO_PROP.get(r["tab"], r["tab"]); unc[p] += int(r["cents"]); unc_n[p] += 1

    props = sorted(set(old) | set(posted) | set(pend) | set(err), key=lambda p: (p.startswith("("), p == "OVERHEAD", p))
    out = []
    for p in props:
        residual = old[p] - posted[p] - pend[p] - err[p] - unc[p]
        out.append({"property": p, "old_rows": old_n[p], "old_cents": old[p], "posted_txns": len(posted_txns[p]), "posted_cents": posted[p],
                    "pending_docs": pend_n[p], "pending_cents": pend[p], "error_docs": err_n[p], "error_cents": err[p],
                    "uncovered_rows": unc_n[p], "uncovered_cents": unc[p], "residual_cents": residual,
                    "top_holds": "; ".join(f"{h} {n}" for h, n in holds[p].most_common(4)), "corrections": " | ".join(corrections[p])})
    with open(os.path.join(a.out, "tieout-by-property.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)

    tot = {k: sum(x[k] for x in out) for k in ("old_cents", "posted_cents", "pending_cents", "error_cents", "uncovered_cents", "residual_cents")}
    lines = [f"# Phase 4 tie-out by property — {datetime.date.today().isoformat()}", "",
             "old = property tab total (corrections applied, Cash Advances excluded); posted = staging Journal receipt lane, cost side;",
             "pending/error = documents not yet in the Journal, at the model's amounts and property; uncovered = old rows no document covers (report C).",
             "residual = old − posted − pending − error − uncovered: what neither side explains (twins, dismissed-by-rule, amounts the model read differently).", "",
             "| property | old rows | old $ | posted txns | posted $ | pending docs | pending $ | error docs | error $ | uncovered rows | uncovered $ | residual $ | top holds |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|"]
    for x in out:
        lines.append(f"| {x['property']} | {x['old_rows']} | {money(x['old_cents'])} | {x['posted_txns']} | {money(x['posted_cents'])} | {x['pending_docs']} | {money(x['pending_cents'])} | "
                     f"{x['error_docs']} | {money(x['error_cents'])} | {x['uncovered_rows']} | {money(x['uncovered_cents'])} | {money(x['residual_cents'])} | {x['top_holds']} |")
    lines.append(f"| **total** | {sum(x['old_rows'] for x in out)} | {money(tot['old_cents'])} | | {money(tot['posted_cents'])} | {sum(x['pending_docs'] for x in out)} | {money(tot['pending_cents'])} | "
                 f"{sum(x['error_docs'] for x in out)} | {money(tot['error_cents'])} | {sum(x['uncovered_rows'] for x in out)} | {money(tot['uncovered_cents'])} | {money(tot['residual_cents'])} | |")
    if any(corrections.values()):
        lines += ["", "Corrections applied to the old side:"] + [f"- {p}: {c}" for p, cs in corrections.items() for c in cs]
    open(os.path.join(a.out, "README.md"), "w").write("\n".join(lines) + "\n"); print("\n".join(lines))

if __name__ == "__main__":
    main()
