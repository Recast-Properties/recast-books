import csv, re, collections, sys
from datetime import datetime, timedelta
D = lambda s: datetime.strptime(s, '%Y-%m-%d')
# --- books: 2026 PAUL-paid lines grouped into receipts (doc_url, else txn_id)
books = [r for r in csv.DictReader(open('paul_lines.csv')) if r['date'] >= '2026-01-01']
# need doc_url itself for grouping: re-read from journal
import json
J = json.load(open('journal.json')); ix = {k:i for i,k in enumerate(J['headers'])}
doc_of = {}
for r in J['rows']:
    if r[ix['doc_url']]: doc_of[r[ix['txn_id']]] = r[ix['doc_url']]
groups = collections.OrderedDict()
for r in books:
    key = doc_of.get(r['txn_id']) or r['txn_id']
    g = groups.setdefault(key, {'key':key,'lines':[], 'total':0.0})
    g['lines'].append(r); g['total'] += float(r['amount'])
receipts = []
for g in groups.values():
    ls = g['lines']
    receipts.append({'key':g['key'], 'total':round(g['total'],2), 'date':min(l['date'] for l in ls),
        'payee':collections.Counter(l['payee'] for l in ls).most_common(1)[0][0],
        'props':sorted({l['property'] for l in ls}), 'n':len(ls), 'source':ls[0]['source'],
        'desc':'; '.join(dict.fromkeys(l['description'][:40] for l in ls))[:120], 'matched':None})
print('books 2026 PAUL-paid: %d lines, %d receipts, total %.2f' % (len(books), len(receipts), sum(r['total'] for r in receipts)))
# --- statements
stm = list(csv.DictReader(open('statements.csv')))
for s in stm:
    s['amt'] = float(s['amount_out']); s['matched'] = None
    m = re.search(r'\s(\d{2})/(\d{2})$', s['description'])
    s['txdate'] = s['date']
    if m and s['source'].startswith('Chase checking'):
        y = int(s['date'][:4]); td = datetime(y, int(m.group(1)), int(m.group(2)))
        if td > D(s['date']) + timedelta(days=5): td = td.replace(year=y-1)
        s['txdate'] = td.strftime('%Y-%m-%d')
by_amt = collections.defaultdict(list)
for r in receipts: by_amt[round(r['total'],2)].append(r)
def match_pass(lo, hi):
    n=0
    for s in sorted(stm, key=lambda s: s['date']):
        if s['matched'] or s['amt']==0: continue
        cands = [r for r in by_amt.get(round(s['amt'],2), []) if not r['matched'] and lo <= (D(s['txdate'])-D(r['date'])).days <= hi]
        if not cands: continue
        r = min(cands, key=lambda r: abs((D(s['txdate'])-D(r['date'])).days))
        r['matched'] = s; s['matched'] = r; n+=1
    return n
print('pass1 (0..5 days):', match_pass(-1, 5), ' pass2 (-5..15):', match_pass(-5, 15), ' pass3 (-15..45):', match_pass(-15, 45))
um_s = [s for s in stm if not s['matched']]
um_b = [r for r in receipts if not r['matched']]
print('statement lines: %d, matched %d, unmatched %d (money out %.2f, money in %.2f)' % (len(stm), len(stm)-len(um_s), len(um_s), sum(s['amt'] for s in um_s if s['amt']>0), -sum(s['amt'] for s in um_s if s['amt']<0)))
print('books receipts unmatched: %d, total %.2f' % (len(um_b), sum(r['total'] for r in um_b)))
# unmatched books by month
bm = collections.defaultdict(lambda:[0,0.0])
for r in um_b: bm[r['date'][:7]][0]+=1; bm[r['date'][:7]][1]+=r['total']
print('unmatched books by month:', {k:(v[0],round(v[1],2)) for k,v in sorted(bm.items())})
with open('matched.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['stmt_source','stmt_date','stmt_desc','amount','books_date','payee','props','key'])
    for s in stm:
        if s['matched']: r=s['matched']; w.writerow([s['source'],s['date'],s['description'][:70],'%.2f'%s['amt'],r['date'],r['payee'],'/'.join(r['props']),r['key'][-40:]])
with open('unmatched_statement.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['source','date','type','amount_out','description'])
    for s in sorted(um_s, key=lambda s:(s['source'],s['date'])): w.writerow([s['source'],s['date'],s['type'],'%.2f'%s['amt'],s['description'][:90]])
with open('unmatched_books.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['date','total','payee','props','n','source','desc','key'])
    for r in sorted(um_b, key=lambda r:r['date']): w.writerow([r['date'],'%.2f'%r['total'],r['payee'],'/'.join(r['props']),r['n'],r['source'],r['desc'],r['key'][-50:]])
# recurring merchants on statements
def norm(d):
    d = re.sub(r'\b\d{2}/\d{2}\b','',d); d = re.sub(r'[#*]\S*','',d); d = re.sub(r'\d[\d\-\.]*','',d)
    return re.sub(r'\s+',' ',d).strip().upper()[:28]
rec = collections.defaultdict(list)
for s in stm:
    if s['amt']>0 and s['type'] not in ('ACCT_XFER','ATM','LOAN_PMT','Payment'): rec[(s['source'],norm(s['description']))].append(s)
with open('recurring.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['source','merchant','months','n','amounts','in_books'])
    for (src,mer),ls in sorted(rec.items(), key=lambda kv:-len({s['date'][:7] for s in kv[1]})):
        months = sorted({s['date'][:7] for s in ls})
        if len(months) < 3: continue
        amts = sorted({'%.2f'%s['amt'] for s in ls})
        w.writerow([src, mer, len(months), len(ls), ' '.join(amts[:6]), '%d/%d' % (sum(1 for s in ls if s['matched']), len(ls))])
print('recurring merchants (3+ months):', sum(1 for (src,mer),ls in rec.items() if len({s['date'][:7] for s in ls})>=3))
