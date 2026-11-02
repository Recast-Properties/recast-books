import csv, re, collections, json
from datetime import datetime, timedelta
D = lambda s: datetime.strptime(s, '%Y-%m-%d')
J = json.load(open('journal.json')); ix = {k:i for i,k in enumerate(J['headers'])}
doc_of = {r[ix['txn_id']]: r[ix['doc_url']] for r in J['rows'] if r[ix['doc_url']]}
books = [r for r in csv.DictReader(open('paul_lines.csv')) if r['date'] >= '2026-01-01']
groups = collections.OrderedDict()
for r in books:
    key = doc_of.get(r['txn_id']) or r['txn_id']
    g = groups.setdefault(key, {'key':key,'lines':[], 'total':0.0}); g['lines'].append(r); g['total'] += float(r['amount'])
receipts = []
for g in groups.values():
    ls = g['lines']
    receipts.append({'key':g['key'], 'total':round(g['total'],2), 'date':min(l['date'] for l in ls),
        'payee':collections.Counter(l['payee'] for l in ls).most_common(1)[0][0], 'props':sorted({l['property'] for l in ls}),
        'n':len(ls), 'source':ls[0]['source'], 'desc':'; '.join(dict.fromkeys(l['description'][:40] for l in ls))[:120], 'matched':None, 'note':''})
# receipts later corrected to a Recast account (Dr 2030 "corrected ... paid from the Recast")
corr = [r for r in csv.DictReader(open('lines_2030.csv')) if r['debit'] and 'corrected' in (r['memo'] or '').lower() and r['paid_from']!='PAUL']
ncorr=0
for c in corr:
    amt = round(float(c['debit']),2)
    cands = [r for r in receipts if r['total']==amt and not r['note'] and abs((D(c['date'])-D(r['date'])).days)<=10]
    if cands: cands[0]['note']='corrected to Recast account'; ncorr+=1
receipts_live = [r for r in receipts if not r['note']]
print('books 2026 PAUL-paid receipts: %d (%.2f); %d later corrected to a Recast account; %d to check (%.2f)' % (len(receipts), sum(r['total'] for r in receipts), ncorr, len(receipts_live), sum(r['total'] for r in receipts_live)))
# statements
stm = list(csv.DictReader(open('statements.csv'))) + list(csv.DictReader(open('bofa.csv')))
for s in stm:
    if s['source'].startswith('Card YTD'): s['source']='Citi card'
    s['amt'] = float(s['amount_out']); s['matched']=None; s['near']=None
    m = re.search(r'\s(\d{2})/(\d{2})$', s['description']); s['txdate']=s['date']
    if m and s['source'].startswith('Chase checking'):
        y=int(s['date'][:4]); td=datetime(y,int(m.group(1)),int(m.group(2)))
        if td > D(s['date'])+timedelta(days=5): td=td.replace(year=y-1)
        s['txdate']=td.strftime('%Y-%m-%d')
by_amt = collections.defaultdict(list)
for r in receipts_live: by_amt[r['total']].append(r)
def match_pass(lo,hi):
    n=0
    for s in sorted(stm, key=lambda s:s['date']):
        if s['matched'] or s['amt']==0: continue
        c=[r for r in by_amt.get(round(s['amt'],2),[]) if not r['matched'] and lo<=(D(s['txdate'])-D(r['date'])).days<=hi]
        if c:
            r=min(c,key=lambda r:abs((D(s['txdate'])-D(r['date'])).days)); r['matched']=s; s['matched']=r; n+=1
    return n
print('exact matches:', match_pass(-1,5), match_pass(-5,15), match_pass(-15,45))
# near matches: same store word, close date, amount differs
def words(t): return {w for w in re.findall(r'[A-Z]{4,}', t.upper()) if w not in {'DEBIT','CARD','PURCHASE','PAYMENT','WAXAHACHIE','PORTLAND','DALLAS','INC','LLC','COM','WITH','FROM'}}
near=0
for s in sorted(stm,key=lambda s:s['date']):
    if s['matched'] or s['amt']<=0: continue
    sw=words(s['description'])
    c=[r for r in receipts_live if not r['matched'] and r['total']>0 and abs((D(s['txdate'])-D(r['date'])).days)<=3 and (sw & words(r['payee'])) and abs(r['total']-s['amt'])/max(r['total'],s['amt'])<0.35]
    if c:
        r=min(c,key=lambda r:abs(r['total']-s['amt'])); r['matched']=s; s['matched']=r; s['near']=round(s['amt']-r['total'],2); near+=1
