import csv, re, collections, json
from datetime import datetime, timedelta
D = lambda s: datetime.strptime(s, '%Y-%m-%d')
J = json.load(open('journal.json')); ix = {k:i for i,k in enumerate(J['headers'])}
doc_of = {r[ix['txn_id']]: r[ix['doc_url']] for r in J['rows'] if r[ix['doc_url']]}
books = [r for r in csv.DictReader(open('paul_lines.csv')) if r['date'] >= '2026-01-01']
groups = collections.OrderedDict()
for r in books:
    key = r['txn_id']
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
    s['amt'] = float(s['amount_out']); s['matched']=None; s['near']=None; s['combo']=''
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
print('exact matches (per entry):', match_pass(-1,5), match_pass(-5,15), match_pass(-20,45))
docg = collections.defaultdict(list)
for r in receipts_live:
    if not r['matched'] and doc_of.get(r['key']): docg[doc_of[r['key']]].append(r)
synth = []
for d, rs in docg.items():
    if len(rs) < 2: continue
    s = {'key':'doc:'+d, 'total':round(sum(x['total'] for x in rs),2), 'date':min(x['date'] for x in rs), 'payee':rs[0]['payee'], 'props':sorted({p for x in rs for p in x['props']}), 'n':sum(x['n'] for x in rs), 'source':rs[0]['source'], 'desc':'; '.join(x['desc'][:30] for x in rs)[:120], 'matched':None, 'note':'', 'members':rs}
    synth.append(s); by_amt[s['total']].append(s)
n2 = match_pass(-1,5) + match_pass(-5,15) + match_pass(-20,45)
for s in synth:
    if s['matched']:
        for x in s['members']: x['matched'] = s['matched']; x['note'] = 'part of one bank line %.2f' % s['total']
print('exact matches (receipt = several entries):', n2)
# combination passes
def dd(a,b): return abs((D(a)-D(b)).days)
ALIAS = {'SWA':'SOUTHWEST','SQSP':'SQUARESPACE','UBR':'UBER','COMMUNITYARCH':'COMMUNITY','SERVFEE':'CITY','TRAVELOCITY':'SOUTHWEST','PREMSEAT':'SOUTHWEST','TST':'','SQ':''}
def mw(t):
    ws=set()
    for w in re.findall(r'[A-Za-z]{2,}', t.upper()):
        w=ALIAS.get(w,w)
        if len(w)>=3 and w not in {'THE','INC','LLC','COM','AND','DEBIT','CARD','PURCHASE','PAYMENT','WAXAHACHIE','PORTLAND','DALLAS','WILMINGTON','FRANCISCO','SEATTLE','TX','OR','CA','WA','DE','NY','MA','TECHNOLOGIES','PENDING','HELP','BILL','AMZN','ONLINE','OFFICE','STORE'}: ws.add(w)
    return ws
def same(a,b): return bool(mw(a)&mw(b))
ncomb=0
# (a) one bank line = two books receipts (same source statement, both within 4 days of the line)
for s in sorted(stm,key=lambda s:s['date']):
    if s['matched'] or s['amt']<=0: continue
    c=[r for r in receipts_live if not r['matched'] and 0<r['total']<s['amt'] and dd(s['txdate'],r['date'])<=4 and same(s['description'],r['payee'])]
    found=None
    for i in range(len(c)):
        for j in range(i+1,len(c)):
            if abs(c[i]['total']+c[j]['total']-s['amt'])<0.011: found=(c[i],c[j]); break
        if found: break
    if found:
        for r in found: r['matched']=s; r['note']='half of one bank line %.2f'%s['amt']
        s['matched']=found[0]; s['near']=0.0; s['combo']='2 receipts: %s %.2f + %s %.2f'%(found[0]['payee'],found[0]['total'],found[1]['payee'],found[1]['total']); ncomb+=1
# (b) one books receipt = two bank lines (within 4 days of each other and of the receipt)
for r in sorted(receipts_live,key=lambda r:r['date']):
    if r['matched'] or r['total']<=0: continue
    c=[s for s in stm if not s['matched'] and 0<s['amt']<r['total'] and dd(s['txdate'],r['date'])<=4 and same(s['description'],r['payee'])]
    found=None
    for i in range(len(c)):
        for j in range(i+1,len(c)):
            if abs(c[i]['amt']+c[j]['amt']-r['total'])<0.011 and dd(c[i]['date'],c[j]['date'])<=4: found=(c[i],c[j]); break
        if found: break
    if found:
        for s in found: s['matched']=r; s['near']=0.0; s['combo']='2 bank lines for %s %.2f'%(r['payee'],r['total'])
        r['matched']=found[0]; ncomb+=1
