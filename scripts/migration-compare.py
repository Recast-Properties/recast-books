#!/usr/bin/env python3
"""Phase 4 comparison (BUILD-PLAN section 7, Phase 4 method step 4; D-024/D-025).

Reads the bookkeeper's envelopes (one JSON per document, downloaded from the
books-docs Blobs store) and the old-workbook inventories, and writes the
comparison report: per old row, which document covers it and whether the net
agrees; per document, which old rows it explains; and what neither side has.

Deterministic. No model, no network, writes only under the given --out dir.

  python3 scripts/migration-compare.py --env <dir of envelopes> \
      --inv data/migration/2026-09-17 --out data/migration/2026-09-17/comparison
"""
import argparse, collections, csv, datetime, glob, json, os, re

def money(c): return f"{c/100:,.2f}"
def pd(s):
    try: return datetime.date.fromisoformat(str(s)[:10])
    except Exception: return None
def norm_vendor(v):
    v = (v or "").lower()
    v = re.sub(r"[^a-z0-9 ]", " ", v)
    for k, n in (("home depot", "homedepot"), ("lowe", "lowes"), ("harbor fr", "harborfreight"), ("american airlines", "aa"),
                 ("uber", "uber"), ("anthropic", "anthropic"), ("corelogic", "corelogic"), ("cotality", "corelogic"),
                 ("netlify", "netlify"), ("apify", "apify"), ("adobe", "adobe"), ("microsoft", "microsoft"),
                 ("telnyx", "telnyx"), ("txu", "txu"), ("atmos", "atmos"), ("waxa", "waxahachie"), ("amazon", "amazon"),
                 ("southwest", "southwest"), ("alaska", "alaska"), ("vistaprint", "vistaprint"), ("shell", "shell"),
                 ("driversnote", "driversnote"), ("local government", "lgs"), ("secretary of state", "sos")):
        if k in v: return n
    return re.sub(r"\s+", " ", v).strip()[:20]

def load_envelopes(d):
    out = {}
    for f in glob.glob(os.path.join(d, "*.json")):
        try: e = json.load(open(f))
        except Exception: continue
        if not e.get("docId"): continue
        m = e.get("model") or {}
        lines = []
        for ent in m.get("entries") or []:
            for it in ent.get("items") or []:
                lines.append({"property": ent.get("property") or "OVERHEAD", "account": str(it.get("account") or ""),
                              "cents": int(it.get("amount_cents") or 0), "desc": (it.get("description") or "")[:80]})
        out[e["docId"]] = {
            "docId": e["docId"], "msg": e["docId"][3:] if e["docId"].startswith("gm-") else "",
            "status": e.get("status"), "verdict": m.get("verdict"), "vendor": m.get("vendor") or "",
            "date": m.get("date") or "", "total": int(m.get("receipt_total_cents") or 0),
            "paid_from": m.get("paid_from") or "", "invoice": m.get("invoice_number") or "",
            "holds": list((e.get("gate") or {}).get("reasons") or []), "subject": (e.get("subject") or "")[:60],
            "channel": e.get("channel") or "", "lines": lines, "posted": bool((e.get("result") or {}).get("txn_ids")),
            "why": (m.get("why") or "")[:160], "dup_of": m.get("duplicate_of") or "",
            # every amount the document shows: the read's total and lines, plus any $x.xx in the mail text
            "amts": {int(m.get("receipt_total_cents") or 0)} | {l["cents"] for l in lines}
                    | {int(round(float(x.replace(",", "")) * 100)) for x in re.findall(r"(\d{1,3}(?:,\d{3})*\.\d{2})", (e.get("subject") or "") + " " + (e.get("bodyText") or ""))},
            "blob": ((m.get("vendor") or "") + " " + (e.get("subject") or "") + " " + (e.get("from") or "") + " " + (e.get("bodyText") or "")[:600]).lower(),
        }
    return out

