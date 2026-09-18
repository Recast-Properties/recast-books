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
            "doc_url": (e.get("result") or {}).get("doc_url") or "", "gmail_url": e.get("gmailUrl") or "",
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
    # Cash Advances is the advances lane; "Sparkling for Title" duplicates 280 Sparkling RECONCILED
    # (audit section 2) - RECONCILED is the row source, the Title tab's two extra rows go to Paul.
    rows = biz + [r for r in prop if r["tab"] not in ("Cash Advances", "Sparkling for Title")]

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
    # Capacity: a receipt explains rows only up to its own total. Without it nineteen $200
    # payments to the same man all hang on one $500 receipt (2026-09-18) - and a wrong link is
    # worse than none. Rows are placed best match first; a row that does not fit tries its
    # next candidate, then settles for a weak one (weak never consumes capacity).
    cap = {d: (e["total"] + max(200, e["total"] * 3 // 100)) if e["total"] else max(e["amts"] or {0}) for d, e in env.items()}
    for x in A: cap[x["docId"]] = cap.get(x["docId"], 0) - x["old_cents"]
    cands = {}
    for r in rest:
        d0 = pd(r["date"]); c = []
        for d, e in docs:
            dd = abs((pd(e["date"] or "") or d0) - d0).days if pd(e["date"] or "") else 999
            if dd > 45: continue
            v = vendor_match(r["payee"], e); amt = r["cents"] in e["amts"]
            near = bool(e["total"]) and abs(e["total"] - r["cents"]) <= max(200, r["cents"] * 3 // 100)
            rank = (0, dd) if v and amt else (1, dd) if v and near else (2, dd) if amt and dd <= 20 else (3, dd) if v and dd <= 10 else None
            if rank: c.append((rank, d))
        if c: cands[r["_k"]] = sorted(c)
    row_doc = {}; rk0 = {r["_k"]: r for r in rest}
    for k in sorted(cands, key=lambda k: cands[k][0]):
        placed = False
        for rank, d0_ in cands[k]:
            d = survivor(d0_)   # a dismissed receipt that is not a twin is a candidate for Paul, never "documented"
            if rank[0] <= 1 and env[d]["verdict"] != "dismiss" and cap.get(d, 0) >= rk0[k]["cents"]:
                cap[d] -= rk0[k]["cents"]; row_doc[k] = (d, "strong"); placed = True; break
        if not placed: row_doc[k] = (survivor(cands[k][0][1]), "weak")
    # Rows that together equal a receipt: the old books split one receipt across rows (Shalom
    # Granite $3,558 + $4,950 = the $8,508 receipt). For a receipt no row has claimed yet, a
    # unique set of unplaced same-vendor rows within 45 days that sums to its total is strong.
    def exact_sets(items, target, cap=2):
        found = []
        def rec(i, left, chosen):
            if len(found) >= cap: return
            if left == 0 and len(chosen) >= 2: found.append(list(chosen)); return
            if i >= len(items) or left <= 0: return
            rec(i + 1, left - items[i][1], chosen + [items[i]]); rec(i + 1, left, chosen)
        rec(0, target, []); return found
    claimed = {d for d, s_ in row_doc.values() if s_ == "strong"} | used_docs
    for d, e in docs:
        if d in claimed or not e["total"] or e["verdict"] == "dismiss" or survivor(d) != d: continue
        pool = [(r["_k"], r["cents"]) for r in rest if row_doc.get(r["_k"], ("", "weak"))[1] != "strong" and r["cents"] > 0 and vendor_match(r["payee"], e)
                and pd(r["date"]) and pd(e["date"]) and abs((pd(r["date"]) - pd(e["date"])).days) <= 45][:18]
        sets = exact_sets(sorted(pool, key=lambda x: -x[1]), e["total"])
        if len(sets) == 1:
            for k, _c in sets[0]: row_doc[k] = (d, "strong")
            claimed.add(d)

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

    # ---- F. returns the old books netted (D-028): receipt total above the old rows it explains,
    # resolved to the line items that sum to the gap to the cent. One subset = the return.
    def subsets(items, target, cap=50):
        found = []
        def rec(i, left, chosen):
            if len(found) > cap: return
            if left == 0 and chosen: found.append(list(chosen)); return
            if i >= len(items) or left < 0: return
            rec(i + 1, left - items[i][1], chosen + [items[i]]); rec(i + 1, left, chosen)
        rec(0, target, []); return found
    F = []
    for x in A + B:
        rows_n = x.get("old_rows") or x.get("matched_rows") or 0
        gap = x["new_cents"] - x["old_cents"] if rows_n else 0
        if gap <= 0 or x["old_cents"] <= 0: continue
        e = env[x["docId"]]; items = [(l["desc"], l["cents"]) for l in e["lines"] if l["cents"] > 0]
        subs = subsets(items, gap) if items else []
        F.append({"docId": x["docId"], "date": x["date"], "vendor": x["vendor"], "receipt_cents": x["new_cents"], "old_cents": x["old_cents"],
                  "gap_cents": gap, "items": len(items), "subsets": len(subs),
                  "return_items": " + ".join(f"{d} {money(c)}" for d, c in subs[0]) if len(subs) == 1 else "",
                  "status": x["status"], "old_where": x["old_where"], # a gap larger than the old rows themselves is an incomplete match (a tool kept, a
                  # second old row the matcher missed), not a return - hold it
                  "resolution": "hold: old rows cover less than half" if gap > x["old_cents"] else "return inferred" if len(subs) == 1 else "hold: no subset" if not subs else f"hold: {len(subs)} subsets"})

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

    # ---- G. the row <-> document map (D-029): every old row, its document, how it was matched ----
    id_doc = {}
    for docId, e in env.items():
        for r in by_msg.get(e["msg"], []) if e["msg"] else []: id_doc.setdefault(r["_k"], docId)
    doc_rows = collections.defaultdict(list)
    for r in rows:
        d = id_doc.get(r["_k"]) or (row_doc.get(r["_k"], ("", ""))[0]); 
        if d and (r["_k"] in id_doc or row_doc[r["_k"]][1] == "strong"): doc_rows[d].append(r)
    Gm = []
    for r in rows:
        if r["_k"] in id_doc: d, how = id_doc[r["_k"]], "id"
        elif r["_k"] in row_doc: d, how = row_doc[r["_k"]]
        else: d, how = "", "none"
        e = env.get(d) or {}
        line = next((l for l in e.get("lines", []) if l["cents"] == r["cents"]), None) or (max(e.get("lines", []), key=lambda l: l["cents"]) if e.get("lines") else None)
        Gm.append({"key": r["_k"], "tab": r["tab"], "block": r.get("block") or "", "sheet_row": r.get("row", ""), "date": r.get("date") or "", "payee": r.get("payee") or "",
                   "desc": (r.get("desc") or "")[:80], "cents": r["cents"], "flags": json.dumps(r.get("flags") or []), "correction": r.get("correction") or "",
                   "match": how, "docId": d, "doc_vendor": e.get("vendor", ""), "doc_date": e.get("date", ""), "doc_total": e.get("total", ""), "doc_status": e.get("status", ""),
                   "doc_paid_from": e.get("paid_from", ""), "read_account": (line or {}).get("account", ""), "read_property": (line or {}).get("property", ""),
                   "doc_url": e.get("doc_url", ""), "gmail_url": e.get("gmail_url", ""),
                   "rows_on_doc": len(doc_rows.get(d, [])), "doc_gap_cents": (e.get("total", 0) - sum(x["cents"] for x in doc_rows[d])) if d in doc_rows and how != "weak" else ""})

    def w(name, recs):
        if not recs: open(os.path.join(a.out, name), "w").write(""); return
        with open(os.path.join(a.out, name), "w", newline="") as f:
            wr = csv.DictWriter(f, fieldnames=list(recs[0].keys())); wr.writeheader(); wr.writerows(recs)
    w("A-by-id.csv", A); w("B-by-match.csv", B); w("F-returns-inferred.csv", F); w("G-row-map.csv", Gm); w("C-uncovered-old-rows.csv", C); w("D-net-by-vendor-day.csv", D)

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
             f"## D · vendor-days where net differs: {len(D)}  (sum of diffs ${sum(x['diff_cents'] for x in D)/100:,.2f})",
             f"## F · receipts above the old rows they explain (D-028 returns): {len(F)}  {dict(collections.Counter(x['resolution'].split(':')[0] for x in F))}  inferred ${sum(x['gap_cents'] for x in F if x['resolution'] == 'return inferred')/100:,.2f}", "",
             "Largest net differences:"]
    for x in sorted(D, key=lambda x: -abs(x["diff_cents"]))[:25]:
        lines.append(f"- {x['date']} {x['vendor']:14s} old {money(x['old_cents']):>10} new {money(x['new_cents']):>10} diff {money(x['diff_cents']):>10}  rows {x['old_rows']} docs {x['docs']}")
    open(os.path.join(a.out, "README.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
