#!/usr/bin/env python3
"""Row-driven tie-out (D-029): a Journal snapshot against the dry run. Read-only, no network.

  python3 scripts/migration-journal-tieout.py <dir with tab-Journal.json, tab-Advances.json> data/migration/2026-09-17/rows

Prints a JSON summary; exits 1 on any difference. Snapshots: npx netlify-cli blobs:get books-cache "tab/Journal".
"""
import collections, datetime, json, os, sys

def cents(x): return int(round(float(x or 0) * 100))

def main(tabs, rows):
    snap = json.load(open(os.path.join(tabs, "tab-Journal.json")))
    J = [dict(zip(snap["headers"], r)) for r in snap["rows"]]
    adv = json.load(open(os.path.join(tabs, "tab-Advances.json")))
    A = [dict(zip(adv["headers"], r)) for r in adv["rows"]]
    exp = json.load(open(os.path.join(rows, "expected.json")))
    dry = {e["txn_id"]: e for e in json.load(open(os.path.join(rows, "entries.json"))) if not e.get("skip")}

    voided = {r["void_of"] for r in J if r.get("void_of")}
    live = [r for r in J if r["txn_id"] not in voided and not r.get("void_of")]
    got = collections.defaultdict(lambda: {"cents": 0, "lines": []})
    for r in live:
        if r["source"] != "migration": continue
        g = got[r["txn_id"]]; g["lines"].append(r)
        if r["line"] == 1: g["cents"] += cents(r["debit"]) - cents(r["credit"])   # line 1 is the cost side (a 1520 top-up too)

    diffs = []
    for t in sorted(set(dry) | set(got)):
        if t not in got: diffs.append([t, "missing from Journal"]); continue
        if t not in dry: diffs.append([t, "not in dry run"]); continue
        e, l = dry[t], min(got[t]["lines"], key=lambda x: x["line"])
        for k, want, have in (("amount", int(e["amount_cents"]), got[t]["cents"]), ("date", e["date"], str(l["date"])[:10]),
                              ("property", e["property"], l["property"]), ("payee", e["payee"], l["payee"]), ("account", e["account"], str(l["account"])),
                              ("doc_url", e["doc_url"] or "", l.get("doc_url") or "")):
            if want != have: diffs.append([t, k, want, have])
        if sum(cents(x["debit"]) - cents(x["credit"]) for x in got[t]["lines"]): diffs.append([t, "unbalanced"])

    by_prop = collections.defaultdict(int)
    for t, g in got.items(): by_prop[g["lines"][0]["property"]] += g["cents"]
    prop_diff = {p: by_prop.get(p, 0) - c for p, c in exp["by_property"].items() if by_prop.get(p, 0) != c}
    prop_diff.update({p: c for p, c in by_prop.items() if p not in exp["by_property"]})

    txns = {r["txn_id"] for r in live}
    orphans = [a["advance_id"] for a in A if a["source_txn_id"] not in txns]
    adv_txns = {a["source_txn_id"] for a in A}
    orphans += [t for t in {r["txn_id"] for r in live if r["source"] == "manual" and str(r["account"]) == "2010"} if t not in adv_txns]

    out = {
        "journal_snapshot": datetime.datetime.fromtimestamp(snap["fetchedAt"] / 1000).strftime("%Y-%m-%d %H:%M:%S"),
        "posted_at": sorted({str(g["lines"][0].get("posted_at")) for g in got.values()})[::max(1, len(got) - 1)],
        "entries": len(got), "entries_expected": exp["to_post"],
        "cents": sum(by_prop.values()), "cents_expected": exp["cents"], "difference_cents": sum(by_prop.values()) - exp["cents"],
        "by_property": dict(by_prop), "by_property_difference": prop_diff,
        "txn_ids_identical_to_dry_run": set(got) == set(dry),
        "debits_cents": sum(cents(r["debit"]) for r in live), "credits_cents": sum(cents(r["credit"]) for r in live),
        "linked": sum(1 for g in got.values() if g["lines"][0].get("doc_url")),
        "linked_expected": sum(1 for e in dry.values() if e["doc_url"]),
        "advances": len(A), "advance_orphans": orphans, "per_txn_differences": diffs,
    }
    print(json.dumps(out, indent=1))
    ok = not diffs and not prop_diff and not orphans and out["difference_cents"] == 0 and out["debits_cents"] == out["credits_cents"] \
        and out["entries"] == exp["to_post"]
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main(*sys.argv[1:3])
