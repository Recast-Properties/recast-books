import json, csv, collections, re
from datetime import datetime, timedelta
D=lambda s: datetime.strptime(s,'%Y-%m-%d')
J=json.load(open('journal.json')); ix={k:i for i,k in enumerate(J['headers'])}
rows=J['rows']; g=lambda r,k:r[ix[k]]
voided={g(r,'void_of') for r in rows if g(r,'void_of')}; voidids={g(r,'txn_id') for r in rows if g(r,'source')=='void'}
live=[r for r in rows if g(r,'txn_id') not in voided and g(r,'txn_id') not in voidids and g(r,'date')>='2025-12-01']
# books Home Depot entries: per txn, signed total (debits - credits on non-bank, non-2030 accounts), payer, house, doc
hd=collections.defaultdict(lambda:{'amt':0.0,'date':'','pay':'','house':set(),'doc':'','desc':[]})
for r in live:
    if not re.search(r'home ?depot', str(g(r,'payee')), re.I): continue
    acct=str(g(r,'account'))
    if acct in ('2030','1401','1402','2010'): continue
    t=g(r,'txn_id'); e=hd[t]
    e['amt']+= (g(r,'debit') or 0) - (g(r,'credit') or 0); e['date']=g(r,'date'); e['pay']=g(r,'paid_from') or e['pay']; e['house'].add(g(r,'property')); e['doc']=g(r,'doc_url') or e['doc']; e['desc'].append(str(g(r,'description'))[:30])
books=[dict(txn=t,**{k:(v if k!='house' else '/'.join(sorted(v))) for k,v in e.items()}) for t,e in hd.items()]
for b in books: b['amt']=round(b['amt'],2); b['used']=False
# receipts
rec=[]
for ln in open('hd_history.txt'):
    p=ln.rstrip('\n').split('|')
    if len(p)<11: continue
    rec.append(dict(date=p[0],no=p[1],total=float(p[2] or 0),card=p[3],store=p[4],reg=p[5],tx=p[6],onum=p[7],kind=p[8],po=p[9],origin=p[10]))
def near(b,r,days): return abs((D(b['date'])-D(r['date'])).days)<=days
out=[]
for r in sorted(rec,key=lambda r:r['date']):
    if r['total']==0: continue
    cands=[b for b in books if not b['used'] and near(b,r,4)]
    exact=[b for b in cands if abs(b['amt']-r['total'])<0.011]
    status=''
    if exact:
        exact[0]['used']=True; status='IN BOOKS (%s, %s, %s)'%(exact[0]['pay'],exact[0]['house'],exact[0]['date'])
    else:
        # sum of same-day candidates with same sign
        same=[b for b in cands if (b['amt']>0)==(r['total']>0)]
        # try subsets up to 4 that sum to total
        found=None
        from itertools import combinations
        for k in (2,3,4):
            for combo in combinations(same,k):
                if abs(sum(b['amt'] for b in combo)-r['total'])<0.011: found=combo; break
            if found: break
        if found:
            for b in found: b['used']=True
            status='IN BOOKS as %d entries (%s, %s)'%(len(found),found[0]['pay'],'/'.join(sorted({b['house'] for b in found})))
        else:
            partial=[b for b in same if near(b,r,1)]
            status='MISSING' if not partial else 'PARTLY? books that day: '+', '.join('%.2f %s %s'%(b['amt'],b['pay'],b['house']) for b in partial[:4])
    out.append((r,status))
with open('hd_compare.txt','w') as f:
    for r,s in out: f.write('%s %-12s %9.2f %-22s %-16s %s\n'%(r['date'],r['no'],r['total'],r['card'][:22],(r['po'] or '-')[:16],s))
c=collections.Counter(s.split(' ')[0] for r,s in out)
print(c)
miss=[(r,s) for r,s in out if not s.startswith('IN')]
print('not clearly in the books: %d receipts, net %.2f'%(len(miss), sum(r['total'] for r,s in miss)))
by_card=collections.Counter(r['card'][:6] for r,s in miss); print('by card:', by_card.most_common())
print('--- books Home Depot entries not matched to any receipt (%d):'%sum(1 for b in books if not b['used']))
for b in sorted([b for b in books if not b['used']], key=lambda b:b['date']): print('  ',b['date'],'%8.2f'%b['amt'],b['pay'],b['house'],'|',b['desc'][0][:40])
