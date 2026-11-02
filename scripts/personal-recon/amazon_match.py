# Three-way: Amazon orders <-> books Amazon entries <-> bank Amazon lines.
import json, csv, sys, itertools, datetime as dt, collections
W = sys.argv[1]  # penny-work folder
J = sys.argv[2]  # journal.json
D = lambda s: dt.date.fromisoformat(s[:10])
d = json.load(open(J)); ix = {k:i for i,k in enumerate(d['headers'])}; g = lambda r,k: r[ix[k]]
rows = d['rows']
voided = {g(r,'void_of') for r in rows if g(r,'void_of')}
live = [r for r in rows if g(r,'txn_id') not in voided and g(r,'source')!='void']
PAY = {'2030','1401','1402','2010'}
ent = collections.OrderedDict()
for r in live:
    if 'amazon' not in str(g(r,'payee')).lower(): continue
    e = ent.setdefault(g(r,'txn_id'), dict(id=g(r,'txn_id'), date=g(r,'date'), amt=0.0, prop=g(r,'property'), pf=g(r,'paid_from'), desc=g(r,'description'), src=g(r,'source'), accts=set()))
    if str(g(r,'account')) not in PAY:
        e['amt'] += (g(r,'debit') or 0) - (g(r,'credit') or 0); e['accts'].add(str(g(r,'account')))
        if g(r,'property') != 'OVERHEAD' or e['prop']=='': e['prop'] = g(r,'property')
books = list(ent.values())
for e in books: e['amt'] = round(e['amt'],2)
orders = []
for ln in open(f'{W}/amazon_orders_2026.txt'):
    if ln.startswith('#') or not ln.strip(): continue
    p = ln.rstrip('\n').split('|')
    if float(p[1]) == 0: continue
    orders.append(dict(date=p[0], amt=float(p[1]), ship=p[2], who=p[3], status=p[4], items=p[5]))
bank = [r for r in csv.DictReader(open(f'{W}/statements.csv')) if 'amaz' in r['description'].lower() or 'amzn' in r['description'].lower()]
for b in bank: b['amt'] = float(b['amount_out'])
# order -> bank (exact, 0..+8 days)
for o in orders:
    o['bank'] = None
    for b in bank:
        if b.get('used') or abs(b['amt']-o['amt'])>0.005: continue
        if 0 <= (D(b['date'])-D(o['date'])).days <= 8: o['bank']=b; b['used']=1; break
# order -> books: single exact, then subsets of up to 4 orders within 3 days summing to an entry
for o in orders: o['books']=None
for e in books: e['orders']=[]
def near(a,b,lo=-3,hi=10): return lo <= (D(b)-D(a)).days <= hi
for e in books:
    for o in orders:
        if o['books'] is None and abs(o['amt']-e['amt'])<0.005 and near(o['date'], e['date']):
            o['books']=e; e['orders']=[o]; break
for e in books:
    if e['orders'] or e['amt']<=0: continue
    cand = [o for o in orders if o['books'] is None and near(o['date'], e['date'], -4, 6)]
    hit = None
    for n in (2,3,4):
        for c in itertools.combinations(cand, n):
            if abs(sum(o['amt'] for o in c)-e['amt'])<0.005: hit=c; break
        if hit: break
    if hit:
        for o in hit: o['books']=e
        e['orders']=list(hit)
out = []
for o in sorted(orders, key=lambda o:o['date']):
    e=o['books']; b=o['bank']
    out.append('|'.join([o['date'], '%.2f'%o['amt'], o['ship'], o['who'][:12], o['status'][:22], o['items'][:70],
        ('BOOKS %s %.2f %s %s %s'%(e['date'],e['amt'],e['prop'],e['pf'],e['src'])) if e else 'books -',
        ('BANK %s %s'%(b['date'],b['source'][:14])) if b else 'bank -']))
open('orders3.txt','w').write('\n'.join(out)+'\n')
ub = [e for e in books if not e['orders']]
open('books_unmatched.txt','w').write('\n'.join('%s|%.2f|%s|%s|%s|%s|%s'%(e['date'],e['amt'],e['prop'],e['pf'],e['src'],e['desc'][:80],e['id']) for e in sorted(ub,key=lambda e:e['date']))+'\n')
bu = [b for b in bank if not b.get('used')]
open('bank_unmatched.txt','w').write('\n'.join('%s|%.2f|%s|%s'%(b['date'],b['amt'],b['source'],b['description'][:60]) for b in sorted(bu,key=lambda b:b['date']))+'\n')
print(len(orders),'orders', len(books),'books entries', len(bank),'bank lines;', sum(1 for o in orders if o['books']),'orders in books;', sum(1 for o in orders if o['bank']),'orders on bank;', len(ub),'books unmatched;', len(bu),'bank unmatched')
