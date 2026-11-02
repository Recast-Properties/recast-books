"""Round 2 (2026-11-02): the Home Depot / Lowe's / Amazon pass for the months the first pass could not see
(the bank's Jan 1 - Mar 24 lines). Run from penny-work/round2/. Reads statements2.csv, paul_lines.csv, ../hd_history.txt,
../lowes_history.txt, ../amazon_orders_2026.txt. Writes hd_jan_mar.csv, lowes_jan_mar.csv, amazon_jan_mar.csv."""
import csv, re, collections
from datetime import datetime
D = lambda s: datetime.strptime(s, '%Y-%m-%d')
def dd(a, b): return abs((D(a) - D(b)).days)
LO, HI = '2025-12-20', '2026-03-29'
stm = [s for s in csv.DictReader(open('statements2.csv')) if LO <= s['date'] <= HI]
for s in stm:
    s['amt'] = float(s['amount_out'])
    m = re.search(r'(\d{2})/(\d{2}) ', s['description']) if 'stmt' in s['source'] else None
    s['tx'] = ('2026-%s-%s' % (m.group(1), m.group(2)) if m and m.group(1) != '12' else ('2025-%s-%s' % (m.group(1), m.group(2)) if m else s['date']))
import json
J = json.load(open('journal.json')); ix = {k: i for i, k in enumerate(J['headers'])}
doc_of = {r[ix['txn_id']]: r[ix['doc_url']] for r in J['rows'] if r[ix['doc_url']]}
lines = [r for r in csv.DictReader(open('paul_lines.csv')) if LO <= r['date'] <= HI]
grp = collections.OrderedDict()
for r in lines:
    key = doc_of.get(r['txn_id']) or r['txn_id']
    g = grp.setdefault(key, {'lines': [], 'amt': 0.0}); g['lines'].append(r); g['amt'] += float(r['amount'])
books = []
for key, g in grp.items():
    ls = g['lines']
    books.append({'date': min(l['date'] for l in ls), 'amt': round(g['amt'], 2), 'payee': collections.Counter(l['payee'] for l in ls).most_common(1)[0][0],
                  'property': '/'.join(sorted({l['property'] for l in ls})), 'account': '/'.join(sorted({l['account'] for l in ls})),
                  'description': '; '.join(dict.fromkeys(l['description'][:22] for l in ls))[:70], 'memo': ls[0]['memo'], 'n': len(ls), 'used': False})
def books_find(pat, amt, date, tol=0.02, days=4):
    c = [r for r in books if not r['used'] and re.search(pat, r['payee'], re.I) and abs(r['amt'] - amt) <= tol and dd(r['date'], date) <= days]
    return min(c, key=lambda r: dd(r['date'], date)) if c else None
def books_near(pat, amt, date, days=3):
    c = [r for r in books if not r['used'] and re.search(pat, r['payee'], re.I) and dd(r['date'], date) <= days and r['amt'] * amt > 0 and abs(r['amt'] - amt) <= max(15, 0.08 * abs(amt))]
    return min(c, key=lambda r: abs(r['amt'] - amt)) if c else None
def books_sum(pat, amt, date, days=3):
    """two or three books rows on the same day that add up to the bank line"""
    c = [r for r in books if not r['used'] and re.search(pat, r['payee'], re.I) and dd(r['date'], date) <= days and r['amt'] * amt > 0]
    for i in range(len(c)):
        for j in range(i + 1, len(c)):
            if abs(c[i]['amt'] + c[j]['amt'] - amt) <= 0.02: return [c[i], c[j]]
            for k in range(j + 1, len(c)):
                if abs(c[i]['amt'] + c[j]['amt'] + c[k]['amt'] - amt) <= 0.02: return [c[i], c[j], c[k]]
    return None

