"""PDF report generator (reportlab)."""
from __future__ import annotations

import base64
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .schemas import SessionState


def build_pdf(state: SessionState) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, title=f"VoiceShield Report {state.session_id}")
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>VoiceShield Forensic Report</b>", styles["Title"]))
    story.append(Paragraph(f"Session: <font face='Courier'>{state.session_id}</font>",
                           styles["Normal"]))
    story.append(Paragraph(f"Generated: {datetime.utcnow().isoformat()}Z", styles["Normal"]))
    story.append(Spacer(1, 0.15 * inch))

    risk_color = {
        "low": colors.HexColor("#16a34a"),
        "medium": colors.HexColor("#f59e0b"),
        "high": colors.HexColor("#dc2626"),
    }.get(state.risk, colors.gray)

    summary = [
        ["Final Risk", state.risk.upper()],
        ["EMA P(synthetic)", f"{state.ema_score:.3f}"],
        ["Windows Analyzed", str(len(state.windows))],
        ["First Flagged At", state.flagged_at.isoformat() if state.flagged_at else "—"],
        ["Started", state.started_at.isoformat()],
    ]
    t = Table(summary, colWidths=[2.0 * inch, 4.0 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("TEXTCOLOR", (1, 0), (1, 0), risk_color),
        ("FONTNAME", (1, 0), (1, 0), "Helvetica-Bold"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("<b>Window Analysis</b>", styles["Heading2"]))
    rows = [["#", "t (s)", "Forensic", "Neural A", "Neural B", "Fused", "Stab.", "Top Reason"]]
    for w in state.windows[:60]:
        rows.append([
            str(w.window_index),
            f"{w.t_start:.1f}",
            f"{w.scores.forensic:.2f}",
            f"{w.scores.neural_a:.2f}",
            f"{w.scores.neural_b:.2f}",
            f"{w.scores.fused:.2f}",
            f"{w.stability:.2f}",
            (w.reasons[0] if w.reasons else "")[:42],
        ])
    tbl = Table(rows, repeatRows=1, colWidths=[
        0.4 * inch, 0.5 * inch, 0.7 * inch, 0.7 * inch,
        0.7 * inch, 0.6 * inch, 0.6 * inch, 2.5 * inch,
    ])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.2 * inch))

    # Embed first spectrogram + gradcam if available
    for w in state.windows[:1]:
        if w.spectrogram_b64:
            story.append(Paragraph("<b>Window 0 — Mel Spectrogram</b>", styles["Heading3"]))
            img = Image(io.BytesIO(base64.b64decode(w.spectrogram_b64)),
                        width=4.5 * inch, height=2.0 * inch)
            story.append(img)
        if w.gradcam_b64:
            story.append(Paragraph("<b>Window 0 — Forensic Saliency</b>", styles["Heading3"]))
            img = Image(io.BytesIO(base64.b64decode(w.gradcam_b64)),
                        width=4.5 * inch, height=2.0 * inch)
            story.append(img)

    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(
        "<i>Disclaimer: VoiceShield provides probabilistic indicators of synthetic "
        "voice content. Outputs should be reviewed by trained personnel before "
        "any operational decision.</i>", styles["Italic"],
    ))

    doc.build(story)
    return buf.getvalue()
