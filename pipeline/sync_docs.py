#!/usr/bin/env python3
"""Copies the documents into frontend/public/docs so the landing page can show them. Run after editing any document."""
import os, shutil
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "frontend", "public", "docs"); os.makedirs(OUT, exist_ok=True)
for f in ["USER_GUIDE.md", "PRINCIPLES.md", "DATA_FILES.md", "HOW_WE_BUILT_IT.md", "MISSION_CONCEPT.md", "SUBMISSION.md"]:
    shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
shutil.copy(os.path.join(ROOT, "research", "DATA_REPORT.md"), os.path.join(OUT, "DATA_REPORT.md"))
print("synced documents to", OUT)
