import json, csv, re, collections, sys
from itertools import combinations
from datetime import datetime
D=lambda s: datetime.strptime(s,'%Y-%m-%d')
J=json.load(open('journal.json')); ix={k:i for i,k in enumerate(J['headers'])}
rows=J['rows']; g=lambda r,k:r[ix[k]]
voided={g(r,'void_of') for r in rows if g(r,'void_of')}; voidids={g(r,'txn_id') for r in rows if g(r,'source')=='void'}
books=[]
for r in rows:
    t=g(r,'txn_id')
    if t in voided or t in voidids or g(r,'date')<'2025-12-15': continue
    if not re.search(r'home ?depot', str(g(r,'payee')), re.I): continue
    if str(g(r,'account')) in ('2030','1401','1402','2010','1530'): continue
    amt=round((g(r,'debit') or 0)-(g(r,'credit') or 0),2)
    if amt==0: continue
    books.append({'date':g(r,'date'),'amt':amt,'house':g(r,'property'),'desc':str(g(r,'description'))[:40],'pay':g(r,'paid_from'),'txn':t,'src':g(r,'source'),'used':None})
PAUL_CARDS=('9166','7274','6774')
rec=[]
for ln in open('hd_items.txt'):
    p=ln.rstrip('\n').split('|')
    if len(p)<10 or p[2]=='ERR': 
        if len(p)>2 and p[2]=='ERR': print('ERR', ln.strip()[:80])
        continue
    date,no,card,po,total,sub,tax,disc,status,items=p[:10]
    its=[]
    for it in items.split(';'):
        if not it: continue
        q=it.split('~')
        if len(q)<6: continue
        desc,qty,pre,tx,dc,dept=q[:6]
        try: amt=round(float(pre or 0)+float(tx or 0),2)
        except: continue
        its.append({'desc':desc,'qty':qty,'amt':amt,'dept':dept,'used':False})
    rec.append({'date':date,'no':no,'card':card,'po':po,'total':float(total or 0),'items':its,'paul':any(c in card for c in PAUL_CARDS)})
def near(b,r,d=4): return abs((D(b['date'])-D(r['date'])).days)<=d
def cands(r): return [b for b in books if b['used'] is None and near(b,r) and (b['amt']>0)==(r['total']>0)]
out=[]; missing_items=[]
for r in sorted(rec,key=lambda r:r['date']):
    c=cands(r)
    # stage 1: whole receipt = one row or a combo of up to 4 rows
    whole=None
    for k in (1,2,3,4):
        for combo in combinations(c,k):
            if abs(sum(b['amt'] for b in combo)-r['total'])<0.011: whole=combo; break
        if whole: break
    if whole:
        for b in whole: b['used']=r['no']
        out.append((r,'IN BOOKS','',''))
        continue
    # stage 2: item by item (incl. tax), then pairs
    for it in r['items']:
        m=[b for b in c if b['used'] is None and abs(b['amt']-it['amt'])<0.015]
        if m: m[0]['used']=r['no']; it['used']=True
    rem=[it for it in r['items'] if not it['used']]
    if len(rem)>=2:
        for a,b2 in combinations(rem,2):
            if a['used'] or b2['used']: continue
            m=[b for b in c if b['used'] is None and abs(b['amt']-(a['amt']+b2['amt']))<0.015]
            if m: m[0]['used']=r['no']; a['used']=b2['used']=True
    rem=[it for it in r['items'] if not it['used']]
    got=[it for it in r['items'] if it['used']]
    if not got: status='MISSING'
    elif not rem: status='IN BOOKS (by item)'
    else: status='PARTLY'
    miss_amt=round(sum(it['amt'] for it in rem),2)
    out.append((r,status,'%.2f'%miss_amt if rem else '','; '.join('%s %.2f'%(it['desc'][:30],it['amt']) for it in rem)[:160]))
    for it in rem: missing_items.append([r['date'],r['no'],r['card'],r['po'],it['desc'],it['qty'],'%.2f'%it['amt'],it['dept'],status])
with open('hd_items_compare.txt','w') as f:
    for r,s,ma,txt in out: f.write('%s %-12s %9.2f %-20s %-14s %-18s %8s %s\n'%(r['date'],r['no'],r['total'],r['card'][:20],(r['po'] or '-')[:14],s,ma,txt))
with open('hd_missing_items.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['date','receipt','card','po_job','item','qty','amount_incl_tax','dept','receipt_status']); w.writerows(missing_items)
c=collections.Counter(s for r,s,ma,txt in out); print('receipts:',dict(c))
paul=[(r,s,ma,txt) for r,s,ma,txt in out if r['paul']]
print('Paul-card receipts: %d; not fully in books: %d; missing item total %.2f'%(len(paul), sum(1 for x in paul if x[1]!='IN BOOKS' and x[1]!='IN BOOKS (by item)'), sum(float(x[2]) for x in paul if x[2])))
other=[(r,s,ma,txt) for r,s,ma,txt in out if not r['paul']]
print('Other-card receipts: %d; not fully in books: %d; missing item total %.2f'%(len(other), sum(1 for x in other if 'IN BOOKS' not in x[1]), sum(float(x[2]) for x in other if x[2])))
byhouse=collections.defaultdict(float)
for m in missing_items:
    if any(cd in m[2] for cd in PAUL_CARDS): byhouse[m[3] or '-']+=float(m[6])
print('missing (Paul cards) by PO/job:', {k:round(v,2) for k,v in sorted(byhouse.items(), key=lambda kv:-abs(kv[1]))})
un=[b for b in books if b['used'] is None and b['date']>='2026-01-01']
print('books Home Depot rows matched to no receipt item: %d, %.2f'%(len(un), sum(b['amt'] for b in un)))
with open('hd_books_unmatched.txt','w') as f:
    for b in sorted(un,key=lambda b:b['date']): f.write('%s %8.2f %-6s %-16s %-9s %s\n'%(b['date'],b['amt'],b['pay'],b['house'][:16],b['src'],b['desc']))
