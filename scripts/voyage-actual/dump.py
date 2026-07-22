#!/usr/bin/env python3
"""Recalc a workbook and dump non-empty cells, so we can locate the §10 anchors."""
import sys, os, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recalc_check import recalc
import openpyxl

src = sys.argv[1]
wd = tempfile.mkdtemp(prefix='vr-dump-')
try:
    out = recalc(src, wd)
    wb = openpyxl.load_workbook(out, data_only=True)
    ws = wb['Voyage Actual']
    for row in ws.iter_rows():
        cells = [(c.coordinate, c.value) for c in row if c.value is not None]
        if cells:
            print(' | '.join('%s=%s' % (k, v) for k, v in cells))
finally:
    shutil.rmtree(wd, ignore_errors=True)
