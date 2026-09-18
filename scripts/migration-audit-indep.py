# Run from data/migration/2026-09-17:  python3 ../../../scripts/migration-audit-indep.py /tmp/indep-rows.json
# Independent re-parse of the old workbook snapshot. Shares no code with scripts/migration-*.py.
import openpyxl, json, re, datetime, sys
from collections import defaultdict
from openpyxl.utils import get_column_letter as L
wb=openpyxl.load_workbook('old-workbook-snapshot.xlsx',data_only=True)
HDR={'RECAST BIZ':1}
SKIP_LABEL=re.compile(r'rehab total|total project|purchase|interest to date|current total|paul|dennis|recast',re.I)
TABS=['RECAST BIZ','881 Newport','469 Brushwood','366 Mesa','136 Bowling Green','104 Ashburne','1616 Granite RECONCILED','280 Sparkling RECONCILED']
def num(v):
    if isinstance(v,bool): return None
    if isinstance(v,(int,float)): return float(v)
    return None
rows=[]
for tab in TABS:
    ws=wb[tab]; h=HDR.get(tab,2)
    hdr=[(c.column,c.value) for c in ws[h] if c.value not in (None,'')]
    blocks=[]
    for i,(col,val) in enumerate(hdr):
        if isinstance(val,str) and not SKIP_LABEL.search(val):
            # total = next numeric header cell within 5 cols
            for col2,val2 in hdr[i+1:]:
                if col2-col>5: break
                if num(val2) is not None: blocks.append((val.strip(),col,col2,val2)); break
                if isinstance(val2,str) and not re.search(r'paid|account',val2,re.I): break
    for name,c0,ct,tot in blocks:
        s=0;n=0
        for r in range(h+1,ws.max_row+1):
            a=ws.cell(r,ct).value
            payee=ws.cell(r,c0).value
            if a in (None,''): continue
            if payee in (None,'') and all(ws.cell(r,c).value in (None,'') for c in range(c0,ct)): continue
            v=num(a); flag=''
            if v is None:
                flag='TEXT:'+repr(a)
                m=re.fullmatch(r'\s*\$?([\d.,]+)\s*',str(a))
                v=float(m.group(1).replace(',','.')) if m and str(a).count(',')==1 and '.' not in str(a) else None
            d=ws.cell(r,c0+1).value
            rows.append(dict(tab=tab,block=name,cell=f'{L(ct)}{r}',payee=payee,date=d.date().isoformat() if isinstance(d,datetime.datetime) else d,desc=ws.cell(r,c0+2).value,amt=v,flag=flag))
            if not flag: s+=v
            n+=1
        print(f'{tab:28s} {name:28s} hdr={tot:>12.2f} rows={n:4d} sum_numeric={s:>12.2f} diff={s-tot:>10.2f}')
json.dump(rows,open(sys.argv[1],'w'),default=str,indent=0)
tot=defaultdict(float)
for r in rows: tot[r['tab']]+= r['amt'] or 0
for k,v in tot.items(): print(f'{k:28s} {v:12.2f}')
print('ALL',len(rows),round(sum(tot.values()),2))
