# Phase 4 tie-out by property — 2026-09-18

old = property tab total (corrections applied, Cash Advances excluded); posted = staging Journal receipt lane, cost side;
pending/error = documents not yet in the Journal, at the model's amounts and property; uncovered = old rows no document covers (report C).
residual = old − posted − pending − error − uncovered: what neither side explains (twins, dismissed-by-rule, amounts the model read differently).

| property | old rows | old $ | posted txns | posted $ | pending docs | pending $ | error docs | error $ | uncovered rows | uncovered $ | residual $ | top holds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 104 Ashburne | 510 | 180,093.21 | 113 | 17,934.82 | 134 | 96,014.85 | 6 | 1,165.77 | 102 | 95,784.39 | -30,806.62 | LOW_CONFIDENCE 61; OVER_CEILING 55; ENTRY_INVALID:OVERHEAD_ON_PROPERTY 35; NOT_POST_VERDICT 32 |
| 136 Bowling Green | 47 | 3,446.65 | 13 | 1,232.62 | 9 | 2,258.11 | 4 | 402.63 | 5 | 854.04 | -1,300.75 | LOW_CONFIDENCE 7; NOT_POST_VERDICT 3; OVER_CEILING 2; PAYER_UNKNOWN 1 |
| 1616 Granite | 60 | 11,905.87 | 15 | 1,779.24 | 20 | 7,456.99 | 0 | 0.00 | 11 | 1,867.21 | 802.43 | LOW_CONFIDENCE 12; NOT_POST_VERDICT 9; OVER_CEILING 6; NEEDS_HUMAN_274D 4 |
| 206 White Rock | 0 | 0.00 | 0 | 0.00 | 2 | 738,000.00 | 0 | 0.00 | 0 | 0.00 | -738,000.00 | NOT_POST_VERDICT 2; LOW_CONFIDENCE 2; OVER_CEILING 2 |
| 280 Sparkling | 63 | 7,896.60 | 11 | 793.62 | 12 | 399,001.14 | 1 | 43.26 | 5 | 1,165.28 | -393,106.70 | LOW_CONFIDENCE 7; NOT_POST_VERDICT 6; OVER_CEILING 6; PAYER_UNKNOWN 4 |
| 366 Mesa | 26 | 9,648.00 | 3 | 279.23 | 9 | 2,104.00 | 0 | 0.00 | 11 | 5,789.34 | 1,475.43 | LOW_CONFIDENCE 6; PAYER_UNKNOWN 4; NOT_POST_VERDICT 3; OVER_CEILING 2 |
| 413 Green Acres | 0 | 0.00 | 0 | 0.00 | 1 | 144.00 | 0 | 0.00 | 0 | 0.00 | -144.00 | LOW_CONFIDENCE 1 |
| 469 Brushwood | 33 | 1,916.80 | 7 | 715.75 | 10 | 2,100.96 | 0 | 0.00 | 4 | 439.83 | -1,339.74 | LOW_CONFIDENCE 9; NOT_POST_VERDICT 5; PAYER_UNKNOWN 1; ZERO_TOTAL 1 |
| 881 Newport | 30 | 3,089.17 | 6 | 549.82 | 8 | 2,023.52 | 0 | 0.00 | 2 | 116.47 | 399.36 | LOW_CONFIDENCE 6; NOT_POST_VERDICT 4; PAYER_UNKNOWN 4; OVER_CEILING 2 |
| OVERHEAD | 284 | 21,908.91 | 97 | 9,236.63 | 126 | 13,456.93 | 3 | 239.27 | 20 | 2,929.94 | -3,953.86 | LOW_CONFIDENCE 75; NOT_POST_VERDICT 50; PAYER_UNKNOWN 39; NEEDS_HUMAN_274D 16 |
| (no entry) | 0 | 0.00 | 0 | 0.00 | 67 | 14,665.82 | 0 | 0.00 | 0 | 0.00 | -14,665.82 | NOT_POST_VERDICT 67; LOW_CONFIDENCE 60; TOTAL_MISMATCH 52; ZERO_TOTAL 17 |
| (unread) | 0 | 0.00 | 0 | 0.00 | 0 | 0.00 | 1 | 402.67 | 0 | 0.00 | -402.67 |  |
| **total** | 1053 | 239,905.21 | | 32,521.73 | 398 | 1,277,226.32 | 15 | 2,253.60 | 160 | 108,946.50 | -1,181,042.94 | |

Corrections applied to the old side:
- 104 Ashburne: C-1 2026-09-17 Paul: $45,000.00 was a typo, actual $450.00
