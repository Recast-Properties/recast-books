#!/usr/bin/env python3
"""Phase 4, row-driven migration (D-029): DRY RUN. Posts nothing.

Reads the row <-> document map (comparison/G-row-map.csv) and writes, under --out:
  entries.csv / entries.json   one entry per old row: the row's date, amount, property and
                               block as Paul typed them; account from the matched read, else
                               the block map below; the receipt link; flags
  list-1-differences.csv       receipts whose total differs from the rows they explain
                               (D-028: return or omitted item - Paul decides; or rows > receipt)
  list-2-confirm-match.csv     rows with only a weak candidate document - Paul confirms
  list-3-no-document.csv       rows with no document anywhere (NO_DOC, proven in Phase 3)
  list-4-in-mail-not-in-books.csv   documents that match no old row - review, not postings
  list-5-questions.csv         rows the rules cannot settle (payer unknown, Dennis-paid rows
                               vs the Advances already registered)
  README.md                    totals by property against the inventory (exact by construction)

Deterministic. No model, no network.
  python3 scripts/migration-rows.py --inv data/migration/2026-09-17 \
      --cmp data/migration/2026-09-17/comparison --out data/migration/2026-09-17/rows
"""
import argparse, collections, csv, hashlib, json, os, re

TAB_TO_PROP = {"1616 Granite RECONCILED": "1616 Granite", "280 Sparkling RECONCILED": "280 Sparkling", "RECAST BIZ": "OVERHEAD"}
RETAIL = ("home depot", "lowe", "amazon", "floor", "wayfair", "wayfiar", "sherwin", "harbor", "walmart", "ebay", "seconds", "mccoy", "myknobs",
          "barker", "architect", "leslie", "menards", "ace ", "tractor", "50 floor", "50floor", "build.com", "ferguson", "ups store")
UTIL = ("txu", "atmos", "energy", "water", "city of ovilla", "city of red oak", "city of waxahachie", "electric co", "rocket", "gexa", "reliant")
def money(c): return f"{c/100:,.2f}"
def has(s, words): s = (s or "").lower(); return any(w in s for w in words)

# Block -> account when there is no read to take it from. Judgment, written down once
# (Claude decides, code executes): every line says where its account came from.
HEAVY = {"Insurance - Farmers Insurance": "1110", "Utilities": "1120", "Appliances": "1040", "Countertops & Backsplash": "1040",
         "Marketing": "1330", "Pest Control": "1130", "Equipment Rentals": "1030", "Trash": "1060", "Gas/Truck/Trailer": "6600"}
BIZ = {"Tools": "6510", "Travel": "6700", "Subscriptions": "6400", "Gas/Truck/Trailer": "6600", "Business": "6900", "Marketing": "6000",
       "Website": "6410", "Meals": "6710", "Office": "6500", "Materials": "6500", "Interest": "6930"}

def account_for(r, prop):
    ra = r["read_account"]
    # D-026.9: the Gas/Truck/Trailer block is a general business expense, every row of it, and
    # nothing else moves (D-027: the old row's property wins over the read's).
    if r["block"] == "Gas/Truck/Trailer": return (ra if ra.startswith("66") and r["match"] in ("id", "strong") else "6600"), "D-026.9 fuel block"
    if r["match"] in ("id", "strong") and ra:
        if prop != "OVERHEAD" and ra.startswith("65"): return "1030", "read (65xx on a property -> 1030, D-026.3)"
        if prop == "OVERHEAD" and ra[0] == "1" and ra != "1520": return BIZ.get(r["block"], "6500"), "block map (read said a property account)"
        if prop != "OVERHEAD" and ra[0] in "67": pass     # an overhead account on a property row: the old row wins, fall to the block map
        else: return ra, "read"
    if prop == "OVERHEAD": return BIZ.get(r["block"], "6500"), "block map"
    blk, who = r["block"], r["payee"] + " " + r["desc"]
    if blk in HEAVY:
        if blk == "Utilities" and has(who, ("hoa", "homeowners")): return "1130", "block map"
        if blk == "Trash" and not has(who, ("dump", "corsicana", "landfill", "waste")): return ("1030" if has(who, RETAIL) else "1020"), "block map"
        return HEAVY[blk], "block map"
    if has(who, UTIL): return "1120", "payee"
    if has(who, ("insurance", "foremost", "farmers")): return "1110", "payee"
    if not has(r["payee"], RETAIL) and has(who, ("hoa", "lawn", "mow", "falcon creek", "effren", "pool service")): return "1130", "payee"   # a Home Depot "Lawn Utility Box" is materials
    if has(who, ("tax office", "property tax")): return "1100", "payee"
    if has(who, ("photo", "staging", "sign", "vistaprint", "vista print", "homes.com", "listing")): return "1330", "payee"   # listing fee: "it should be selling cost" (Paul 2026-09-18)
    if has(who, ("dump", "landfill", "dumpster", "haul")): return "1060", "payee"
    if has(who, ("appliance",)): return "1040", "payee"
    return ("1030", "payee (retailer)") if has(who, RETAIL) else ("1020", "payee (labor)")

