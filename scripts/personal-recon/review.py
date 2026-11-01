import csv, re, collections
rows = list(csv.DictReader(open('unmatched_statement.csv')))
SURE = [
 (r'APIFY',"Recast - Apify (the scrapers). Not in the books."),
 (r'TELNYX',"Recast - Telnyx (Jennifer's phone line). Not in the books."),
 (r'SQSP\* WORKSP',"Recast - Google Workspace for October. Not in the books."),
 (r'SQSP\* WEBSIT',"Recast - Squarespace website/domain renewal. Not in the books."),
 (r'GODADDY',"Recast? - a domain renewal. Not in the books."),
 (r'Matterport',"Recast - Matterport 3D tours. Not in the books (monthly)."),
 (r'TexasFile',"Recast - county records lookup. Not in the books."),
 (r'TEXTGRID',"Recast - text messaging for the scheduler. Not in the books."),
 (r'VAPI',"Recast - voice AI test. Not in the books."),
 (r'I3P\*CITY OF OVILLA',"Recast? - City of Ovilla utility payment, looks like 104 Ashburne water. The books hold other Ovilla amounts, not these."),
 (r'SQ \*50FLOOR - CORPORATE Ovilla',"Recast? - 50 Floor at Ovilla = 104 Ashburne flooring. Not in the books."),
 (r'CA-ORDER\* COMMUNITY',"Recast - the Granite/Sparkling HOA letters. Books hold 465.00 and 485.00; the bank shows 18.60 and 19.40 more (card fees)."),
 (r'THE HOME DEPOT #6505',"Recast? - Home Depot Waxahachie with no matching receipt in the books. Which house?"),
 (r"LOWE'S #2601|LOWES #00907","Recast? - Lowe's with no matching receipt in the books. Which house?"),
 (r'OFFICE DEPOT',"Recast? - office supplies/prints. Not in the books."),
 (r'FEDEX OFFICE 1437',"Recast? - prints in Waxahachie. Tiny."),
 (r'WIFIONBOARD ALASKA.*09/18',"Recast - wifi on the Sep 18 DFW-PDX flight that is in the books. Tiny."),
]
ASK = [
 (r'OPENAI',"ChatGPT monthly. Business or personal? (The books hold one OpenAI API top-up as business.)"),
 (r'UBER\s+\*ONE',"Uber One membership. The books hold 3 of these as business and not the other 5 - tell me which way it goes."),
 (r'MIDJOURNEY',"Midjourney (AI images). Business or personal?"),
 (r'WP\*THE GREENERY',"The Greenery (the Ashburne mulch/rock yard), 20.00 every month Apr-Sep. What is this?"),
 (r'QUANTUM FIBER',"Quantum Fiber internet, 75.00 a month. Where is this service - a Recast house or your place?"),
 (r'VENMO \*Ramon Garcia',"Venmo to Ramon Garcia. Who is he and which house?"),
 (r'VENMO \*Eric Baird',"Venmo to Eric Baird 1,500.00. Recast or personal?"),
 (r'Zelle payment to Armandre Vega',"Zelle 100.00 to Armandre Vega on the day the books show his 550.00 bath fan at Ashburne. Part of it?"),
 (r'^CHECK 117',"A check with no name in the bank file. Who was it to?"),
 (r'CHECK YOUR',"'Check Your' 30.00 - a screening service? Recast or personal?"),
 (r'AMAZON MKTPL|Amazon\.com\*',"Amazon order with no receipt in the books. Recast (which house) or personal?"),
 (r'UBER TECHNOLOGIES|UBR\*|UBER \*TRIP|UBER \* PENDING|UBER \*TRIP',"Uber ride not in the books. Airport/work ride (business) or personal?"),
 (r'ALASKA AIR|AMERICAN AIR|UNITED 0|TRAVELOCITY|SWA\*|UA INFLT|BA INFLIGHT',"Flight charge not in the books. A TX work trip (business) or personal?"),
 (r'HARBOR FREIGHT',"Harbor Freight tools, Gresham OR. For a Recast house or personal?"),
 (r'SHELL OIL 91002222151 OVILLA|SHELL SERVICE STATION|TIGER MART',"Small gas-station items near the houses (drinks for the crew?). Recast or personal?"),
 (r'DEPT OF REVENUE PYMT S .*TN',"Tennessee Dept of Revenue 45.59. Recast or personal?"),
 (r'WITHDRAWAL 04/06',"Cash 3,150.00 on Apr 6. Was this the cash for Julio's crew at Ashburne?"),
]
MONEY_IN = [
 (r'DEPOSIT ID NUMBER 120564',"30,000.00 deposited at a branch on Sep 14. Where did this come from? The books show no payment to you that day."),
 (r'VENMO REF',"982.50 came in by Venmo on Jul 2. From whom - Recast money or personal?"),
 (r'WF\* WAYFAIR4420857237',"Wayfair refund 1,093.30 on Apr 2. Was the order for 104 Ashburne? If so the refund belongs in the books."),
 (r'AUCTION\.COM',"Auction.com paid you 1,000.00 on Aug 2 - a bid deposit back. Did the deposit go out from your account or from Citizens?"),
]
import json
from datetime import datetime
J=json.load(open('journal.json')); jx={k:i for i,k in enumerate(J['headers'])}
voided={r[jx['void_of']] for r in J['rows'] if r[jx['void_of']]}; voidids={r[jx['txn_id']] for r in J['rows'] if r[jx['source']]=='void'}
tot=collections.defaultdict(float); meta={}
for r in J['rows']:
    t=r[jx['txn_id']]
    if t in voided or t in voidids or r[jx['date']]<'2026-01-01': continue
    if r[jx['debit']] and str(r[jx['account']])!='2030': tot[t]+=r[jx['debit']]; meta.setdefault(t,(r[jx['date']],r[jx['payee']],r[jx['paid_from']],r[jx['property']]))
    if r[jx['credit']] and str(r[jx['account']]) not in ('2030','1401','1402','2010') : tot[t]-=r[jx['credit']]