print('near matches (amount differs):', near)
um_s=[s for s in stm if not s['matched']]; um_b=[r for r in receipts_live if not r['matched']]
print('statement lines %d: exact+near matched %d, unmatched %d' % (len(stm), len(stm)-len(um_s), len(um_s)))
print('books receipts unmatched: %d (%.2f); from April on: %d (%.2f)' % (len(um_b), sum(r['total'] for r in um_b), sum(1 for r in um_b if r['date']>='2026-04'), sum(r['total'] for r in um_b if r['date']>='2026-04')))
with open('near_matches.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['src','stmt_date','stmt_desc','stmt_amt','books_date','payee','books_total','delta','props'])
    for s in stm:
        if s['near'] is not None: r=s['matched']; w.writerow([s['source'],s['date'],s['description'][:50],'%.2f'%s['amt'],r['date'],r['payee'],'%.2f'%r['total'],'%.2f'%s['near'],'/'.join(r['props'])])
with open('unmatched_books.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['date','total','payee','props','n','source','desc','key'])
    for r in sorted(um_b,key=lambda r:r['date']): w.writerow([r['date'],'%.2f'%r['total'],r['payee'],'/'.join(r['props']),r['n'],r['source'],r['desc'],r['key'][-50:]])
# bucket the unmatched statement lines
def mkey(s):
    d=s['description']; t=s['type']
    if s['amt']<0: return 'MONEY IN'
    if t in ('ACCT_XFER','LOAN_PMT','ATM','ATM_DEPOSIT','Payment','CHASE_TO_PARTNERFI') or re.search(r'Online Transfer|Payment Thank You|ONLINE PAYMENT|CARD ONLINE PAYMENT|CREDITCARD|CCPYMT|E-PAYMENT|MOBILE PMT|AUTOPAY|AFFIRM|KLARNA|Payment to Chase card|LOAN|INTEREST CHARGE|LATE FEE|MEMBERSHIP FEE|ANNUAL MEMBERSHIP|OFFER 0', d, re.I): return 'MONEY MOVES / CARD PAYMENTS / INTEREST'
    if 'Zelle' in d or t=='QUICKPAY_DEBIT':
        m=re.search(r'Zelle payment to ([A-Za-z \.\'-]+?)(?: \d|$| JPM| [0-9])', d); return 'ZELLE TO '+(m.group(1).strip().upper() if m else d[:30].upper())
    m=re.search(r'ORIG CO NAME:(\S+).*?IND ID:([A-Z][A-Za-z ]*)', d)
    if m: return 'ACH '+m.group(1)+' '+m.group(2).strip()[:14]
    d=re.sub(r'\b\d{2}/\d{2}\b','',d); d=re.sub(r'\s(\d{4})$','',d); d=re.sub(r'[#*]\S*','',d); d=re.sub(r'\d[\d\-\.]*','',d)
    return re.sub(r'\s+',' ',d).strip().upper()[:34]
with open('unmatched_statement.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['source','date','type','amount_out','description','bucket'])
    for s in sorted(um_s,key=lambda s:(s['source'],s['date'])): w.writerow([s['source'],s['date'],s['type'],'%.2f'%s['amt'],s['description'][:90],mkey(s)])
grp=collections.defaultdict(list)
for s in um_s: grp[(s['source'],mkey(s))].append(s)
with open('unmatched_merchants.txt','w') as f:
    for (src,k),ls in sorted(grp.items(), key=lambda kv:(kv[0][0], -sum(s['amt'] for s in kv[1]))):
        f.write('%s | %-36s | n=%-3d | %10.2f | %s..%s\n' % (src[:14], k, len(ls), sum(s['amt'] for s in ls), min(s['date'] for s in ls)[5:], max(s['date'] for s in ls)[5:]))
print('merchant groups:', len(grp))