# ---- Home Depot
hd = [l.rstrip('\n').split('|') for l in open('../hd_history.txt') if '|' in l]
hd = [{'date': h[0], 'rcpt': h[1], 'amt': float(h[2]), 'card': h[3], 'store': h[4], 'kind': h[8], 'job': h[9], 'used': False} for h in hd if LO <= h[0] <= HI]
def hd_find(amt, date):
    c = [h for h in hd if not h['used'] and abs(h['amt'] - amt) <= 0.01 and dd(h['date'], date) <= 3]
    return c[0] if c else None
out = []
for s in sorted(stm, key=lambda s: s['tx']):
    if not re.search(r'home ?depot', s['description'], re.I): continue
    h = hd_find(s['amt'], s['tx'])
    if h: h['used'] = True
    b = books_find(r'home depot', s['amt'], s['tx']); kind = 'exact'
    if not b:
        bs = books_sum(r'home depot', s['amt'], s['tx'])
        if bs:
            for r in bs: r['used'] = True
            out.append([s['source'][:14], s['tx'], '%.2f' % s['amt'], s['card'], h['rcpt'] if h else '', (h['job'] if h else ''), 'books: ' + ' + '.join('%s %.2f %s' % (r['date'], r['amt'], r['description'][:25]) for r in bs), 'sum of %d rows' % len(bs)]); continue
        b = books_near(r'home depot', s['amt'], s['tx']); kind = 'NEAR (%.2f off)' % (s['amt'] - b['amt']) if b else 'NOT IN THE BOOKS'
    if b: b['used'] = True
    out.append([s['source'][:14], s['tx'], '%.2f' % s['amt'], s['card'], h['rcpt'] if h else '', (h['job'] if h else ''), ('books: %s %.2f %s/%s %s' % (b['date'], b['amt'], b['property'][:12], b['account'], b['description'][:30])) if b else '', kind])
for r in sorted(books, key=lambda r: r['date']):
    if not r['used'] and re.search(r'home depot', r['payee'], re.I):
        h = [x for x in hd if not x['used'] and abs(x['amt'] - r['amt']) <= 0.02 and dd(x['date'], r['date']) <= 3]
        out.append(['BOOKS ONLY', r['date'], '%.2f' % r['amt'], '', h[0]['rcpt'] if h else '', h[0]['job'] if h else '', '%s/%s %d items: %s | %s' % (r['property'][:12], r['account'], r['n'], r['description'][:50], r['memo'][:40]), 'no bank line' + (' (Pro receipt exists: %s %s)' % (h[0]['date'], h[0]['card']) if h else '')])
for h in hd:
    if not h['used'] and h['date'] >= '2026-01-01': out.append(['PRO ONLY', h['date'], '%.2f' % h['amt'], h['card'], h['rcpt'], h['job'], '', 'Pro receipt with no bank line here (other card / other account?)'])
