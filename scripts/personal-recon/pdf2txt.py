import sys, os
from pypdf import PdfReader
outdir = sys.argv[1]
for p in sys.argv[2:]:
    r = PdfReader(p)
    txt = "\n".join((pg.extract_text() or "") for pg in r.pages)
    name = os.path.splitext(os.path.basename(p))[0] + ".txt"
    with open(os.path.join(outdir, name), "w") as f:
        f.write(txt)
    print(name, len(r.pages), "pages", len(txt), "chars")
