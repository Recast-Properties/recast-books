# Phase 4 tie-out by property — 2026-09-17

old = property tab total (corrections applied, Cash Advances excluded); posted = staging Journal receipt lane, cost side;
pending/error = documents not yet in the Journal, at the model's amounts and property; uncovered = old rows no document covers (report C).
residual = old − posted − pending − error − uncovered: what neither side explains (twins, dismissed-by-rule, amounts the model read differently).

| property | old rows | old $ | posted txns | posted $ | pending docs | pending $ | error docs | error $ | uncovered rows | uncovered $ | residual $ | top holds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 104 Ashburne | 510 | 180,093.21 | 68 | 11,709.51 | 134 | 96,014.85 | 1 | 374.58 | 178 | 102,242.00 | -30,247.73 | LOW_CONFIDENCE 61; OVER_CEILING 55; ENTRY_INVALID:OVERHEAD_ON_PROPERTY 35; NOT_POST_VERDICT 32 |
| 136 Bowling Green | 47 | 3,446.65 | 8 | 844.37 | 9 | 2,258.11 | 3 | 226.04 | 19 | 1,268.01 | -1,149.88 | LOW_CONFIDENCE 7; NOT_POST_VERDICT 3; OVER_CEILING 2; PAYER_UNKNOWN 1 |
| 1616 Granite | 60 | 11,905.87 | 12 | 1,594.17 | 20 | 7,456.99 | 0 | 0.00 | 17 | 2,108.01 | 746.70 | LOW_CONFIDENCE 12; NOT_POST_VERDICT 9; OVER_CEILING 6; NEEDS_HUMAN_274D 4 |
| 206 White Rock | 0 | 0.00 | 0 | 0.00 | 2 | 738,000.00 | 0 | 0.00 | 0 | 0.00 | -738,000.00 | NOT_POST_VERDICT 2; LOW_CONFIDENCE 2; OVER_CEILING 2 |
| 280 Sparkling | 63 | 7,896.60 | 9 | 751.00 | 12 | 399,001.14 | 1 | 43.26 | 16 | 1,276.83 | -393,175.63 | LOW_CONFIDENCE 7; NOT_POST_VERDICT 6; OVER_CEILING 6; PAYER_UNKNOWN 4 |
| 366 Mesa | 26 | 9,648.00 | 0 | 0.00 | 9 | 2,104.00 | 0 | 0.00 | 18 | 6,277.41 | 1,266.59 | LOW_CONFIDENCE 6; PAYER_UNKNOWN 4; NOT_POST_VERDICT 3; OVER_CEILING 2 |
| 413 Green Acres | 0 | 0.00 | 0 | 0.00 | 1 | 144.00 | 0 | 0.00 | 0 | 0.00 | -144.00 | LOW_CONFIDENCE 1 |
| 469 Brushwood | 33 | 1,916.80 | 1 | 55.87 | 10 | 2,100.96 | 0 | 0.00 | 12 | 1,077.82 | -1,317.85 | LOW_CONFIDENCE 9; NOT_POST_VERDICT 5; PAYER_UNKNOWN 1; ZERO_TOTAL 1 |
| 881 Newport | 30 | 3,089.17 | 4 | 340.80 | 8 | 2,023.52 | 0 | 0.00 | 10 | 341.64 | 383.21 | LOW_CONFIDENCE 6; NOT_POST_VERDICT 4; PAYER_UNKNOWN 4; OVER_CEILING 2 |
| OVERHEAD | 284 | 21,908.91 | 85 | 8,570.17 | 126 | 13,456.93 | 2 | 139.27 | 32 | 3,637.44 | -3,894.90 | LOW_CONFIDENCE 75; NOT_POST_VERDICT 50; PAYER_UNKNOWN 39; NEEDS_HUMAN_274D 16 |
| (no entry) | 0 | 0.00 | 0 | 0.00 | 65 | 14,444.17 | 0 | 0.00 | 0 | 0.00 | -14,444.17 | NOT_POST_VERDICT 65; LOW_CONFIDENCE 59; TOTAL_MISMATCH 50; ZERO_TOTAL 17 |
| **total** | 1053 | 239,905.21 | | 23,865.89 | 396 | 1,277,004.67 | 7 | 783.15 | 302 | 118,229.16 | -1,179,977.66 | |

Corrections applied to the old side:
- 104 Ashburne: C-1 2026-09-17 Paul: $45,000.00 was a typo, actual $450.00
