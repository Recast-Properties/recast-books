"""Round 2 (2026-11-02). Run from penny-work/round2/ with journal.json, paul_lines.csv, lines_2030.csv, statements2.csv
beside it and ../statements.csv, ../bofa.csv (the first pass's lines). Matches EVERY statement line (both passes)
against the fresh books so a receipt is tied once, then reports only what the new statements add:
  matched2.csv, unmatched2.csv (bucketed), paid_by_recast_per_books.csv, unmatched_books2.csv, recurring2.csv,
  credits2.csv, reimb_ties2.txt, money_in2.txt, money_moves2.txt"""
import csv, re, collections, json
from datetime import datetime, timedelta
D = lambda s: datetime.strptime(s, '%Y-%m-%d')
def dd(a, b): return abs((D(a) - D(b)).days)
J = json.load(open('journal.json')); ix = {k: i for i, k in enumerate(J['headers'])}
g = lambda r, k: r[ix[k]]
voided = {g(r, 'void_of') for r in J['rows'] if g(r, 'void_of')}; vid = {g(r, 'txn_id') for r in J['rows'] if g(r, 'source') == 'void'}
live = [r for r in J['rows'] if g(r, 'txn_id') not in voided and g(r, 'txn_id') not in vid]
doc_of = {g(r, 'txn_id'): g(r, 'doc_url') for r in live if g(r, 'doc_url')}

def receipts_of(lines):
    groups = collections.OrderedDict()
    for r in lines:
        key = doc_of.get(r['txn_id']) or r['txn_id']
        gg = groups.setdefault(key, {'key': key, 'lines': [], 'total': 0.0}); gg['lines'].append(r); gg['total'] += float(r['amount'])
    out = []
    for gg in groups.values():
        ls = gg['lines']
        out.append({'key': gg['key'], 'total': round(gg['total'], 2), 'date': min(l['date'] for l in ls),
                    'payee': collections.Counter(l['payee'] for l in ls).most_common(1)[0][0], 'props': sorted({l['property'] for l in ls}),
                    'n': len(ls), 'paid_from': ls[0].get('paid_from', 'PAUL'), 'desc': '; '.join(dict.fromkeys(l['description'][:40] for l in ls))[:120],
                    'memo': (ls[0].get('memo') or '')[:80], 'matched': None, 'note': ''})
    return out
books = [r for r in csv.DictReader(open('paul_lines.csv')) if r['date'] >= '2025-12-01']
receipts = receipts_of(books)
# receipts the books say Recast / Dennis paid (to catch a Paul-card charge recorded on the wrong payer)
other = [{'txn_id': g(r, 'txn_id'), 'date': g(r, 'date'), 'amount': '%.2f' % ((g(r, 'debit') or 0) - (g(r, 'credit') or 0)), 'payee': g(r, 'payee'),
          'description': g(r, 'description'), 'property': g(r, 'property'), 'paid_from': g(r, 'paid_from'), 'memo': g(r, 'memo')}
         for r in live if g(r, 'paid_from') != 'PAUL' and g(r, 'date') >= '2025-12-01' and str(g(r, 'account')) not in ('2030', '1401', '1402', '1000', '2010', '2020', '9000', '9010', '3000')]
other_receipts = receipts_of(other)
# corrected-to-Recast receipts (Dr 2030 "corrected"): leave them out, the first pass did
corr = [r for r in csv.DictReader(open('lines_2030.csv')) if r['debit'] and 'corrected' in (r['memo'] or '').lower() and r['paid_from'] != 'PAUL']
for c in corr:
    a = round(float(c['debit']), 2)
    cands = [r for r in receipts if r['total'] == a and not r['note'] and dd(c['date'], r['date']) <= 10]
    if cands: cands[0]['note'] = 'corrected to Recast account'
receipts_live = [r for r in receipts if not r['note']]

