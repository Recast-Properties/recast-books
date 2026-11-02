import json, re, collections
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
    books.append({'date':g(r,'date'),'amt':amt,'house':g(r,'property'),'desc':str(g(r,'description'))[:45],'pay':g(r,'paid_from'),'txn':t,'acct':str(g(r,'account'))})
def pw(t): return {w[:5] for w in re.findall(r'[A-Za-z]{4,}', t.upper()) if w not in {'WITH','INCH','PACK','BLACK','WHITE','STEEL','STAINLESS','GENERAL','PURPOSE','HEAVY','DUTY'}}
PAUL=('9166','7274','6774'); PORTLAND={'4004','4013','4014'}
hist={}
for ln in open('hd_history.txt'):
    p=ln.rstrip('\n').split('|')
    if len(p)>=11: hist[p[1]]={'store':p[4]}
rec=[]
for ln in open('hd_items.txt'):
    p=ln.rstrip('\n').split('|')
    if len(p)<10 or not p[4]: continue
    date,no,card,po,total=p[0],p[1],p[2],p[3],float(p[4])
    its=[]
    for it in p[9].split(';'):
        q=it.split('~')
        if len(q)<6: continue
        try: amt=round(float(q[2] or 0)+float(q[4] or 0)+float(q[3] or 0),2)
        except: continue
        its.append({'desc':q[0],'qty':q[1],'amt':amt,'dept':q[5]})
    rec.append({'date':date,'no':no,'card':card,'po':po,'total':total,'items':its,'store':hist.get(no,{}).get('store','')})
paul=[r for r in rec if any(c in r['card'] for c in PAUL)]
def find(amount, date, desc, sign, before=90, after=10):
    out=[]
    for b in books:
        if (b['amt']>0)!=(sign>0): continue
        if abs(abs(b['amt'])-abs(amount))>0.015: continue
        d=(D(date)-D(b['date'])).days
        if -after<=d<=before: out.append(b)
    if len(out)>1:
        w=[b for b in out if pw(desc)&pw(b['desc'])]
        if w: out=w
    return out
print('=== RETURNS on Paul cards (TX stores) ===')
over=[]; under=[]
for r in sorted(paul,key=lambda r:r['date']):
    if r['total']>=0 or r['store'] in PORTLAND: continue
    for it in r['items']:
        pur=find(it['amt'], r['date'], it['desc'], +1)
        ret=find(it['amt'], r['date'], it['desc'], -1, before=10, after=90)
        tag='both' if (pur and ret) else 'PURCHASE ONLY -> record return' if pur else 'RETURN ONLY -> record purchase' if ret else 'neither (netted)'
        print('%s %s %-10s %8.2f %-42s %s %s'%(r['date'],r['no'],(r['po'] or '-')[:10],it['amt'],it['desc'][:42],tag, ('| books '+pur[0]['date']+' '+pur[0]['house'][:12]+' '+pur[0]['pay']) if pur and not ret else ''))
        if pur and not ret: over.append((r,it,pur[0]))
        if ret and not pur: under.append((r,it,ret[0]))
print('returns not recorded (books overstate): %d items, %.2f'%(len(over), sum(it['amt'] for r,it,b in over)))
print('returns recorded with no purchase (books understate): %d items, %.2f'%(len(under), sum(it['amt'] for r,it,b in under)))
print('=== PURCHASES on Paul cards (TX stores) with no books row for the item ===')
tot=0
for r in sorted(paul,key=lambda r:r['date']):
    if r['total']<=0 or r['store'] in PORTLAND: continue
    whole=find(r['total'], r['date'], '', +1, before=5, after=5)
    if whole: continue
    for it in r['items']:
        if find(it['amt'], r['date'], it['desc'], +1, before=5, after=5): continue
        # returned later?
        ret=find(it['amt'], r['date'], it['desc'], -1, before=0, after=60)
        later_ret=any(abs(x['amt']+it['amt'])<0.015 for rr in paul if rr['total']<0 and 0<=(D(rr['date'])-D(r['date'])).days<=60 for x in rr['items'])
        print('%s %s %-10s %8.2f %-42s %s'%(r['date'],r['no'],(r['po'] or '-')[:10],it['amt'],it['desc'][:42],'returned later at the store' if later_ret else ('books have a return' if ret else 'MISSING')))
        if not later_ret and not ret: tot+=it['amt']
print('missing purchases total (TX stores, Paul cards, not returned): %.2f'%tot)
print('=== Portland-store receipts on Paul cards (personal?) ===')
for r in sorted(paul,key=lambda r:r['date']):
    if r['store'] in PORTLAND: print('  ',r['date'],r['no'],'%8.2f'%r['total'],'; '.join(it['desc'][:25] for it in r['items'])[:90])