def paid_from_for(r):
    f = json.loads(r["flags"] or "[]")
    if len(f) >= 2 and sum(bool(x) for x in f) == 1:
        if f[0]: return "PAUL", "Paul Paid box"
        if f[1]: return "DENNIS", "Dennis Paid box"
        return ("1402" if r["date"] < "2026-08-01" else "1401"), "Recast Account box (Paul 2026-09-18: all are August-September rows, Citizens 1401)"
    if r["match"] in ("id", "strong") and r["doc_paid_from"] and r["doc_paid_from"] != "UNKNOWN": return r["doc_paid_from"], "read"
    if r["date"] and r["date"] < "2026-08-01": return "PAUL", "D-026.2 (before August)"
    return "UNKNOWN", ""

def main():
    ap = argparse.ArgumentParser()
    for k in ("inv", "cmp", "out"): ap.add_argument("--" + k, required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    G = list(csv.DictReader(open(os.path.join(a.cmp, "G-row-map.csv"))))
    # Reviewed matches (audit section 17 item 3): a confirmed candidate counts as linked, a refused
    # one as no document. Keyed by the old row; who decided and why is in paul-answers.json.
    _ans = json.load(open(os.path.join(a.inv, "paul-answers.json"))) if os.path.exists(os.path.join(a.inv, "paul-answers.json")) else {}
    _yes = {x["key"]: x for x in _ans.get("link", [])}
    # A refusal that names its document refuses that document only - the row is free to find its
    # real receipt later. (Bulk refusals keyed on the row alone had buried six good links, 2026-09-18.)
    _no = {x["key"] for x in _ans.get("no_link", []) if not x.get("docId")} | {(x["key"], x["docId"]) for x in _ans.get("no_link", []) if x.get("docId")}
    class _No(set):
        def __contains__(self, k): return set.__contains__(self, k) or set.__contains__(self, (k, _cur.get(k, "")))
    _cur = {r["key"]: r["docId"] for r in G}; _no = _No(_no)
    for r in G:
        if r["key"] in _yes:
            if r["docId"] != _yes[r["key"]]["docId"]:
                src = next((x for x in G if x["docId"] == _yes[r["key"]]["docId"]), None)
                if src: r.update({k: src[k] for k in ("docId", "doc_vendor", "doc_date", "doc_total", "doc_status", "doc_paid_from", "doc_url", "gmail_url")})
                else:   # a document no row had as a candidate: the Gmail link is its id
                    did = _yes[r["key"]]["docId"]
                    r.update({"docId": did, "doc_vendor": "", "doc_date": "", "doc_total": "", "doc_status": "", "doc_paid_from": "", "doc_url": "",
                              "gmail_url": "https://mail.google.com/mail/u/0/#all/" + did[3:]})
            r["match"] = "strong"
        elif r["key"] in _no and r["match"] in ("weak", "strong"): r["match"] = "none"   # a reviewed refusal beats the matcher
    # Paul's near-amount rule (2026-09-18): same vendor, within 10 days, receipt total within 3% or
    # $2 of the row, and the receipt still has room for it -> linked; the gap lands on list 1.
    import datetime as _dt
    def _same_vendor(a_, b_):
        n = lambda x: re.sub(r"[^a-z0-9 ]", " ", (x or "").lower().replace("&amp;", " "))
        a_, b_ = n(a_), n(b_)
        return any(t in b_ for t in a_.split() if len(t) > 3 and t not in ("home", "store", "company")) or ("lowe" in a_ and "lowe" in b_)
    used_c = collections.defaultdict(int)
    for r in G:
        if r["match"] in ("id", "strong") and r["docId"]: used_c[r["docId"]] += int(r["cents"])
    near = 0
    for r in sorted((x for x in G if x["match"] == "weak"), key=lambda x: -int(x["cents"])):
        t, c = int(r["doc_total"] or 0), int(r["cents"])
        try: dd = abs((_dt.date.fromisoformat(r["date"]) - _dt.date.fromisoformat(r["doc_date"])).days)
        except Exception: continue
        tol = max(200, c * 3 // 100)
        if t and c > 0 and abs(t - c) <= tol and dd <= 10 and r["doc_status"] != "dismissed" and _same_vendor(r["payee"], r["doc_vendor"]) and used_c[r["docId"]] + c <= t + tol:
            r["match"] = "strong"; used_c[r["docId"]] += c; near += 1
    # Exact amount, within 2 days, and a receipt no other row has claimed: linked however the
    # vendor is spelled ("HOA" / "Ashburne Glen Homeowners Association", "Harbor Frieght").
    exact = 0
    for r in sorted((x for x in G if x["match"] == "weak"), key=lambda x: -int(x["cents"])):
        t, c = int(r["doc_total"] or 0), int(r["cents"])
        try: dd = abs((_dt.date.fromisoformat(r["date"]) - _dt.date.fromisoformat(r["doc_date"])).days)
        except Exception: continue
        # ...but not blind: the read must put the receipt on the row's property (overhead for RECAST
        # BIZ), or the names must resemble. Without it Julio's $200 took a CoreLogic $200 invoice.
        here = r["read_property"] == TAB_TO_PROP.get(r["tab"], r["tab"]) or _same_vendor(r["payee"], r["doc_vendor"])
        if c > 0 and t == c and dd <= 2 and here and used_c[r["docId"]] == 0 and r["key"] not in _no:
            r["match"] = "strong"; used_c[r["docId"]] += c; exact += 1
    print(f"near-amount rule linked {near} rows; exact-amount-same-day rule linked {exact} rows")
    entries, q = [], []
    for r in G:
        prop = TAB_TO_PROP.get(r["tab"], r["tab"]); cents = int(r["cents"])
        acct, acct_src = account_for(r, prop)
        if acct.startswith("6") and prop != "OVERHEAD":      # D-026.9: fuel on the old Ashburne tab is overhead
            moved_from, prop = prop, "OVERHEAD"
        else: moved_from = ""
        pf, pf_src = paid_from_for(r)
        # D-032: on the bank deal everything Dennis put in is an advance on the Cash Advances tab
        # (Dr 2030 / Cr 2010). A row the receipt says Dennis paid credits 2030, or 2010 counts twice.
        if prop == "104 Ashburne" and pf == "DENNIS": pf, pf_src = "PAUL", "D-032 (Ashburne: Dennis's money is the cash advance, not the row)"
        linked = r["match"] in ("id", "strong")
        flags = [x for x in (("NO_DOC" if r["match"] == "none" else ""), ("WEAK_MATCH_UNCONFIRMED" if r["match"] == "weak" else ""),
                             ("NO_DATE" if not r["date"] else ""), ("MOVED_TO_OVERHEAD:" + moved_from if moved_from else ""),
                             ("CORRECTED" if r["correction"] else "")) if x]
        e = {"txn_id": "migration-" + (r["date"] or "00000000").replace("-", "") + "-" + hashlib.sha256(f"{r['tab']}|{r['sheet_row']}|{r['block']}|{r['payee']}|{r['cents']}|{r['key']}".encode()).hexdigest()[:12],
             "date": r["date"], "property": prop, "trade": r["block"] if prop != "OVERHEAD" or moved_from else "", "account": acct, "account_source": acct_src,
             "amount_cents": cents, "payee": r["payee"], "description": r["desc"], "paid_from": pf, "paid_from_source": pf_src, "source": "migration",
             "docId": r["docId"] if linked else "", "doc_url": (r["doc_url"] or r["gmail_url"]) if linked else "", "link_kind": ("drive" if r["doc_url"] else "gmail") if linked else "",
             "match": r["match"], "old_tab": r["tab"], "old_block": r["block"], "old_sheet_row": r["sheet_row"], "flags": ";".join(flags), "correction": r["correction"]}
        entries.append(e)
        if pf == "UNKNOWN": q.append({"question": "who paid? (no box ticked, no card on the receipt, August or later)", **{k: e[k] for k in ("date", "old_tab", "payee", "description", "amount_cents", "docId")}})
        # Dennis Paid box: Dr cost / Cr 2010, no Advances row, no interest (D-030).
        if not r["date"]: q.append({"question": "row has no date", **{k: e[k] for k in ("date", "old_tab", "payee", "description", "amount_cents", "docId")}})

    # D-032 (Paul 2026-09-18: "dennis has no direct payments. only cash advances and loan for
    # purchase"): the "Dennis Paid ..." lines on the Cash Advances tab are cash advances - financing,
    # registered by migrationRegisterAdvances, never a cost. Every Ashburne row posts as typed, so the
    # property's cost is the old tab's, to the cent. (Until 2026-09-18 seven rows were held back as
    # COVERED_BY_ADVANCE and eight advances with no row added $1,619.00 of cost the old tab never had.)
    # Paul's answers (audit section 17): who paid, by rule. A rule matches on the entry's own fields.
    ans_path = os.path.join(a.inv, "paul-answers.json")
    answers = json.load(open(ans_path)) if os.path.exists(ans_path) else {}
    for e in entries:
        for rule in answers.get("paid_from", []):
            if e["paid_from"] == "UNKNOWN" and all(str(e.get(k, "")).startswith(v) if k == "payee" else str(e.get(k, "")) == v for k, v in rule["match"].items()):
                e["paid_from"], e["paid_from_source"] = rule["paid_from"], "Paul: " + rule["said"]
    for e in entries:
        for rule in answers.get("redate", []):
            if all(str(e.get(k, "")) == v for k, v in rule["match"].items()):
                e["date"] = rule["date"]; e["correction"] = (e["correction"] + " | " if e["correction"] else "") + rule.get("register", "") + " " + rule["said"]
                e["flags"] = (e["flags"] + ";" if e["flags"] else "") + "CORRECTED"
    hit = lambda e, m: all(str(e.get(k, "")).startswith(v) if k == "payee" and v else str(e.get(k, "")) == v for k, v in m.items())
    for e in entries:
        for rule in answers.get("drop", []):
            if hit(e, rule["match"]): e["skip"] = "DROPPED_BY_PAUL " + rule.get("register", "") + ": " + rule["said"]
    # paul-answers.json "rename_payee": Paul asked for a vendor's proper name. The txn_id is already fixed from
    # the row as typed, so ids and links do not move; the typed name stays in the correction note, and an
    # invoice number typed after the name ("Effren - 1372") moves into the description.
    for e in entries:
        for rule in answers.get("rename_payee", []):
            if re.match(rule["pattern"], e["payee"], re.I):
                m = re.search(r"(\d{3,})\s*$", e["payee"])
                if m and m.group(1) not in e["description"]: e["description"] = (e["description"] + " - INV " + m.group(1)).strip(" -")
                e["correction"] = (e["correction"] + " | " if e["correction"] else "") + f"payee typed '{e['payee']}' in the old books; " + rule["said"]
                e["payee"] = rule["payee"]
    for e in entries:
        e.setdefault("skip", "")
        if not e["skip"] and e["amount_cents"] == 0: e["skip"] = "ZERO_AMOUNT (a $0.00 row: nothing to post)"
        if not e["skip"] and not e["date"]: e["skip"] = "NO_DATE (Paul to date it)"
        if not e["skip"] and e["paid_from"] == "UNKNOWN": e["skip"] = "PAYER_UNKNOWN (D-026.2: August on, Paul says who paid)"
        e["business_purpose"] = ("Migrated from the old books (" + (e["old_block"] or e["old_tab"]) + "): " + e["description"]).strip(": ") if e["account"] in ("6600", "6700", "6710", "6720") else ""
        e["attendee"] = "per the old books" if e["account"] in ("6710", "6720") else ""

    # Costs the old books left off and returns Paul confirmed (D-028), from paul-answers.json "add".
    # They are additions to the old books, each a register line; a return is a purchase and its credit.
    urls = {r["docId"]: (r["doc_url"] or r["gmail_url"], "drive" if r["doc_url"] else "gmail") for r in G if r["docId"]}
    for i, x in enumerate(answers.get("add", [])):
        if x.get("retracted"): continue   # kept in the list so the later additions keep their index, and so their txn ids
        # no docId: the proof is a file Paul supplied (x["evidence"], under evidence/), filed to Drive with the rest (item 7)
        link, kind = urls.get(x["docId"], ("https://mail.google.com/mail/u/0/#all/" + x["docId"][3:], "gmail")) if x["docId"] else ("", "evidence")
        entries.append({"txn_id": "migration-" + x["date"].replace("-", "") + "-" + hashlib.sha256(f"add|{i}|{x['docId']}|{x['description']}|{x['amount_cents']}".encode()).hexdigest()[:12],
                        "date": x["date"], "property": x["property"], "trade": x["trade"], "account": x["account"], "account_source": "Paul/Claude (added)", "amount_cents": x["amount_cents"],
                        "payee": x["payee"], "description": x["description"], "paid_from": x["paid_from"], "paid_from_source": "receipt", "source": "migration", "docId": x["docId"], "doc_url": link,
                        "link_kind": kind, "match": "added", "old_tab": "", "old_block": "", "old_sheet_row": "", "flags": ("RETURN_CONFIRMED_BY_PAUL" if x["register"] == "C-11" else "CORRECTION_TO_A_CLOSED_PROPERTY" if x["amount_cents"] < 0 else "ADDED_NOT_IN_OLD_BOOKS") + (";EVIDENCE:" + x["evidence"] if x.get("evidence") else ""),
                        "correction": x["register"] + " " + x["said"], "skip": "", "business_purpose": x.get("business_purpose", ""), "attendee": ""})

    # "Sparkling for Title" is not migrated at all (Paul, 2026-09-18): RECONCILED is the tab; the
    # two Juanito Garcia rows only the Title tab had ($1,000 + $1,200, late June) "were errors.
    # do not document those." Their two documents are excluded from the review list as well.
    def w(name, recs, fields=None):
        with open(os.path.join(a.out, name), "w", newline="") as f:
            if not recs: return
            wr = csv.DictWriter(f, fieldnames=fields or list(recs[0].keys()), extrasaction="ignore"); wr.writeheader(); wr.writerows(recs)
    # Item 7: documents filed to Drive by scripts/migration-file-docs.mjs (drive-filing.json, docId or
    # EVIDENCE:<file> -> url) replace their Gmail link. Ids and amounts never depend on the link.
    _filed = json.load(open(os.path.join(a.inv, "drive-filing.json"))) if os.path.exists(os.path.join(a.inv, "drive-filing.json")) else {}
    for e in entries:
        k = e["docId"] if e["link_kind"] == "gmail" else next((f for f in e["flags"].split(";") if f.startswith("EVIDENCE:")), "")
        if e["link_kind"] in ("gmail", "evidence") and k in _filed: e["doc_url"], e["link_kind"] = _filed[k]["url"], "drive"
    w("entries.csv", entries); json.dump(entries, open(os.path.join(a.out, "entries.json"), "w"), indent=0)

    # list 1: receipt total vs the rows it explains
    by_doc = collections.defaultdict(list)
    for r in G:
        if r["match"] in ("id", "strong") and r["docId"]: by_doc[r["docId"]].append(r)
    F = {x["docId"]: x for x in csv.DictReader(open(os.path.join(a.cmp, "F-returns-inferred.csv")))} if os.path.getsize(os.path.join(a.cmp, "F-returns-inferred.csv")) else {}
    L1 = []
    for d, rs in by_doc.items():
        tot = int(rs[0]["doc_total"] or 0); old = sum(int(x["cents"]) for x in rs)
        if not tot or tot == old: continue
        L1.append({"docId": d, "doc_date": rs[0]["doc_date"], "vendor": rs[0]["doc_vendor"], "receipt": money(tot), "old_rows": len(rs), "old_rows_total": money(old), "gap": money(tot - old),
                   "kind": "receipt > rows: return or omitted item?" if tot > old else "rows > receipt: another receipt, or a typed amount to check",
                   "items_that_sum_to_gap": (F.get(d) or {}).get("return_items", ""), "rows": " | ".join(f"{x['tab']}/{x['block']} {x['payee']} {money(int(x['cents']))}" for x in rs)[:300], "link": rs[0]["doc_url"] or rs[0]["gmail_url"]})
    # paul-answers.json "differences_settled": a receipt whose difference has been read and explained (rounding,
    # items Paul left out, a twin copy, a registered correction), each with its reason - it leaves the list.
    _ds = {x["docId"] for x in answers.get("differences_settled", [])}
    L1 = [x for x in L1 if x["docId"] not in _ds]
    L1.sort(key=lambda x: -abs(float(x["gap"].replace(",", ""))))
    w("list-1-differences.csv", L1)
    w("list-2-confirm-match.csv", [{"date": r["date"], "tab": r["tab"], "block": r["block"], "payee": r["payee"], "desc": r["desc"], "amount": money(int(r["cents"])), "candidate_vendor": r["doc_vendor"],
                                    "candidate_date": r["doc_date"], "candidate_total": money(int(r["doc_total"] or 0)), "candidate_status": r["doc_status"], "link": r["doc_url"] or r["gmail_url"], "docId": r["docId"]}
                                   for r in sorted(G, key=lambda r: -int(r["cents"])) if r["match"] == "weak"])
    w("list-3-no-document.csv", [{"date": r["date"], "tab": r["tab"], "block": r["block"], "payee": r["payee"], "desc": r["desc"], "amount": money(int(r["cents"]))}
                                 for r in sorted(G, key=lambda r: -int(r["cents"])) if r["match"] == "none"])
    NOT_OURS = {"gm-19f57268c36be87a", "gm-19f57221a343c4d6"}   # Garcia Home Repair $1,200 / $1,000: errors, per Paul
    # paul-answers.json "mail_settled": documents Claude or Paul has decided need no posting (a bill whose
    # payment is a row, a twin, a notice), each with its reason - they leave the review list.
    SETTLED = {x["docId"] for x in answers.get("mail_settled", [])} | {x["docId"] for x in answers.get("add", [])}   # an added document is in the books
    # a document an entry already carries (paul-answers links included), or its same-day same-total twin, is in the books
    Ball = list(csv.DictReader(open(os.path.join(a.cmp, "B-by-match.csv"))))
    in_books = {e["docId"] for e in entries if e["docId"] and not e["skip"]}
    twins = {(x["date"], x["new_cents"]) for x in Ball if x["docId"] in in_books and int(x["new_cents"] or 0)}
    B = [x for x in Ball if x["bucket"] == "in mail, not in old books" and x["docId"] not in NOT_OURS and x["docId"] not in SETTLED
         and x["docId"] not in in_books and (x["date"], x["new_cents"]) not in twins]
    w("list-4-in-mail-not-in-books.csv", [{"date": x["date"], "vendor": x["vendor"], "total": money(int(x["new_cents"] or 0)), "where_the_read_put_it": x["new_where"], "status": x["status"],
                                           "subject": x["subject"], "weak_candidates": x.get("weak_candidates", ""), "docId": x["docId"]} for x in sorted(B, key=lambda x: -int(x["new_cents"] or 0))])
    w("list-5-questions.csv", q)

    # README: totals by property; the inventory is the target and the entries reproduce it
    inv = collections.defaultdict(int); ent = collections.defaultdict(int); linked = collections.defaultdict(int); n = collections.Counter()
    for r in G: inv[TAB_TO_PROP.get(r["tab"], r["tab"])] += int(r["cents"])
    for e in entries: ent[e["property"]] += e["amount_cents"]; n[e["property"]] += 1; linked[e["property"]] += 1 if e["doc_url"] else 0
    moved = sum(e["amount_cents"] for e in entries if "MOVED_TO_OVERHEAD" in e["flags"])
    L = ["# Row-driven migration - DRY RUN (D-029). Nothing is posted.", "",
         f"Old rows: {len(G)}  ${money(sum(int(r['cents']) for r in G))}   entries: {len(entries)}  ${money(sum(e['amount_cents'] for e in entries))}   "
         f"linked to a receipt: {sum(1 for e in entries if e['doc_url'])} ({sum(1 for e in entries if e['link_kind']=='drive')} Drive file, {sum(1 for e in entries if e['link_kind']=='gmail')} Gmail link, to be filed)", "",
         "| property | old rows $ | entries | entries $ | difference | linked |", "|---|---:|---:|---:|---:|---:|"]
    for p in sorted(set(inv) | set(ent), key=lambda p: (p == "OVERHEAD", p)):
        L.append(f"| {p} | {money(inv[p])} | {n[p]} | {money(ent[p])} | {money(ent[p] - inv[p])} | {linked[p]} |")
    L += ["", f"The only differences by property are fuel rows Paul's rule moves to overhead (D-026.9): ${money(moved)} "
              f"({sum(1 for e in entries if 'MOVED_TO_OVERHEAD' in e['flags'])} rows). Everything else is the old row, to the cent.", "",
          f"Accounts: {dict(collections.Counter(e['account_source'].split(' (')[0] for e in entries))}",
          f"Paid from: {dict(collections.Counter(e['paid_from'] for e in entries))}  (sources: {dict(collections.Counter(e['paid_from_source'].split(' (')[0] or 'none' for e in entries))})", "",
          f"Lists for Paul: 1 differences {len(L1)} · 2 confirm the match {sum(1 for r in G if r['match']=='weak')} · 3 no document {sum(1 for r in G if r['match']=='none')} · "
          f"4 in mail, not in the books {len(B)} · 5 questions {len(q)}"]
    open(os.path.join(a.out, "README.md"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
    post = [{k: e[k] for k in ("txn_id", "date", "property", "trade", "account", "amount_cents", "payee", "description", "paid_from", "doc_url", "business_purpose", "attendee")}
            | {"memo": f"old books: {e['old_tab']}" + (f" / {e['old_block']}" if e["old_block"] else "") + (f" row {e['old_sheet_row']}" if e["old_sheet_row"] else "") + (f"; {e['flags']}" if e["flags"] else "")}
            for e in entries if not e["skip"]]
    open(os.path.join(a.out, "MigrationData.gs"), "w").write("// GENERATED by scripts/migration-rows.py - the row-driven migration's entries (D-029). Staging/cutover only.\nvar MIGRATION_ENTRIES = " + json.dumps(post, separators=(",", ":")) + ";\n")
    sk = collections.Counter(e["skip"].split(" ")[0] for e in entries if e["skip"])
    print(f"\nTo post: {len(post)} entries ${money(sum(e['amount_cents'] for e in post))}   held back: {dict(sk)} ${money(sum(e['amount_cents'] for e in entries if e['skip']))}")
    byp = collections.defaultdict(int)
    for e in post: byp[e["property"]] += e["amount_cents"]
    json.dump({"to_post": len(post), "cents": sum(e["amount_cents"] for e in post), "by_property": byp, "held_back": dict(sk)}, open(os.path.join(a.out, "expected.json"), "w"), indent=1)
    assert len({e["txn_id"] for e in entries}) == len(entries), "txn_id collision"
    assert sum(e["amount_cents"] for e in entries if e["match"] != "added") == sum(int(r["cents"]) for r in G), "entries do not reproduce the rows"

if __name__ == "__main__":
    main()