STOP = {"home", "check", "friend", "llc", "inc", "the", "and", "group", "store", "shop", "company"}
def vtoks(p): return [t for t in re.sub(r"[^a-z0-9 ]", " ", (p or "").lower()).split() if len(t) > 3 and t not in STOP]
def vendor_match(payee, e):
    a, b = norm_vendor(payee), norm_vendor(e["vendor"])
    if a and a == b: return True
    return any(t in e["blob"] for t in vtoks(payee))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--env", required=True); ap.add_argument("--inv", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    env = load_envelopes(a.env)
    biz = json.load(open(os.path.join(a.inv, "recast-biz-rows.json")))
    prop = json.load(open(os.path.join(a.inv, "property-rows.json")))
    for i, r in enumerate(biz): r["_k"] = f"BIZ-{i}"; r["cents"] = int(round((r.get("amt") or 0) * 100)); r["tab"] = "RECAST BIZ"
    for i, r in enumerate(prop): r["_k"] = f"PROP-{i}"; r["cents"] = int(round((r.get("amt") or 0) * 100)); r["block"] = r.get("block") or ""
    rows = biz + [r for r in prop if r["tab"] not in ("Cash Advances",)]

    by_msg = collections.defaultdict(list)
    for r in biz:
        if r.get("msg"): by_msg[r["msg"]].append(r)

    # ---- A. documents that carry an old-sheet id (exact, by Gmail id) ----------------
    A = []; used_rows = set(); used_docs = set()
    for docId, e in env.items():
        if e["msg"] and e["msg"] in by_msg:
            rs = by_msg[e["msg"]]; old = sum(r["cents"] for r in rs); new = e["total"] or sum(l["cents"] for l in e["lines"])
            old_props = sorted(set(r["tab"] for r in rs)); new_props = sorted(set(l["property"] for l in e["lines"]))
            A.append({"docId": docId, "date": e["date"], "vendor": e["vendor"], "old_rows": len(rs), "old_cents": old, "new_cents": new,
                      "diff_cents": new - old, "old_where": ";".join(f"{r['tab']}/{r['block']}" for r in rs), "new_where": ";".join(new_props),
                      "status": e["status"], "verdict": e["verdict"], "holds": ",".join(e["holds"]), "paid_from": e["paid_from"]})
            used_rows.update(r["_k"] for r in rs); used_docs.add(docId)

    # ---- twins: the same receipt arriving twice (original + Paul's forward, or a re-send).
    # Keyed on vendor + invoice number, or vendor + date + total when there is no invoice.
    # The copy that carries the old-sheet id wins; the other is reported as its twin, never
    # as "in mail, not in old books". (The gate's own invoice-number rail refuses the twin
    # at post time; this just keeps the report honest.)
    twin_of = {}
    seen = {}
    for docId, e in sorted(env.items(), key=lambda kv: (kv[1]["msg"] not in by_msg, kv[0])):
        if e["verdict"] == "dismiss": continue
        k = (norm_vendor(e["vendor"]), e["invoice"].strip().lower()) if e["invoice"].strip() else (norm_vendor(e["vendor"]), e["date"], e["total"])
        if k in seen and k[0]: twin_of[docId] = seen[k]
        else: seen[k] = docId
    B = [{"docId": d, "date": env[d]["date"], "vendor": env[d]["vendor"], "new_cents": env[d]["total"], "matched_rows": 0, "old_cents": 0, "diff_cents": "",
          "old_where": "", "new_where": "", "status": env[d]["status"], "verdict": env[d]["verdict"], "holds": ",".join(env[d]["holds"]), "paid_from": env[d]["paid_from"],
          "subject": env[d]["subject"], "bucket": f"twin of {t}", "weak_candidates": ""} for d, t in twin_of.items() if d not in used_docs]
    used_docs.update(d for d in twin_of if d not in used_docs)
    # ---- B. documents without a sheet id: match old rows to documents -----------------------
    # The forensic rule (D-024): every old row is matched to its document. Rows were typed
    # from receipts days or weeks after the purchase, often split by trade block, so one
    # document may explain several rows and the window is wide. A twin the model dismissed
    # as duplicate_of X is credited to X. Strong = vendor and amount agree; weak = only one
    # of them does (reported as a candidate for Paul, never counted as documented).
    def survivor(d):
        # duplicate_of is a docId, or a txn_id from a run whose Journal is gone (reads happen once,
        # D-025): then the original is the live document with the same vendor and the id's date.
        seen = set()
        while env[d]["dup_of"] and d not in seen:
            seen.add(d); dup = env[d]["dup_of"]
            if dup in env: d = dup; continue
            m = re.match(r"^[a-z]+-(\d{4})(\d{2})(\d{2})-", dup)
            if not m: break
            ymd = "-".join(m.groups()); e = env[d]
            cands = [x for x, y in env.items() if x != d and y["date"] == ymd and norm_vendor(y["vendor"]) == norm_vendor(e["vendor"])]
            cands.sort(key=lambda x: (env[x]["verdict"] == "dismiss", env[x]["total"] != e["total"], x))
            if not cands: break
            d = cands[0]
        return d
    rest = [r for r in rows if r["_k"] not in used_rows and r.get("date")]
    docs = [(d, e) for d, e in env.items() if e["date"]]
    row_doc = {}
    for r in rest:
        d0 = pd(r["date"]); best = None
        for d, e in docs:
            dd = abs((pd(e["date"] or "") or d0) - d0).days if pd(e["date"] or "") else 999
            if dd > 45: continue
            v = vendor_match(r["payee"], e); amt = r["cents"] in e["amts"]
            near = bool(e["total"]) and abs(e["total"] - r["cents"]) <= max(200, r["cents"] * 3 // 100)
            rank = (0, dd) if v and amt else (1, dd) if v and near else (2, dd) if amt and dd <= 20 else (3, dd) if v and dd <= 10 else None
            if rank and (best is None or rank < best[0]): best = (rank, d)
        if best:
            d = survivor(best[1])   # a dismissed receipt that is not a twin is a candidate for Paul, never "documented"
            row_doc[r["_k"]] = (d, "strong" if best[0][0] <= 1 and env[d]["verdict"] != "dismiss" else "weak")
    by_doc = collections.defaultdict(list)
    for k, (d, s) in row_doc.items(): by_doc[d].append((k, s))
    rk = {r["_k"]: r for r in rows}
    for docId, e in env.items():
        if docId in used_docs:   # an A document or a twin's survivor also explains these rows
            used_rows.update(k for k, s in by_doc.get(docId, []) if s == "strong"); continue
        hit = [rk[k] for k, s in by_doc.get(docId, []) if s == "strong"]
        weak = [rk[k] for k, s in by_doc.get(docId, []) if s == "weak"]
        old = sum(r["cents"] for r in hit); new = e["total"] or sum(l["cents"] for l in e["lines"])
        B.append({"docId": docId, "date": e["date"], "vendor": e["vendor"], "new_cents": new, "matched_rows": len(hit), "old_cents": old,
                  "diff_cents": new - old if hit else "", "old_where": ";".join(f"{r['tab']}/{r['block']}" for r in hit),
                  "new_where": ";".join(sorted(set(l["property"] for l in e["lines"]))), "status": e["status"], "verdict": e["verdict"],
                  "holds": ",".join(e["holds"]), "paid_from": e["paid_from"], "subject": e["subject"],
                  "bucket": "manual row now documented" if hit and any(r["_k"].startswith("BIZ") for r in hit)
                            else "property row now documented" if hit else ("junk (dismissed)" if e["verdict"] == "dismiss" else "in mail, not in old books"),
                  "weak_candidates": ";".join(f"{r['tab']}/{r['payee'][:20]}/{money(r['cents'])}" for r in weak)})
        used_rows.update(r["_k"] for r in hit); used_docs.add(docId)

    # ---- C. old rows nothing covers ------------------------------------------------------
    C = [{"key": r["_k"], "tab": r["tab"], "block": r.get("block", ""), "date": r.get("date", ""), "payee": r.get("payee", ""), "cents": r["cents"],
          "desc": (r.get("desc") or "")[:60], "had_msg": bool(r.get("msg")),
          "candidate_doc": row_doc.get(r["_k"], ("", ""))[0], "candidate_vendor": env[row_doc[r["_k"]][0]]["vendor"] if r["_k"] in row_doc else "",
          "candidate_status": env[row_doc[r["_k"]][0]]["status"] if r["_k"] in row_doc else ""} for r in rows if r["_k"] not in used_rows]

    # ---- D. net per vendor per day (the rule from BUILD-PLAN: never line by line) --------
    net = collections.defaultdict(lambda: [0, 0, 0, 0])   # old cents, new cents, old rows, docs
    for r in rows:
        if r["tab"] == "RECAST BIZ" or r["tab"] not in ("Cash Advances",):
            k = (norm_vendor(r["payee"]), r.get("date", "")); net[k][0] += r["cents"]; net[k][2] += 1
    for e in env.values():
        if e["verdict"] in ("post", "hold", None) and e["status"] != "dismissed":
            k = (norm_vendor(e["vendor"]), e["date"]); net[k][1] += e["total"] or sum(l["cents"] for l in e["lines"]); net[k][3] += 1
    doc_vendors = set(norm_vendor(e["vendor"]) for e in env.values())
    # Only vendor-days where a document exists on either side of the comparison: contractor
    # rows paid by check/Zelle have no receipt by nature and are migration entries, not gaps.
    D = [{"vendor": k[0], "date": k[1], "old_cents": v[0], "new_cents": v[1], "diff_cents": v[1] - v[0], "old_rows": v[2], "docs": v[3]}
         for k, v in sorted(net.items(), key=lambda kv: (kv[0][1], kv[0][0])) if v[0] != v[1] and (v[3] > 0 or k[0] in doc_vendors)]

    def w(name, recs):
        if not recs: open(os.path.join(a.out, name), "w").write(""); return
        with open(os.path.join(a.out, name), "w", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=list(recs[0].keys())); wr.writeheader(); wr.writerows(recs)
    w("A-by-id.csv", A); w("B-by-match.csv", B); w("C-uncovered-old-rows.csv", C); w("D-net-by-vendor-day.csv", D)

    # ---- summary ----------------------------------------------------------------------
    st = collections.Counter(e["status"] for e in env.values()); vd = collections.Counter(e["verdict"] for e in env.values())
    hold = collections.Counter(h for e in env.values() for h in e["holds"])
    Aexact = sum(1 for x in A if x["diff_cents"] == 0); Bb = collections.Counter(x["bucket"].split(" of ")[0] for x in B)
    Cc = collections.Counter((x["tab"], x["had_msg"]) for x in C); Cw = sum(1 for x in C if x["candidate_doc"])
    reroute = sum(1 for x in A if x["old_where"] and x["new_where"] and x["old_where"].split("/")[0] != x["new_where"].split(";")[0]
                  and not (x["old_where"].startswith("RECAST BIZ") and x["new_where"] == "OVERHEAD"))
    lines = [f"# Phase 4 comparison — {datetime.date.today().isoformat()}", "",
             f"Documents: {len(env)}  status {dict(st)}  verdict {dict(vd)}", f"Hold reasons: {hold.most_common()}", "",
             f"## A · documents with an old-sheet id: {len(A)}  (net equal: {Aexact}; net differs: {len(A)-Aexact}; property differs from old tab: {reroute})",
             f"## B · documents matched by vendor/date/amount: {len(B)}  {dict(Bb)}",
             f"## C · old rows nothing covers: {len(C)}  (with a weak candidate document: {Cw})  by (tab, had a message id): {dict(Cc)}",
             f"## D · vendor-days where net differs: {len(D)}  (sum of diffs ${sum(x['diff_cents'] for x in D)/100:,.2f})", "",
             "Largest net differences:"]
    for x in sorted(D, key=lambda x: -abs(x["diff_cents"]))[:25]:
        lines.append(f"- {x['date']} {x['vendor']:14s} old {money(x['old_cents']):>10} new {money(x['new_cents']):>10} diff {money(x['diff_cents']):>10}  rows {x['old_rows']} docs {x['docs']}")
    open(os.path.join(a.out, "README.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