def pw(t): return {w[:4] for w in re.findall(r'[A-Za-z]{3,}', t.upper()) if w not in {'THE','INC','LLC','COM','AND','TX','WAXAHACHIE'}}
def books_check(amount, date, desc):
    hits=[]
    for t,v in tot.items():
        if t not in meta or meta[t][2] not in ('PAUL',''): continue
        if abs(abs(v)-amount)>=0.011: continue
        days=abs((datetime.strptime(meta[t][0],'%Y-%m-%d')-datetime.strptime(date,'%Y-%m-%d')).days)
        if days>10: continue
        if (pw(desc) & pw(meta[t][1] or '')) or (days<=2 and amount>=50): hits.append(meta[t])
    return hits
ub = [x for x in csv.DictReader(open('unmatched_books.csv')) if x['date']>='2026-01-01']
def near_store(amount, date, desc):
    best=None
    for x in ub:
        if not (pw(desc) & pw(x['payee'])): continue
        days=abs((datetime.strptime(x['date'],'%Y-%m-%d')-datetime.strptime(date,'%Y-%m-%d')).days)
        if days>3: continue
        t=float(x['total'])
        if t<=0 or abs(t-amount)/max(t,amount)>0.25: continue
        if best is None or abs(t-amount)<abs(float(best['total'])-amount): best=x
    return best
out=[]
for r in rows:
    d=r['description']; amt=float(r['amount_out']); src=r['source'].replace('Chase checking 8870','Chase checking (9166/7274)').replace('Chase card 6926','Chase card 6926')
    read=None; kind=None
    if amt<0:
        for p,t in MONEY_IN:
            if re.search(p,d): read=t; kind='Money in'; break
    else:
        for p,t in SURE:
            if re.search(p,d): read=t; kind='Looks like Recast'; break
        if not read:
            for p,t in ASK:
                if re.search(p,d): read=t; kind='Question'; break
    if read:
        hits = books_check(abs(amt), r['date'], d) if amt>0 else []
        nb = near_store(abs(amt), r['date'], d) if (amt>0 and not hits and re.search(r'HOME DEPOT|LOWE', d)) else None
        if nb:
            kind='Same trip, different total'; read='The books have %s %s on %s for %s; the bank took %.2f. Difference %.2f - items left off or returned at the till. Nothing to do unless you want the difference added.' % (nb['payee'], nb['total'], nb['date'], nb['props'], abs(amt), abs(amt)-float(nb['total'])); ub.remove(nb)
        if hits:
            h=hits[0]; kind='In the books already'; read='The books have %s on %s, paid by %s%s - the same charge, so nothing to add.' % (h[1], h[0], {'PAUL':'you','1401':'Citizens','1402':'Recast Chase','DENNIS':'Dennis'}.get(h[2],h[2] or 'unknown'), (' ('+h[3]+')') if h[3] else '')
        out.append([r['date'], src, re.sub(r'\s+',' ',d)[:60], '%.2f'%abs(amt), kind, read, ''])
order={'Looks like Recast':0,'Question':1,'Money in':2,'Same trip, different total':3,'In the books already':4}
out.sort(key=lambda x:(order[x[4]], x[5][:12], x[0]))
with open('/Users/paulbjork/Desktop/Personal 2026/Review - not in the books.csv','w',newline='') as f:
    w=csv.writer(f); w.writerow(['Date','Account','What the bank says','Amount','Group',"Penny's read",'Your answer (Recast + house, or Personal)']); w.writerows(out)
import collections
c=collections.Counter(x[4] for x in out); print(c, 'rows', len(out))
print('Looks like Recast total: %.2f' % sum(float(x[3]) for x in out if x[4]=='Looks like Recast'))
print('Questions total: %.2f' % sum(float(x[3]) for x in out if x[4]=='Question'))
for x in out:
    if x[4]=='Looks like Recast': print('  ', x[0], x[3].rjust(8), x[2][:45])