with open('hd_jan_mar.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['bank', 'date', 'amount', 'card', 'pro_receipt', 'job', 'books', 'status']); w.writerows(out)
print('HD rows:', collections.Counter(o[7].split(' (')[0][:16] for o in out).most_common())

# ---- Lowe's
lw = [l.rstrip('\n').split('|') for l in open('../lowes_history.txt') if '|' in l]
lw = [{'date': h[0], 'amt': float(h[3]) * (-1 if 'Return' in h[6] else 1), 'po': h[4], 'status': h[6], 'order': h[7], 'note': h[8][20:] if len(h) > 8 else '', 'used': False} for h in lw if LO <= h[0] <= HI]
out = []
for s in sorted(stm, key=lambda s: s['tx']):
    if not re.search(r'lowe', s['description'], re.I): continue
    l = [x for x in lw if not x['used'] and abs(x['amt'] - s['amt']) <= 0.01 and dd(x['date'], s['tx']) <= 4]
    if l: l[0]['used'] = True
    b = books_find(r'lowe', s['amt'], s['tx']); kind = 'exact'
    if not b:
        bs = books_sum(r'lowe', s['amt'], s['tx'])
        if bs:
            for r in bs: r['used'] = True
            out.append([s['source'][:14], s['tx'], '%.2f' % s['amt'], s['card'], (l[0]['po'] + ' ' + l[0]['status'] + ' ' + l[0]['note']) if l else '', 'books: ' + ' + '.join('%s %.2f %s' % (r['date'], r['amt'], r['description'][:25]) for r in bs), 'sum of %d rows' % len(bs)]); continue
        b = books_near(r'lowe', s['amt'], s['tx']); kind = 'NEAR (%.2f off)' % (s['amt'] - b['amt']) if b else 'NOT IN THE BOOKS'
    if b: b['used'] = True
    out.append([s['source'][:14], s['tx'], '%.2f' % s['amt'], s['card'], (l[0]['po'] + ' ' + l[0]['status'] + ' ' + l[0]['note']) if l else '', ('books: %s %.2f %s/%s %s' % (b['date'], b['amt'], b['property'][:12], b['account'], b['description'][:30])) if b else '', kind])
for r in sorted(books, key=lambda r: r['date']):
    if not r['used'] and re.search(r'lowe', r['payee'], re.I): out.append(['BOOKS ONLY', r['date'], '%.2f' % r['amt'], '', '', '%s/%s %s | %s' % (r['property'][:12], r['account'], r['description'][:35], r['memo'][:40]), 'no bank line'])
for l in lw:
    if not l['used'] and l['date'] >= '2026-01-01': out.append(['LOWES ONLY', l['date'], '%.2f' % l['amt'], '', l['po'] + ' ' + l['status'], '', 'Lowe\'s receipt with no bank line here'])
with open('lowes_jan_mar.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['bank', 'date', 'amount', 'card', 'lowes_history', 'books', 'status']); w.writerows(out)
print("Lowe's rows:", collections.Counter(o[6].split(' (')[0][:16] for o in out).most_common())

# ---- Amazon: bank line -> order (amount, 6 days) -> books row
orders = []
for l in open('../amazon_orders_2026.txt'):
    if l.startswith('#') or '|' not in l: continue
    p = l.rstrip('\n').split('|'); orders.append({'date': p[0], 'amt': float(p[1]), 'to': p[2], 'who': p[3], 'status': p[4], 'items': p[5][:60], 'used': False})
out = []
for s in sorted(stm, key=lambda s: s['tx']):
    if not re.search(r'amazon|amzn', s['description'], re.I) or 'PRIME' in s['description'].upper(): continue
    o = [x for x in orders if not x['used'] and abs(x['amt'] - abs(s['amt'])) <= 0.01 and dd(x['date'], s['tx']) <= 6 and s['amt'] > 0]
    if o: o[0]['used'] = True
    b = books_find(r'amazon', s['amt'], s['tx'], days=6)
    if b: b['used'] = True
    out.append([s['source'][:14], s['tx'], '%.2f' % s['amt'], s['card'], ('%s %s %s %s' % (o[0]['date'], o[0]['to'], o[0]['status'], o[0]['items'])) if o else '', ('books: %s %.2f %s %s' % (b['date'], b['amt'], b['property'][:12], b['description'][:30])) if b else '',
                'in the books' if b else ('refund/credit' if s['amt'] < 0 else ('order ships to ' + o[0]['to'] + ' - not in the books' if o else 'no order found by amount - not in the books'))])
for r in sorted(books, key=lambda r: r['date']):
    if not r['used'] and re.search(r'amazon', r['payee'], re.I) and r['date'] >= '2026-01-01': out.append(['BOOKS ONLY', r['date'], '%.2f' % r['amt'], '', '', '%s %s | %s' % (r['property'][:12], r['description'][:35], r['memo'][:45]), 'no bank line'])
with open('amazon_jan_mar.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['bank', 'date', 'amount', 'card', 'order', 'books', 'status']); w.writerows(out)
print('Amazon rows:', collections.Counter(o[6][:22] for o in out).most_common())