print('combination matches:', ncomb)
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
        if s['near'] is not None and not s['combo']: r=s['matched']; w.writerow([s['source'],s['date'],s['description'][:50],'%.2f'%s['amt'],r['date'],r['payee'],'%.2f'%r['total'],'%.2f'%s['near'],'/'.join(r['props'])])
with open('unmatched_books.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['date','total','payee','props','n','source','desc','key'])
    for r in sorted(um_b,key=lambda r:r['date']): w.writerow([r['date'],'%.2f'%r['total'],r['payee'],'/'.join(r['props']),r['n'],r['source'],r['desc'],r['key'][-50:]])
# bucket the unmatched statement lines
def mkey(s):
    d=s['description']; t=s['type']
    if s['amt']<0: return 'MONEY IN'
    if t in ('ACCT_XFER','LOAN_PMT','ATM','ATM_DEPOSIT','Payment','CHASE_TO_PARTNERFI') or re.search(r'Online Transfer|Payment Thank You|ONLINE PAYMENT|CARD ONLINE PAYMENT|CREDITCARD|CCPYMT|E-PAYMENT|MOBILE PMT|AUTOPAY|AFFIRM|KLARNA|Payment to Chase card|BANK OF AMERICA PAYMENT|BK OF AMER|LOAN|INTEREST CHARGE|LATE FEE|MEMBERSHIP FEE|ANNUAL MEMBERSHIP|OFFER 0', d, re.I): return 'MONEY MOVES / CARD PAYMENTS / INTEREST'
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

with open('combos.txt','w') as f:
    for s in stm:
        if s['combo']: f.write('%s %s %8.2f %s -> %s\n' % (s['source'][:10], s['date'], s['amt'], s['description'][:45], s['combo']))
# detail dumps for the groups that need a look
LOOK = re.compile(r"HOME DEPOT WAXAHACHIE|LOWE'S WAXAHACHIE|LOWES|UBER TECHNOLOGIES|UBR|ALASKA AIR|AMERICAN AIR|UNITED|SWA |TRAVELOCITY|ZELLE|VENMO|^CHECK|WITHDRAWAL|SQ - CORPORATE|IP OF OVILLA|WP GREENERY|QUANTUM|OFFICE DEPOT|HARBOR FREIGHT|MATTERPORT|TEXASFILE|TEXTGRID|VAPI|MIDJOURNEY|OPENAI|APIFY|TELNYX|SQSP|GODADDY|COMMUNITY|WIRE|AMAZON|CITY OF|MUNICIPAL|SERVFEE|FEDEX|WIFIONBOARD|KEITH|TIGER MART|SHELL|CORELOGIC|GOOGLE G.CO|ENERGY|ATMOS|TXU|SPLITWISE|DEPT OF REVENUE PYMT S TN|UA INFLT|BA INFLIGHT")
with open('look_lines.txt','w') as f:
    for s in sorted(um_s,key=lambda s:(mkey(s),s['date'])):
        k=mkey(s)
        if s['amt']>0 and k not in ('MONEY MOVES / CARD PAYMENTS / INTEREST',) and LOOK.search(k): f.write('%-10s %s %9.2f %-30s %s\n'%(s['source'][:10],s['date'],s['amt'],k[:30],s['description'][:60]))
with open('money_moves.txt','w') as f:
    for s in sorted(um_s,key=lambda s:s['date']):
        if mkey(s)=='MONEY MOVES / CARD PAYMENTS / INTEREST' and s['source'].startswith('Chase checking'): f.write('%s %10.2f %-14s %s\n'%(s['date'],s['amt'],s['type'],s['description'][:70]))
with open('money_in.txt','w') as f:
    for s in sorted(um_s,key=lambda s:s['date']):
        if s['amt']<0 and s['source'].startswith('Chase checking'): f.write('%s %11.2f %-14s %s\n'%(s['date'],-s['amt'],s['type'],s['description'][:70]))
# tie the books' reimbursements to Paul (2030 debits not PAUL-paid, from 03-30) to deposits in his checking
deb=[r for r in csv.DictReader(open('lines_2030.csv')) if r['debit'] and r['paid_from']!='PAUL' and r['date']>='2026-03-25' and 'corrected' not in (r['memo'] or '').lower()]
dep=[s for s in stm if s['amt']<0 and s['source'].startswith('Chase checking')]
with open('reimb_ties.txt','w') as f:
    for r in sorted(deb,key=lambda r:r['date']):
        amt=round(float(r['debit']),2)
        c=[s for s in dep if abs(-s['amt']-amt)<0.011 and abs((D(s['date'])-D(r['date'])).days)<=12]
        f.write('%s %11.2f | %-40s | %s\n'%(r['date'],amt,(r['memo'] or r['description'])[:40], ('DEPOSIT %s %s'%(c[0]['date'],c[0]['description'][:40])) if c else 'no deposit found'))
