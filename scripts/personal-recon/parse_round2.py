"""Round 2 (2026-11-02): parse the statements the first pass never saw, into one CSV of the same shape as
statements.csv (source,date,description,amount_out,type,card). amount_out > 0 = money out, < 0 = a credit / refund /
payment. Usage: python3 -I parse_round2.py <out.csv> <txt dir>
Formats: Discover 3746, Capital One 5655, Wells Fargo 5685, Barclays 6774 (Mastercard) - card PDFs; Chase checking 8870
statement PDFs for Dec 24 2025 - Mar 24 2026 (the CSV starts 03/30)."""
import re, sys, os, csv, glob, collections
out, d = sys.argv[1], sys.argv[2]
MON = {m:i+1 for i,m in enumerate(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}
rows = []
def amt(s): return float(s.replace('$','').replace(',','').replace(' ','')) if s else 0.0
def yr(m, d_, end_y, end_m, end_d):
    """year for a MM/DD inside a cycle ending end_y-end_m-end_d"""
    return end_y if (m, d_) <= (end_m, end_d) else end_y - 1
def add(source, y, m, d_, desc, a, typ, card=''):
    rows.append([source, '%04d-%02d-%02d' % (y, m, d_), re.sub(r'\s+', ' ', desc).strip(), '%.2f' % a, typ, card])

# ---- Discover 3746
for p in sorted(glob.glob(os.path.join(d, 'Statement_*_3746.txt'))):
    L = open(p).read().split('\n')
    per = next(m for m in (re.search(r'(\d{2})/(\d{2})/(\d{4}) - (\d{2})/(\d{2})/(\d{4})', l) for l in L) if m)
    ey, em, ed = int(per.group(6)), int(per.group(4)), int(per.group(5))
    pend = None
    for ln in L:
        ln = ln.strip()
        m = re.search(r'(?<![\d/])(\d{2})/(\d{2}) (?![\d/])([A-Z*].*)$', ln)
        if m and not re.match(r'\d{2}/\d{2}/', ln[m.start():]):
            pend = [int(m.group(1)), int(m.group(2)), m.group(3)]
        elif pend:
            pend[2] += ' ' + ln
        else:
            continue
        a = re.search(r'(-? ?\$[\d,]+\.\d{2})$', pend[2])
        if a:
            desc = pend[2][:a.start()].strip(); v = amt(a.group(1))
            typ = 'Payment' if 'PAYMENT - THANK YOU' in desc else ('Credit' if v < 0 else 'Purchase')
            # strip the category word(s) Discover appends (last 1-2 words like "Restaurants", "Home Improvement")
            desc = re.sub(r' (Restaurants|Gasoline|Home Improvement|Services|Merchandise|Travel/Entertainment|Automotive|Supermarkets|Department Stores|Warehouse Clubs|Government Services|Education|Medical Services|Other/Miscellaneous|Interest Charge)$', '', desc)
            add('Discover 3746', yr(pend[0], pend[1], ey, em, ed), pend[0], pend[1], desc, v, typ, '3746'); pend = None

# ---- Capital One 5655
for p in sorted(glob.glob(os.path.join(d, 'Statement_*_5655.txt'))):
    L = open(p).read().split('\n')
    per = next(re.search(r'(\w{3}) (\d{1,2}), (\d{4}) - (\w{3}) (\d{1,2}), (\d{4})', l) for l in L if 'Billing Cycle' in l)
    ey, em, ed = int(per.group(6)), MON[per.group(4)], int(per.group(5))
    sect = ''
    for ln in L:
        ln = ln.strip()
        if 'Payments, Credits and Adjustments' in ln: sect = 'Payment'; continue
        if ln.endswith('#5655: Transactions'): sect = 'Purchase'; continue
        if ln.startswith('Total Transactions') or ln == 'Fees': sect = ''
        m = re.match(r'^(\w{3}) (\d{1,2}) (\w{3}) (\d{1,2}) (.+?) (- ?\$[\d,]+\.\d{2}|\$[\d,]+\.\d{2})$', ln)
        if m and sect:
            mo, dd = MON[m.group(1)], int(m.group(2)); v = amt(m.group(6))
            add('Capital One 5655', yr(mo, dd, ey, em, ed), mo, dd, m.group(5), v, sect if v > 0 or sect == 'Payment' else 'Credit', '5655')

# ---- Wells Fargo 5685
for p in sorted(glob.glob(os.path.join(d, '*WellsFargo.txt'))):
    L = open(p).read().split('\n')
    per = next(re.search(r'Statement Period (\d{2})/(\d{2})/(\d{4}) to (\d{2})/(\d{2})/(\d{4})', l) for l in L if 'Statement Period' in l)
    ey, em, ed = int(per.group(6)), int(per.group(4)), int(per.group(5))
    for ln in L:
        m = re.match(r'^(5685 )?(\d{2})/(\d{2}) (\d{2})/(\d{2}) (\w+) (.+?) ([\d,]+\.\d{2})$', ln.strip())
        if m:
            mo, dd = int(m.group(2)), int(m.group(3)); v = amt(m.group(8)); desc = m.group(7)
            if m.group(1): add('Wells Fargo 5685', yr(mo, dd, ey, em, ed), mo, dd, desc, v, 'Purchase', '5685')
            else: add('Wells Fargo 5685', yr(mo, dd, ey, em, ed), mo, dd, desc, -v, 'Payment' if 'PAYMENT' in desc else 'Credit', '5685')

# ---- Barclays 6774
for p in sorted(glob.glob(os.path.join(d, '*.txt'))):
    if not os.path.basename(p)[0].islower() or 'WellsFargo' in p: continue
    L = open(p).read().split('\n')
    per = next(re.search(r'Statement Period (\d{2})/(\d{2})/(\d{2}) - (\d{2})/(\d{2})/(\d{2})', l) for l in L if 'Statement Period' in l)
    ey, em, ed = 2000 + int(per.group(6)), int(per.group(4)), int(per.group(5))
    pend = None
    for ln in L:
        ln = ln.strip()
        m = re.match(r'^(\w{3}) (\d{2}) (\w{3}) (\d{2}) (.+)$', ln)
        if m and m.group(1) in MON and m.group(3) in MON: pend = [MON[m.group(1)], int(m.group(2)), m.group(5)]
        elif pend: pend[2] += ' ' + ln
        else: continue
        a = re.search(r'(?: (N/A|-?\d+))? (-?\$[\d,]+\.\d{2})$', pend[2])
        if a:
            desc = pend[2][:a.start()].strip(); v = amt(a.group(2))
            typ = 'Payment' if 'Payment Received' in desc else ('Interest' if 'Interest Charge' in desc else ('Credit' if v < 0 else 'Purchase'))
            add('Barclays 6774', yr(pend[0], pend[1], ey, em, ed), pend[0], pend[1], desc, v, typ, '6774'); pend = None

# ---- Chase checking 8870 statements (amount from the running balance - pypdf floats the deposit amounts away)
for p in sorted(glob.glob(os.path.join(d, '2026*-statements-8870-.txt'))):
    L = open(p).read().split('\n')
    per = next(re.search(r'(\w+) (\d{1,2}), (\d{4}) through (\w+) (\d{1,2}), (\d{4})', l) for l in L if ' through ' in l)
    ey, em, ed = int(per.group(6)), MON[per.group(4)[:3]], int(per.group(5))
    bal = amt(next(re.search(r'Beginning Balance \$([\d,]+\.\d{2})', l).group(1) for l in L if 'Beginning Balance' in l))
    pend = None; n0 = len(rows)
    for ln in L:
        ln = ln.strip()
        m = re.match(r'^(\d{2})/(\d{2}) ((?:\d{2}/\d{2} )?[A-Z].*)$', ln)
        if m and not re.match(r'^\d{2}/\d{2}/\d{2}', ln): pend = [int(m.group(1)), int(m.group(2)), m.group(3)]
        elif pend: pend[2] += ' ' + ln
        else: continue
        a = re.search(r'(?:(- [\d,]+\.\d{2}) )?([\d,]+\.\d{2})$', pend[2])
        if a and (a.group(1) or not re.search(r'\d{2}/\d{2}$', pend[2])):
            nb = amt(a.group(2)); v = round(bal - nb, 2); desc = pend[2][:a.start()].strip()
            if a.group(1) and abs(v - (-amt(a.group(1)))) > 0.005: print('BALANCE MISMATCH', p[-30:], pend, v, file=sys.stderr)
            card = (re.search(r'Card (\d{4})', desc) or [None, ''])[1]
            desc = re.sub(r' Card \d{4}$', '', desc)
            typ = 'Deposit' if v < 0 else ('Fee' if 'Fee' in desc else ('Transfer' if 'Transfer' in desc or 'Online Payment To' in desc or 'Payment To Chase' in desc else ('Zelle' if 'Zelle' in desc else 'Purchase')))
            dt = '%04d-%02d-%02d' % (yr(pend[0], pend[1], ey, em, ed), pend[0], pend[1])
            if dt < '2026-03-30':   # the CSV (Chase8870_Activity_20261023.csv, first pass) covers 03-30 onward - never count a line twice
                add('Chase checking 8870 (stmt)', yr(pend[0], pend[1], ey, em, ed), pend[0], pend[1], desc, v, typ, card)
            bal = nb; pend = None
    endbal = amt(next(re.search(r'Ending Balance \$([\d,]+\.\d{2})', l).group(1) for l in L if 'Ending Balance' in l))
    print(os.path.basename(p), len(rows) - n0, 'lines; ends at %.2f, statement says %.2f' % (bal, endbal), 'OK' if abs(bal - endbal) < 0.005 else 'MISMATCH')

with open(out, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['source', 'date', 'description', 'amount_out', 'type', 'card']); w.writerows(rows)
print(len(rows), 'lines')
for s, c in sorted(collections.Counter(r[0] for r in rows).items()):
    rs = [r for r in rows if r[0] == s]
    print('  %-28s %4d lines %s -> %s  out %.2f  credits %.2f' % (s, c, min(r[1] for r in rs), max(r[1] for r in rs),
          sum(float(r[3]) for r in rs if float(r[3]) > 0), sum(float(r[3]) for r in rs if float(r[3]) < 0)))
