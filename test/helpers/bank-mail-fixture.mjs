// test/helpers/bank-mail-fixture.mjs — Citizens' "Daily Summary" email as Gmail's plain body gives it.
// 09-28 is the email Paul showed on 2026-09-29 (the picture), laid out the way the 09-01 email's
// first 180 characters in data/migration/2026-09-17/gmail-listing-paul-2026-09-17.json read:
// "<description> (i) <card> <link>", then the amount. The links are shortened.
// CHECKED 2026-09-29 against the 35 real emails the poller stored (2026-08-06 .. 09-28): every one
// read, every one's lines add up to its own total, and the layout is this one - description, the
// circled i and the card on the next line, the link, the amount. A pending line's description
// starts AUTH or CHRG. The real links carry ids, so they are not kept here.
const LINK = "<https://portal.cnboftexas.com/x>";

export const SUMMARY_0928 = ` [image: Citizens National Bank of Texas]
Daily Summary
Account: 2505 Date: 09/28/26
MPOWERED SMALL BUS
Debits: (-)
THE HOME DEPOT #6505 W
ⓘ 9301 - DENNIS C LITTLE ${LINK}
$162.91
1316 N HIGHWAY 77 WAXA
ⓘ 9301 - DENNIS C LITTLE ${LINK}
$2.65
EPAY DEBIT 09/28 ZE
ⓘ Zelle Debit ${LINK}
$280.00
CONDOCERTS TX 800-3106
ⓘ 5450 - PAUL V BJORK ${LINK}
$375.00
THE HOME DEPOT #6505 W
ⓘ 9301 - DENNIS C LITTLE ${LINK}
$33.07
THE HOME DEPOT #6505 W
ⓘ 9301 - DENNIS C LITTLE ${LINK}
$141.09
Total Debits $994.72
09/29 Avail Balance 7:07 AM $169,805.35
`;

// 09-01, on one line as the listing's text runs. The amounts are that email's own (61.62, 2.00,
// 275.00, 1,196.40 = 1,535.02 posted; 47.26 pending, which the bank posted on 09-02). Only the
// first line's card is known from the listing; the others are filled in to have something to read.
export const SUMMARY_0901 = ` [image: Citizens National Bank of Texas] Daily Summary Account: 2505 Date: 09/01/26 MPOWERED SMALL BUS Debits: (-) 1315 HWY 77 NORTH WAXA ⓘ 5450 - PAUL V BJORK ${LINK} $61.62 MUNICIPAL ONLINE PAYMEN ⓘ 5450 - PAUL V BJORK ${LINK} $2.00 EPAY DEBIT 08/31 ZE ⓘ Zelle Debit ${LINK} $275.00 408 S ROGERS STREET WAXA ⓘ 5450 - PAUL V BJORK ${LINK} $1,196.40 Total Debits $1,535.02 Pending Transactions: TYL WAXAHACHIE SERVFEE ⓘ 5450 - PAUL V BJORK ${LINK} $47.26 09/02 Avail Balance 7:05 AM $10,774.29`;