stm = []
for fn, new in (('../statements.csv', False), ('../bofa.csv', False), ('statements2.csv', True)):
    for s in csv.DictReader(open(fn)):
        if s['source'].startswith('Card YTD'): s['source'] = 'Citi card'
        s['amt'] = float(s['amount_out']); s['matched'] = None; s['weak'] = ''; s['new'] = new; s['txdate'] = s['date']
        m = re.search(r'\s(\d{2})/(\d{2})$', s['description']) or (re.search(r'^(?:\S+ ){1,4}?(\d{2})/(\d{2}) ', s['description']) if 'stmt' in s['source'] else None)
        if m and s['source'].startswith('Chase checking'):
            y = int(s['date'][:4]); td = datetime(y, int(m.group(1)), int(m.group(2)))
            if td > D(s['date']) + timedelta(days=5): td = td.replace(year=y - 1)
            s['txdate'] = td.strftime('%Y-%m-%d')
        stm.append(s)
STOP = {'THE', 'INC', 'LLC', 'COM', 'AND', 'DEBIT', 'CARD', 'PURCHASE', 'PAYMENT', 'WAXAHACHIE', 'PORTLAND', 'DALLAS', 'WILMINGTON', 'FRANCISCO', 'SEATTLE', 'TX', 'OR', 'CA', 'WA', 'DE', 'NY', 'MA', 'TECHNOLOGIES', 'PENDING', 'HELP', 'BILL', 'AMZN', 'ONLINE', 'OFFICE', 'STORE', 'WITH', 'PIN', 'SENT', 'RECURRING', 'POS', 'HOME', 'DEPOT'}
ALIAS = {'SWA': 'SOUTHWEST', 'SQSP': 'SQUARESPACE', 'UBR': 'UBER', 'COMMUNITYARCH': 'COMMUNITY', 'LOWES': 'LOWE', 'MKTPL': 'AMAZON', 'MKTPLACE': 'AMAZON', 'AMERICAN': 'AMERICAN', 'ARMANDRE': 'ARMANDER', 'HOMEDEPOT': 'DEPOT'}
def mw(t):
    ws = set()
    for w in re.findall(r"[A-Za-z]{2,}", t.upper().replace("'", '')):
        w = ALIAS.get(w, w)
        if len(w) >= 3 and w not in STOP: ws.add(w)
    if 'HOME DEPOT' in t.upper(): ws.add('HOMEDEPOT')
    return ws
def same(a, b): return bool(mw(a) & mw(b))
def match_pass(pool, lo, hi, require_word):
    by_amt = collections.defaultdict(list)
    for r in pool: by_amt[r['total']].append(r)
    n = 0
    for s in sorted(stm, key=lambda s: s['date']):
        if s['matched'] or s['amt'] == 0: continue
        c = [r for r in by_amt.get(round(s['amt'], 2), []) if not r['matched'] and lo <= (D(s['txdate']) - D(r['date'])).days <= hi and (not require_word or same(s['description'], r['payee'] + ' ' + r['desc']))]
        if c:
            r = min(c, key=lambda r: abs((D(s['txdate']) - D(r['date'])).days)); r['matched'] = s; s['matched'] = r; s['weak'] = '' if same(s['description'], r['payee'] + ' ' + r['desc']) else 'no shared word'; n += 1
    return n
# strong ties first (same word), then amount-only ties flagged weak
print('PAUL receipts: word+amount', match_pass(receipts_live, -3, 7, True), match_pass(receipts_live, -10, 20, True), match_pass(receipts_live, -25, 45, True))
print('PAUL receipts: amount only', match_pass(receipts_live, -1, 5, False), match_pass(receipts_live, -5, 15, False))
# combos: one bank line = two receipts / one receipt = two lines (same store, 4 days)
ncomb = 0
for s in sorted(stm, key=lambda s: s['date']):
    if s['matched'] or s['amt'] <= 0: continue
    c = [r for r in receipts_live if not r['matched'] and 0 < r['total'] < s['amt'] and dd(s['txdate'], r['date']) <= 4 and same(s['description'], r['payee'])]
    for i in range(len(c)):
        for j in range(i + 1, len(c)):
            if abs(c[i]['total'] + c[j]['total'] - s['amt']) < 0.011 and not s['matched']:
                for r in (c[i], c[j]): r['matched'] = s; r['note'] = 'half of one bank line'
                s['matched'] = c[i]; s['weak'] = 'combo: %s %.2f + %.2f' % (c[i]['payee'], c[i]['total'], c[j]['total']); ncomb += 1
