import json, csv, sys, collections
d = json.load(open(sys.argv[1]))
h = d['headers']; ix = {k:i for i,k in enumerate(h)}
rows = d['rows']
g = lambda r,k: r[ix[k]]
voided = {g(r,'void_of') for r in rows if g(r,'void_of')}
void_ids = {g(r,'txn_id') for r in rows if g(r,'source')=='void'}
live = [r for r in rows if g(r,'txn_id') not in voided and g(r,'txn_id') not in void_ids]
print(len(rows),'rows', len({r[0] for r in rows}),'entries', len(voided),'voided originals', len(void_ids),'void entries')
dates = sorted(g(r,'date') for r in live)
print('live dates', dates[0], '->', dates[-1], 'live rows', len(live))
print('paid_from values:', collections.Counter(g(r,'paid_from') for r in live).most_common())
# PAUL-paid cost lines (anything not 2030), amount = debit - credit
paul = [r for r in live if g(r,'paid_from')=='PAUL' and str(g(r,'account'))!='2030']
tot = sum((g(r,'debit') or 0)-(g(r,'credit') or 0) for r in paul)
print('PAUL-paid cost lines:', len(paul), 'net %.2f' % tot)
by_month = collections.defaultdict(float)
for r in paul: by_month[g(r,'date')[:7]] += (g(r,'debit') or 0)-(g(r,'credit') or 0)
print('by month:', {k: round(v,2) for k,v in sorted(by_month.items())})
with open('paul_lines.csv','w',newline='') as f:
    w = csv.writer(f); w.writerow(['date','amount','payee','description','property','account','trade','source','doc','memo','txn_id'])
    for r in sorted(paul, key=lambda r: g(r,'date')):
        w.writerow([g(r,'date'), '%.2f' % ((g(r,'debit') or 0)-(g(r,'credit') or 0)), g(r,'payee'), g(r,'description'), g(r,'property'), g(r,'account'), g(r,'trade'), g(r,'source'), 'y' if g(r,'doc_url') else '', g(r,'memo'), g(r,'txn_id')])
# 2030 picture
l2030 = [r for r in live if str(g(r,'account'))=='2030']
cr = sum(g(r,'credit') or 0 for r in l2030); dr = sum(g(r,'debit') or 0 for r in l2030)
print('2030: credits %.2f debits %.2f balance owed to Paul %.2f' % (cr, dr, cr-dr))
# 2030 debits (paybacks / reductions) and big credits that are not PAUL-paid costs
with open('lines_2030.csv','w',newline='') as f:
    w = csv.writer(f); w.writerow(['date','debit','credit','payee','description','property','source','paid_from','memo','txn_id'])
    for r in sorted(l2030, key=lambda r: g(r,'date')):
        w.writerow([g(r,'date'), g(r,'debit') or '', g(r,'credit') or '', g(r,'payee'), g(r,'description'), g(r,'property'), g(r,'source'), g(r,'paid_from'), g(r,'memo'), g(r,'txn_id')])
nonpaul_cr = [r for r in l2030 if (g(r,'credit') or 0)>0 and g(r,'paid_from')!='PAUL']
print('2030 credits not marked PAUL-paid:', len(nonpaul_cr), 'sum %.2f' % sum(g(r,'credit') for r in nonpaul_cr))
for r in sorted(nonpaul_cr, key=lambda r:-(g(r,'credit') or 0))[:12]: print('  ', g(r,'date'), '%.2f'%g(r,'credit'), g(r,'property'), '|', (g(r,'memo') or g(r,'description'))[:90])
print('2030 debits:', len([r for r in l2030 if (g(r,'debit') or 0)>0]))
for r in sorted([r for r in l2030 if (g(r,'debit') or 0)>0], key=lambda r:-(g(r,'debit') or 0))[:15]: print('  ', g(r,'date'), '%.2f'%g(r,'debit'), g(r,'property'), '|', (g(r,'memo') or g(r,'description'))[:90])
