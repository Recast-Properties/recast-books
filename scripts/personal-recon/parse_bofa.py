import re, sys, os, csv
rows = []; bad = []
pat = re.compile(r'^(\d{2})/(\d{2}) (\d{2})/(\d{2}) (.+?) (\d{4}) (\d{4}) (-?[\d,]+\.\d{2})$')
pat2 = re.compile(r'^(\d{2})/(\d{2}) (\d{2})/(\d{2}) (.+?) (-?[\d,]+\.\d{2})$')
for p in sys.argv[2:]:
    base = os.path.basename(p)              # eStmt_2026-04-10.txt
    sy, sm = int(base[6:10]), int(base[11:13])
    sect = ''
    for ln in open(p):
        ln = ln.strip()
        if ln in ('Payments and Other Credits','Purchases and Adjustments','Interest Charged','Fees Charged'): sect = ln; continue
        m = pat.match(ln) or pat2.match(ln)
        if not m:
            if re.match(r'^\d{2}/\d{2} \d{2}/\d{2} ', ln): bad.append((base, ln))
            continue
        tm, td = int(m.group(3)), int(m.group(4))      # posting date
        y = sy if tm <= sm else sy - 1
        amt = float(m.group(len(m.groups())).replace(',',''))
        desc = m.group(5).strip()
        rows.append(['BofA card 2575', '%04d-%02d-%02d' % (y, tm, td), desc, '%.2f' % amt, sect or 'Transaction', ''])
with open(sys.argv[1], 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source','date','description','amount_out','type','card']); w.writerows(rows)
import collections
print(len(rows), 'lines;', 'by section:', collections.Counter(r[4] for r in rows).most_common())
print('date range', min(r[1] for r in rows), '->', max(r[1] for r in rows))
print('purchases total %.2f' % sum(float(r[3]) for r in rows if r[4]=='Purchases and Adjustments'))
print('unparsed date-looking lines:', len(bad)); [print('  ', b) for b in bad[:10]]
print('--- purchases:')
for r in rows:
    if r[4]=='Purchases and Adjustments': print('  ', r[1], r[3].rjust(9), r[2][:60])
