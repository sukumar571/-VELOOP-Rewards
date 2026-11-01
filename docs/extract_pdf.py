"""One-off QA helper: extract text from the VELOOP spec PDFs."""
from pypdf import PdfReader

PAIRS = [
    (r"C:\Users\sudhe\Downloads\New_Giveaway_page_task_full_stack (4).pdf",
     r"e:\Users\sudhe\Veloop Project\docs\SPEC_extracted.txt"),
    (r"C:\Users\sudhe\Downloads\Veloop_Rewards_GPT_Industry_Research_Report_10_Pages.pdf",
     r"e:\Users\sudhe\Veloop Project\docs\RESEARCH_extracted.txt"),
]

for src, dst in PAIRS:
    reader = PdfReader(src)
    parts = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        # sanitize lone surrogates that break utf-8 encoding
        text = text.encode("utf-8", "replace").decode("utf-8", "replace")
        parts.append(f"\n===== PAGE {i + 1} =====\n{text}\n")
    with open(dst, "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print(dst, len(reader.pages), "pages")
