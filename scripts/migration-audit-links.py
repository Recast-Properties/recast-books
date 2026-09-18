# Link audit. Run from the repo root:  python3 scripts/migration-audit-links.py <dir>   where <dir>/env/*.json are the
# envelopes downloaded from the books-docs Blobs store. Its first section should list only old-poller id links.
import json,glob,csv,re,datetime,sys
from collections import Counter,defaultdict
S=sys.argv[1]
env={}
for f in glob.glob(S+'/env/*.json'):
    e=json.load(open(f)); env[e['docId']]=e
def tot(e): return (e.get('model') or {}).get('receipt_total_cents')
def ven(e): return ((e.get('model') or {}).get('vendor') or '')
def dat(e): return ((e.get('model') or {}).get('date') or '')[:10]
def norm(s): return set(re.findall(r'[a-z]{3,}',re.sub(r"[’']",'',s.lower())))-{'the','inc','llc','com','home','and'}
def vsim(a,b):
    A,B=norm(a),norm(b); return bool(A&B) or any(x[:4]==y[:4] for x in A for y in B)
def dd(a,b):
    try: return abs((datetime.date.fromisoformat(a)-datetime.date.fromisoformat(b)).days)
    except: return 999
ent=[e for e in csv.DictReader(open('data/migration/2026-09-17/rows/entries.csv')) if not e['skip']]
linked=[e for e in ent if e['docId'] and e['doc_url']]
print('envelopes',len(env),'linked entries',len(linked),'missing envelope',sum(1 for e in linked if e['docId'] not in env))
bydoc=defaultdict(list)
for e in linked: bydoc[e['docId']].append(e)
exact_by_total=defaultdict(list)
for d,e in env.items():
    if tot(e) and not d.startswith(('dry-','up-test')): exact_by_total[tot(e)].append(d)
# twins: docs that are duplicates of each other (same vendor,total,date) are equivalent
def equiv(d1,d2): return tot(env[d1])==tot(env[d2]) and dat(env[d1])==dat(env[d2])
sus=[]; vend_mis=[]; 
for e in linked:
    d=e['docId']
    if d not in env: continue
    amt=int(e['amount_cents']); E=env[d]
    if e['match']=='strong' and not vsim(e['payee'],ven(E)+' '+E.get('subject','')+' '+E.get('from','')): vend_mis.append(e)
    # better doc exists?
    if tot(E)!=amt or dd(e['date'],dat(E))>10:
        better=[x for x in exact_by_total.get(amt,[]) if x!=d and vsim(e['payee'],ven(env[x])) and dd(e['date'],dat(env[x]))<=3 and not equiv(x,d)]
        if better and len(bydoc[d])==1:
            sus.append((e,better))
print('\nLINKED ROW WHERE A DIFFERENT DOC MATCHES EXACTLY (amount = total, same vendor, <=3 days) and the linked doc does not:',len(sus))
for e,b in sus:
    E=env[e['docId']]
    claimed=[ (x, [ (r['date'],r['amount_cents']) for r in bydoc.get(x,[])]) for x in b]
    print(f"  row {e['date']} {e['payee'][:22]:22s} {int(e['amount_cents'])/100:>9.2f} [{e['property']}] -> linked {e['docId']} {dat(E)} total {tot(E)/100 if tot(E) else None} | exact doc(s): {claimed}")
print('\nSTRONG LINKS WITH NO VENDOR RESEMBLANCE:',len(vend_mis))
for e in vend_mis[:60]:
    E=env[e['docId']]; print(f"  {e['date']} {e['payee'][:25]:25s} {int(e['amount_cents'])/100:>9.2f} -> {ven(E)[:45]:45s} {dat(E)} {tot(E)} rows_on_doc={len(bydoc[e['docId']])}")
json.dump([ (e['txn_id'],b) for e,b in sus],open(S+'/sus.json','w'))

print('\n=== rows on a doc: coverage check ===')
def items(E):
    out=[]
    for en in (E.get('model') or {}).get('entries') or []:
        for i in en.get('items') or []:
            if isinstance(i.get('amount_cents'),int): out.append(i['amount_cents'])
    return out
cat=Counter(); ex=defaultdict(list)
for d,es in bydoc.items():
    if d not in env: continue   # a document linked by Gmail id that was never read (the bank's Zelle confirmations)
    E=env[d]; t=tot(E) or 0; s=sum(int(e['amount_cents']) for e in es); its=items(E)
    kinds={e['match'] for e in es}
    if s==t: c='rows sum = receipt total'
    elif t==0: c='receipt has no total (note/estimate/unread)'
    elif s<t:
        # each row equals an item or items+tax? test: row amount equals some item, or some item * (1+tax rate)
        m=E['model']; sub=m.get('subtotal_cents') or 0; tax=m.get('tax_cents') or 0; rate=(tax/sub) if sub else 0
        def expl(a): return any(abs(a-i)<=1 or abs(a-round(i*(1+rate)))<=2 for i in its)
        c='rows < total, every row = an item (±tax)' if all(expl(int(e['amount_cents'])) for e in es) else 'rows < total, some row matches no single item'
    else: c='rows > receipt total'
    cat[c]+=1; ex[c].append((d,es,t,s))
for k,v in cat.items(): print(f'  {v:4d} docs  {k}   (rows: {sum(len(x[1]) for x in ex[k])}, $ {sum(x[3] for x in ex[k])/100:,.2f})')
print('\nsample of "some row matches no single item" with ONE row on the doc (near-amount style links):')
n=0
for d,es,t,s in sorted(ex['rows < total, some row matches no single item'],key=lambda x:-x[3]):
    if len(es)==1:
        e=es[0]; n+=1
        if n<=40: print(f"  {e['date']} {e['payee'][:22]:22s} {s/100:>9.2f} [{e['match']}] -> {ven(env[d])[:30]:30s} {dat(env[d])} total {t/100:>9.2f} items={sorted(items(env[d]))[-4:]}")
print('  count',n)
