import csv, sys, re, os
from datetime import datetime
out = []
def iso(s):
    return datetime.strptime(s.strip(), '%m/%d/%Y').strftime('%Y-%m-%d')
def money(s):
    s = s.replace('$','').replace(',','').replace(' ','').strip()
    return float(s) if s else 0.0
for p in sys.argv[2:]:
    base = os.path.basename(p)
    with open(p, newline='', encoding='utf-8-sig') as f:
        rd = csv.DictReader(f)
        for r in rd:
            if base.startswith('Chase8870'):
                desc = re.sub(r'\s+', ' ', r['Description']).strip()
                m = re.search(r'\s(\d{4})$', r['Description'].rstrip())
                card = m.group(1) if (m and r['Description'].rstrip() != desc) else ''
                if card and len(r['Description']) < 60: card = ''
                out.append(['Chase checking 8870', iso(r['Posting Date']), desc, '%.2f' % (-float(r['Amount'])), r['Type'], card])
            elif base.startswith('Chase6926'):
                out.append(['Chase card 6926', iso(r['Transaction Date']), r['Description'].strip(), '%.2f' % (-float(r['Amount'])), r['Type'], ''])
            elif base.lower().startswith('year to date'):
                amt = money(r['Debit']) - money(r['Credit'].replace('-',''))  if r['Credit'].strip() else money(r['Debit'])
                desc = re.sub(r'\s*null\s*X+\d{4}', '', r['Description']).strip()
                out.append(['Card YTD (unknown issuer)', iso(r['Date']), desc, '%.2f' % amt, r['Status'], ''])
out.sort(key=lambda x: (x[0], x[1]))
with open(sys.argv[1], 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source','date','description','amount_out','type','card']); w.writerows(out)
import collections
c = collections.Counter(x[0] for x in out)
for src in c:
    ds = [x[1] for x in out if x[0]==src]
    print(src, c[src], 'lines', min(ds), '->', max(ds), 'money out %.2f' % sum(float(x[3]) for x in out if x[0]==src and float(x[3])>0))
