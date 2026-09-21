# Phase 4 comparison — 2026-09-21

Documents: 968  status {'dismissed': 274, 'pending': 386, 'posted': 271, 'dry': 22, 'error': 15}  verdict {'dismiss': 288, 'hold': 175, 'post': 505}
Hold reasons: [('NOT_POST_VERDICT', 335), ('LOW_CONFIDENCE', 287), ('TOTAL_MISMATCH', 150), ('OVER_CEILING', 98), ('ZERO_TOTAL', 62), ('PAYER_UNKNOWN', 60), ('ENTRY_INVALID:OVERHEAD_ON_PROPERTY', 39), ('NEEDS_HUMAN_274D', 29), ('ENTRY_INVALID:BAD_AMOUNT', 7), ('DUPLICATE: txn_id already posted (cache)', 6), ('TEST_SEED', 5), ('DUPLICATE_OF:receipt-20260911-217d4edfceda', 1), ('DUPLICATE_OF:receipt-20260901-68e846e657b5', 1), ('NOT_FOUND: no Journal rows for txn_id receipt-20260429-e652a5e77426', 1), ('DUPLICATE_OF:receipt-20260728-023dbd14fec0', 1), ('NOT_FOUND: no Journal rows for txn_id receipt-20260909-644b6422f4d4', 1)]

## A · documents with an old-sheet id: 180  (net equal: 171; net differs: 9; property differs from old tab: 0)
## B · documents matched by vendor/date/amount: 788  {'twin': 53, 'junk (dismissed)': 148, 'property row now documented': 343, 'in mail, not in old books': 201, 'manual row now documented': 43}
## C · old rows nothing covers: 247  (with a weak candidate document: 230)  by (tab, had a message id): {('RECAST BIZ', False): 23, ('881 Newport', False): 8, ('469 Brushwood', False): 5, ('366 Mesa', False): 17, ('136 Bowling Green', False): 9, ('104 Ashburne', False): 149, ('1616 Granite RECONCILED', False): 28, ('280 Sparkling RECONCILED', False): 7, ('Cost Recapture', False): 1}
## D · vendor-days where net differs: 487  (sum of diffs $43,637.82)
## F · receipts above the old rows they explain (D-028 returns): 86  {'hold': 67, 'return inferred': 19}  inferred $432.19

Largest net differences:
- 2026-03-30 ellis county tax off old       0.00 new  16,031.25 diff  16,031.25  rows 0 docs 1
- 2026-04-10 luxury 4 less applia old  10,319.56 new       0.00 diff -10,319.56  rows 1 docs 0
- 2026-02-19 shalom granite old       0.00 new   8,508.00 diff   8,508.00  rows 0 docs 1
- 2026-03-06 shalom granite old   4,950.00 new       0.00 diff  -4,950.00  rows 1 docs 0
- 2026-03-24 armando vega   old       0.00 new   3,889.00 diff   3,889.00  rows 0 docs 1
- 2026-02-13 salvador campos old   3,880.00 new       0.00 diff  -3,880.00  rows 1 docs 0
- 2026-02-20 shalom granite old   3,558.00 new       0.00 diff  -3,558.00  rows 1 docs 0
- 2026-07-08 handwritten expense  old       0.00 new   2,691.44 diff   2,691.44  rows 0 docs 1
- 2026-03-06 juanito unidentified old       0.00 new   2,500.00 diff   2,500.00  rows 0 docs 1
- 2026-04-10 green s greenery llc old       0.00 new   2,312.30 diff   2,312.30  rows 0 docs 2
- 2026-06-25 garcia home repair old       0.00 new   2,200.00 diff   2,200.00  rows 0 docs 2
- 2026-03-29 atlas pools    old   2,177.00 new       0.00 diff  -2,177.00  rows 1 docs 0
- 2026-03-28 robinson air amp ele old       0.00 new   2,131.48 diff   2,131.48  rows 0 docs 2
- 2026-03-23 atlas pools    old       0.00 new   2,120.00 diff   2,120.00  rows 0 docs 1
- 2026-03-31 atlas pools    old   2,120.00 new       0.00 diff  -2,120.00  rows 1 docs 0
- 2026-02-12 atlas pools    old   2,000.00 new       0.00 diff  -2,000.00  rows 1 docs 0
- 2026-03-01 atlas pools    old   2,000.00 new       0.00 diff  -2,000.00  rows 1 docs 0
- 2026-03-01 micky atlas pools old       0.00 new   2,000.00 diff   2,000.00  rows 0 docs 1
- 2026-08-14 waxahachie     old       0.00 new   1,499.89 diff   1,499.89  rows 0 docs 3
- 2026-02-19 lowes          old   1,478.59 new   2,957.18 diff   1,478.59  rows 4 docs 2
- 2026-02-03 lowes          old      91.99 new   1,537.98 diff   1,445.99  rows 1 docs 2
- 2026-02-22 architecturaldepot c old       0.00 new   1,390.66 diff   1,390.66  rows 0 docs 2
- 2026-06-01 50floor        old   1,319.00 new       0.00 diff  -1,319.00  rows 1 docs 0
- 2026-07-02 cool hand electric a old       0.00 new   1,207.00 diff   1,207.00  rows 0 docs 1
- 2026-09-01 waxahachie     old   1,196.40 new       0.00 diff  -1,196.40  rows 4 docs 0
