"""Export the maintained Markdown installation guide to a printable PDF.

Requires reportlab. The Markdown file remains the canonical, editable source.
"""
from pathlib import Path
import re
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, XPreformatted

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "installation_guide.md"
OUTPUT = ROOT / "installation_guide.pdf"
REPOSITORY = "https://github.com/Saima-Devops/Book-Review-App/blob/main/"


def inline(text):
    text = escape(text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda match: '<a color="#087f80" href="' +
                  (match[2] if match[2].startswith("https://") else REPOSITORY + match[2]) +
                  '">' + match[1] + "</a>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', text)


def export():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("GuideTitle", fontName="Helvetica-Bold", fontSize=25,
                              leading=30, textColor=colors.HexColor("#233a46"), spaceAfter=18))
    styles.add(ParagraphStyle("GuideHeading", fontName="Helvetica-Bold", fontSize=13,
                              leading=17, textColor=colors.HexColor("#087f80"),
                              spaceBefore=17, spaceAfter=9, keepWithNext=True))
    styles.add(ParagraphStyle("GuideBody", fontName="Helvetica", fontSize=9.5,
                              leading=14, textColor=colors.HexColor("#233a46"), spaceAfter=8))
    styles.add(ParagraphStyle("GuideCell", parent=styles["GuideBody"], fontSize=8,
                              leading=11, spaceAfter=0, alignment=TA_LEFT))
    styles.add(ParagraphStyle("GuideCode", fontName="Courier", fontSize=7.4,
                              leading=10.5, borderPadding=10, backColor=colors.HexColor("#edf1ee"),
                              spaceBefore=5, spaceAfter=12))
    story = []
    lines = SOURCE.read_text().splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.strip():
            index += 1
            continue
        if line.startswith("```"):
            index += 1
            code = []
            while index < len(lines) and not lines[index].startswith("```"):
                code.append(lines[index])
                index += 1
            story.append(XPreformatted(escape("\n".join(code)), styles["GuideCode"]))
            index += 1
        elif line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["GuideTitle"]))
            index += 1
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["GuideHeading"]))
            index += 1
        elif line.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].startswith("|"):
                values = [cell.strip() for cell in lines[index].strip("|").split("|")]
                if not all(re.fullmatch(r"[-: ]+", cell) for cell in values):
                    rows.append([Paragraph(inline(cell), styles["GuideCell"]) for cell in values])
                index += 1
            table = Table(rows, colWidths=[(A4[0] - 108) / len(rows[0])] * len(rows[0]), repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf1ee")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), .4, colors.HexColor("#dce2dd")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.extend([table, Spacer(1, 10)])
        else:
            paragraph = []
            while index < len(lines) and lines[index].strip() and not lines[index].startswith(("#", "```", "|")):
                paragraph.append(lines[index])
                index += 1
            numbered = all(re.match(r"\d+\. ", item) for item in paragraph)
            if numbered:
                story.extend(Paragraph(inline(item), styles["GuideBody"]) for item in paragraph)
            else:
                story.append(Paragraph(inline(" ".join(paragraph)), styles["GuideBody"]))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#dce2dd"))
        canvas.line(54, 44, A4[0] - 54, 44)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#70818b"))
        canvas.drawString(54, 30, "Book Shelf | Saima Usman | Installation and Release Guide")
        canvas.drawRightString(A4[0] - 54, 30, str(document.page))
        canvas.restoreState()

    document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=54, leftMargin=54,
                                 topMargin=50, bottomMargin=64, title="Book Shelf Installation and Release Guide",
                                 author="Saima Usman")
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(f"Exported {OUTPUT.name}")


if __name__ == "__main__":
    export()