for r in sorted(receipts_live, key=lambda r: r['date']):
    if r['matched'] or r['total'] <= 0: continue
    c = [s for s in stm if not s['matched'] and 0 < s['amt'] < r['total'] and dd(s['txdate'], r['date']) <= 4 and same(s['description'], r['payee'])]
    for i in range(len(c)):
        for j in range(i + 1, len(c)):
            if abs(c[i]['amt'] + c[j]['amt'] - r['total']) < 0.011 and not r['matched']:
                for s in (c[i], c[j]): s['matched'] = r; s['weak'] = 'combo: 2 lines for %s %.2f' % (r['payee'], r['total'])
                r['matched'] = c[i]; ncomb += 1
print('combos', ncomb)
# the other-payer check: a still-unmatched Paul-card line that ties (amount, 5 days, same word) to a receipt the books say Recast paid
wrong = []
for s in sorted(stm, key=lambda s: s['date']):
    if s['matched'] or s['amt'] <= 0 or not s['new']: continue
    c = [r for r in other_receipts if r['total'] == round(s['amt'], 2) and not r['matched'] and dd(s['txdate'], r['date']) <= 7 and same(s['description'], r['payee'] + ' ' + r['desc'])]
    if c: r = c[0]; r['matched'] = s; wrong.append((s, r))
print('new lines tying to a receipt the books say someone else paid:', len(wrong))

new = [s for s in stm if s['new']]
um = [s for s in new if not s['matched']]
print('new lines %d: matched %d, unmatched %d' % (len(new), len(new) - len(um), len(um)))
MOVE = re.compile(r'Online Transfer|Payment Thank You|ONLINE PAYMENT|PAYMENT - THANK|MOBILE PYMT|CARD ONLINE PAYMENT|Creditcard|CCPYMT|E-PAYMENT|AUTOPAY|Payment To Chase|Bk of Amer|Online Pmt|Interest Charge|LATE FEE|Wire Fee|Counter Check|ATM Fee|ATM Withdraw|Official Checks|Discover|Barclaycard|Citi Card|Wells Fargo Card|Affirm|Klarna|Capital One|STATEMENT CREDIT|Cashback', re.I)
def bucket(s):
    d = s['description']
    if MOVE.search(d) or s['type'] in ('Payment', 'Interest', 'Transfer', 'Fee'): return 'MONEY MOVES / CARD PAYMENTS / INTEREST'
    if s['amt'] < 0: return 'MONEY IN / CREDIT'
    if 'Zelle' in d:
        m = re.search(r'Zelle Payment To ([A-Za-z \.\'-]+?)(?: Jpm|$)', d); return 'ZELLE TO ' + (m.group(1).strip().upper() if m else d[:30].upper())
    if re.search(r'^Check\s+#', d): return 'CHECK'
    d = re.sub(r'^(Card Purchase( With Pin)?|Recurring Card Purchase|Payment Sent|Purchase Return|Card Purchase Return)\s+\d{2}/\d{2} ', '', d)
    d = re.sub(r'\b\d{2}/\d{2}\b', '', d); d = re.sub(r'[#*]\S*', '', d); d = re.sub(r'\d[\d\-\.]*', '', d)
    return re.sub(r'\s+', ' ', d).strip().upper()[:34]
