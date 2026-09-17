#!/usr/bin/env python3
"""Turn Paul's migration review rules (docs/decisions.md D-026) into repost overrides.

Reads the downloaded envelopes and the comparison CSVs, writes one
books-repost-<mailbox>.json per mailbox: {"overrides": {docId: {paid_from?, property?,
verdict?, note?}}}. `repostAll` (apps-script/poller/Listing.gs) hands each document's
entry to /api/inbox repost-all, which the ingest applies to the STORED read (D-025).

Deterministic; every override names the rule that produced it. No model, no network.

  python3 scripts/migration-rules.py --env <envelopes dir> --cmp data/migration/2026-09-17/comparison --out <dir>
"""
import argparse, collections, csv, datetime, glob, json, os, re

PERSONAL_CARDS = {"6774", "3746", "7952", "9179", "7274", "9166"}   # D-026 rule 1
CNB_OPENED = "2026-08-01"                                          # D-026 rule 2
AIRPORT = re.compile(r"\b(airport|terminal|DFW|PDX|DAL|LAX|DEN|PIA|SEA|Love Field)\b", re.I)
UTILITY = re.compile(r"atmos|txu|waxahachie|energy texas|rhythm|ovilla|corsicana water|water|electric|gas bill", re.I)
BILL_SUBJ = re.compile(r"bill (is|s)? ?(ready|available|due)|set for auto ?pay|statement", re.I)
PAY_SUBJ = re.compile(r"payment|paid|received your payment|payment's complete", re.I)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--env", required=True); ap.add_argument("--cmp", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    env = {}
    for f in glob.glob(os.path.join(a.env, "*.json")):
        try: e = json.load(open(f))
        except Exception: continue
        if e.get("docId"): env[e["docId"]] = e

    # old-books property attribution, from the comparison (A by id, B by match)
    old_prop = {}
    for name in ("A-by-id.csv", "B-by-match.csv"):
        p = os.path.join(a.cmp, name)
        if not os.path.exists(p) or os.path.getsize(p) == 0: continue
        for r in csv.DictReader(open(p)):
            tabs = [w.split("/")[0] for w in (r.get("old_where") or "").split(";") if w]
            tabs = [t for t in tabs if t and t != "RECAST BIZ"]
            if len(set(tabs)) == 1:
                t = tabs[0].replace(" RECONCILED", "").replace("Sparkling for Title", "280 Sparkling")
                old_prop[r["docId"]] = t

    by_mailbox = collections.defaultdict(dict); counts = collections.Counter()
    util_seen = {}   # (vendor, amount) -> docId of the payment, for rule 5
    for docId, e in sorted(env.items(), key=lambda kv: (kv[1].get("model") or {}).get("date") or ""):
        m = e.get("model") or {}
        if not m.get("verdict"): continue
        mailbox = "properties" if (e.get("channel") not in ("receipts", "travel", "upload", None)) else "paul"
        o = {}; notes = []
        reason = m.get("paid_from_reason") or ""; card = re.findall(r"(?:ending|x-?|\*+)\s?(\d{4})", reason)
        pf = m.get("paid_from") or "UNKNOWN"; date = m.get("date") or ""
        if pf == "UNKNOWN":
            if any(c in PERSONAL_CARDS for c in card): o["paid_from"] = "PAUL"; notes.append("D-026.1 personal card " + ",".join(c for c in card if c in PERSONAL_CARDS))
            elif date and date < CNB_OPENED: o["paid_from"] = "PAUL"; notes.append("D-026.2 before CNB opened")
            # else: stays held for Paul (rule 2, August onward)
        if docId in old_prop:
            cur = sorted(set((x.get("property") or "OVERHEAD") for x in m.get("entries") or []))
            if cur != [old_prop[docId]]: o["property"] = old_prop[docId]; notes.append("D-026.3 old tab " + old_prop[docId])
        vendor = (m.get("vendor") or "").lower(); subj = e.get("subject") or ""
        if "uber" in vendor and "eats" not in vendor and "[personal]" in subj.lower() and m.get("verdict") == "post":
            text = " ".join([subj] + [x.get("memo") or "" for x in m.get("entries") or []] + [i.get("description") or "" for x in m.get("entries") or [] for i in x.get("items") or []])
            if not AIRPORT.search(text): o["verdict"] = "dismiss"; notes.append("D-026.4 personal ride, not an airport run")
        if UTILITY.search(vendor) and m.get("verdict") == "post":
            key = (re.sub(r"[^a-z]", "", vendor)[:10], m.get("receipt_total_cents") or 0)
            if BILL_SUBJ.search(subj) and not PAY_SUBJ.search(subj):
                if key in util_seen: o["verdict"] = "dismiss"; notes.append(f"D-026.5 bill; payment {util_seen[key]} already read")
                else: util_seen[key] = docId   # provisional: a later payment supersedes it
            else:
                prev = util_seen.get(key)
                if prev and prev != docId and prev in by_mailbox["paul"] | by_mailbox["properties"] or prev:
                    # the earlier bill for the same amount becomes the twin of this payment
                    for mb in by_mailbox.values():
                        if prev in mb: mb[prev] = {**mb[prev], "verdict": "dismiss", "note": (mb[prev].get("note", "") + f"; D-026.5 bill superseded by payment {docId}").strip("; ")}
                    if prev not in by_mailbox["paul"] and prev not in by_mailbox["properties"]:
                        by_mailbox["properties" if (env[prev].get("channel") not in ("receipts", "travel", "upload", None)) else "paul"][prev] = {"verdict": "dismiss", "note": f"D-026.5 bill superseded by payment {docId}"}
                util_seen[key] = docId
        if o:
            o["note"] = "; ".join(notes); by_mailbox[mailbox][docId] = o
            for n in notes: counts[n.split(" ")[0]] += 1
    for mailbox, ov in by_mailbox.items():
        json.dump({"mailbox": mailbox, "built": datetime.datetime.now().isoformat(timespec="minutes"), "overrides": ov}, open(os.path.join(a.out, f"books-repost-{mailbox}.json"), "w"), indent=0)
        print(mailbox, "overrides:", len(ov))
    print("by rule:", dict(counts))

if __name__ == "__main__":
    main()
