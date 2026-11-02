# Personal-statement reconciliation (beside the books, D-100)

One-off scripts from 2026-11-01. They read Paul's personal bank/card exports from `~/Desktop/Personal 2026/`
(never in this repo, never imported into the workbook) and compare them with the Journal snapshot.
Run from a scratch folder with the Journal snapshot beside them:

    npx netlify-cli blobs:get books-cache tab/Journal -O journal.json      # from the repo root (site linked)
    python3 -E pdf2txt.py <outdir> ~/Desktop/Personal\ 2026/eStmt_*.pdf    # pypdf is a --user install: -E, not -I
    python3 -I parse_stmts.py statements.csv <Chase*.csv> <Year to date.CSV>
    python3 -I parse_bofa.py bofa.csv <outdir>/eStmt_*.txt
    python3 -I journal_paul.py journal.json          # paul_lines.csv, lines_2030.csv
    python3 -I match4.py                              # matched / unmatched / near / combos / recurring
    python3 -I review.py                              # writes "Review - not in the books.csv" into the folder
    python3 -I amazon_match.py <penny-work> journal.json  # Amazon orders x books x bank (orders3.txt, books_unmatched.txt, bank_unmatched.txt)

Formats seen: Chase checking CSV (Details,Posting Date,Description,Amount,Type,Balance,...; the card's last4 only on
POS lines), Chase card CSV (Transaction Date,Post Date,Description,Category,Type,Amount), Citi "Year to date" CSV
(Status,Date,Description,Debit,Credit with "$ 1,234.56"), BofA eStmt PDFs (one per statement month; lines
"MM/DD MM/DD DESC REF ACCT AMOUNT" under Payments / Purchases / Interest headings).

The 2026-11-01 lessons (answers, the post list and what was posted live beside his data in `penny-work/`): a tie by
amount alone is not a tie - 60 of match4's pairs had another payee (`penny-work/matcher_fixes.txt`); "UBER TECHNOLOGIES"
lines were Uber Eats orders, not rides; the store's item list can miss an item the old books named differently. The
corrections were posted by one-off `recordPersonalReview20261101` (commit f2f550f; D-102 for the sold houses).


## Round 2 (2026-11-02) - the other cards and Chase checking Jan-Mar

    python3 -E pdf2txt.py <round2/txt> ~/Desktop/Personal\ 2026/{Discover,Capital\ One,Wells\ Fargo,barklay}/*.pdf ~/Desktop/Personal\ 2026/2026*-statements-8870-.pdf
    python3 -I parse_round2.py statements2.csv <round2/txt>   # Discover / Capital One / Wells Fargo / Barclays card PDFs + Chase checking statement PDFs
    python3 -I journal_paul.py journal.json                     # fresh paul_lines.csv / lines_2030.csv (run in round2/)
    python3 -I match_round2.py                                  # every line of both passes vs the fresh books; reports only the new lines
    python3 -I store_pass_round2.py                             # Home Depot / Lowe's / Amazon, bank line <-> store history <-> books, Jan-Mar

Formats: Discover "MM/DD DESC CATEGORY $AMT" (wraps; "-$" or "- $" credits), Capital One "Mon DD Mon DD DESC $AMT" under
"#5655: Transactions", Wells Fargo "5685 MM/DD MM/DD REF DESC AMT" (charges) / no card prefix (payments), Barclays "Mon DD
Mon DD DESC POINTS $AMT" (wraps), Chase checking statement "MM/DD DESC [MM/DD] ... - AMT BALANCE" where pypdf floats the
deposit amounts away - the parser takes every amount from the running balance and checks the printed ending balance.
Lessons: group the books by document before matching a store (a receipt is many rows); a bank return with no books refund
is not a missing refund when the old row was typed net of it; the first pass's own adds can be returned days later - rerun
`hd_returns.py` against the fresh journal after posting adds. Results and Paul's list: `penny-work/round2/`.