with open('matched2.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'date', 'amount', 'description', 'books_date', 'payee', 'props', 'paid_from', 'weak', 'key'])
    for s in sorted(new, key=lambda s: (s['source'], s['date'])):
        if s['matched']: r = s['matched']; w.writerow([s['source'], s['date'], '%.2f' % s['amt'], s['description'][:70], r['date'], r['payee'], '/'.join(r['props']), r['paid_from'], s['weak'], r['key'][-30:]])
with open('unmatched2.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'date', 'type', 'amount_out', 'description', 'bucket', 'card'])
    for s in sorted(um, key=lambda s: (s['source'], s['date'])): w.writerow([s['source'], s['date'], s['type'], '%.2f' % s['amt'], s['description'][:90], bucket(s), s['card']])
with open('paid_by_recast_per_books.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'date', 'amount', 'description', 'books_date', 'payee', 'props', 'paid_from', 'memo', 'key'])
    for s, r in wrong: w.writerow([s['source'], s['date'], '%.2f' % s['amt'], s['description'][:70], r['date'], r['payee'], '/'.join(r['props']), r['paid_from'], r['memo'], r['key'][-30:]])
um_b = [r for r in receipts_live if not r['matched'] and r['date'] >= '2026-01-01']
with open('unmatched_books2.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['date', 'total', 'payee', 'props', 'n', 'desc', 'memo', 'key'])
    for r in sorted(um_b, key=lambda r: r['date']): w.writerow([r['date'], '%.2f' % r['total'], r['payee'], '/'.join(r['props']), r['n'], r['desc'], r['memo'], r['key'][-30:]])
print('books PAUL-paid 2026 receipts with no bank line anywhere: %d (%.2f); Jan-Mar: %d (%.2f)' % (len(um_b), sum(r['total'] for r in um_b), sum(1 for r in um_b if r['date'] < '2026-03-30'), sum(r['total'] for r in um_b if r['date'] < '2026-03-30')))
# recurring on the new sources: merchant seen in 3+ months
grp = collections.defaultdict(list)
for s in new:
    if s['amt'] > 0 and bucket(s) != 'MONEY MOVES / CARD PAYMENTS / INTEREST': grp[(s['source'], bucket(s))].append(s)
with open('recurring2.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'merchant', 'months', 'n', 'amounts', 'in_books'])
    for (src, k), ls in sorted(grp.items(), key=lambda kv: -len({s['date'][:7] for s in kv[1]})):
        months = {s['date'][:7] for s in ls}
        if len(months) >= 3: w.writerow([src, k, len(months), len(ls), ' '.join(sorted({'%.2f' % s['amt'] for s in ls})[:6]), '%d/%d' % (sum(1 for s in ls if s['matched']), len(ls))])
# refunds / returns on the new sources at business-looking stores, and whether the books hold a Paul refund of that size
neg_books = [r for r in receipts if r['total'] < 0]
with open('credits2.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'date', 'amount', 'description', 'books_refund'])
    for s in sorted(new, key=lambda s: s['date']):
        if s['amt'] < 0 and not MOVE.search(s['description']) and re.search(r'DEPOT|LOWE|AMAZON|WAYFAIR|HARBOR|ETSY|KEITH|ACE HARD|FLOOR|TILE|FERGUSON|SHERWIN|RETURN', s['description'], re.I):
            c = [r for r in neg_books if abs(r['total'] - s['amt']) < 0.011 and dd(s['date'], r['date']) <= 30]
            w.writerow([s['source'], s['date'], '%.2f' % s['amt'], s['description'][:70], ('%s %s %.2f' % (c[0]['date'], c[0]['payee'], c[0]['total'])) if c else 'NOT IN THE BOOKS'])
# reimbursements: 2030 debits not PAUL-paid dated before 03-30 vs deposits in his checking (the statements)
deb = [r for r in csv.DictReader(open('lines_2030.csv')) if r['debit'] and r['paid_from'] != 'PAUL' and '2025-12-20' <= r['date'] <= '2026-03-29' and 'corrected' not in (r['memo'] or '').lower()]
dep = [s for s in new if s['amt'] < 0 and s['source'].startswith('Chase checking')]
with open('reimb_ties2.txt', 'w') as f:
    for r in sorted(deb, key=lambda r: r['date']):
        a = round(float(r['debit']), 2)
        c = [s for s in dep if abs(-s['amt'] - a) < 0.011 and dd(s['date'], r['date']) <= 12]
        f.write('%s %11.2f | %-50s | %s\n' % (r['date'], a, (r['memo'] or r['description'])[:50], ('DEPOSIT %s %s' % (c[0]['date'], c[0]['description'][:45])) if c else 'no deposit found'))
with open('money_in2.txt', 'w') as f:
    for s in sorted(dep, key=lambda s: s['date']): f.write('%s %11.2f %-10s %s\n' % (s['date'], -s['amt'], s['type'], s['description'][:75]))
with open('money_moves2.txt', 'w') as f:
    for s in sorted(new, key=lambda s: s['date']):
        if s['amt'] > 0 and bucket(s) == 'MONEY MOVES / CARD PAYMENTS / INTEREST': f.write('%s %-26s %10.2f %s\n' % (s['date'], s['source'][:26], s['amt'], s['description'][:70]))
print('unmatched new-line buckets:', collections.Counter(bucket(s) for s in um).most_common(12))
