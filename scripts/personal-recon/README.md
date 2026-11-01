# Personal-statement reconciliation (beside the books, D-093)

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

Formats seen: Chase checking CSV (Details,Posting Date,Description,Amount,Type,Balance,...; the card's last4 only on
POS lines), Chase card CSV (Transaction Date,Post Date,Description,Category,Type,Amount), Citi "Year to date" CSV
(Status,Date,Description,Debit,Credit with "$ 1,234.56"), BofA eStmt PDFs (one per statement month; lines
"MM/DD MM/DD DESC REF ACCT AMOUNT" under Payments / Purchases / Interest headings).
