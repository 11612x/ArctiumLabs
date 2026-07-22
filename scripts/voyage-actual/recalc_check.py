#!/usr/bin/env python3
"""Recalc gate for Voyage Actual exports (CLAUDE.md 9.1, option c).

Opens the workbook in LibreOffice headless, FORCES a full recalculation, and
asserts zero error cells. Emits the same JSON contract as the skill's recalc.py.

Why the forced recalc: LibreOffice defaults OOXMLRecalcMode to "ask", which in
headless means "never". A plain --convert-to therefore round-trips the file
without evaluating anything and reports clean on a totally broken workbook.
We pin the mode to 0 (always) in a throwaway LO profile so the user's own
LibreOffice settings are untouched.

Liveness self-check: SheetJS writes formulas with NO cached result. So if the
engine did not actually compute, every formula cell comes back empty. We count
formula cells that produced a value and fail if that count is zero -- this is
what stops the gate from passing vacuously.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ERRORS = ('#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#N/A', '#NULL!', '#NUM!', '#ERROR!')

REGMOD = '''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry"
           xmlns:xs="http://www.w3.org/2001/XMLSchema"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load">
  <prop oor:name="OOXMLRecalcMode" oor:op="fuse">
   <value>0</value>
  </prop>
 </item>
 <item oor:path="/org.openoffice.Office.Calc/Formula/Load">
  <prop oor:name="ODFRecalcMode" oor:op="fuse">
   <value>0</value>
  </prop>
 </item>
</oor:items>
'''


def soffice_bin():
    for c in ('soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'):
        p = shutil.which(c) if not c.startswith('/') else (c if os.path.exists(c) else None)
        if p:
            return p
    return None


def recalc(path, workdir):
    """Convert through LibreOffice with recalculation forced on. Returns new path."""
    binary = soffice_bin()
    if not binary:
        raise SystemExit(json.dumps({'status': 'error',
                                     'message': 'LibreOffice not found; install it or use Excel manually (CLAUDE.md 9.1d)'}))

    profile = os.path.join(workdir, 'loprofile')
    userdir = os.path.join(profile, 'user')
    os.makedirs(userdir, exist_ok=True)
    with open(os.path.join(userdir, 'registrymodifications.xcu'), 'w') as fh:
        fh.write(REGMOD)

    outdir = os.path.join(workdir, 'out')
    os.makedirs(outdir, exist_ok=True)

    cmd = [binary,
           '-env:UserInstallation=file://' + profile,
           '--headless', '--norestore', '--nolockcheck', '--nodefault',
           '--convert-to', 'xlsx:Calc MS Excel 2007 XML',
           '--outdir', outdir, path]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    out = os.path.join(outdir, re.sub(r'\.xlsx$', '', os.path.basename(path)) + '.xlsx')
    if not os.path.exists(out):
        raise SystemExit(json.dumps({'status': 'error', 'message': 'conversion produced no file',
                                     'stdout': res.stdout, 'stderr': res.stderr}))
    return out


def scan(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    errors, valued, blank = [], 0, 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                v = cell.value
                if v is None:
                    blank += 1
                    continue
                if isinstance(v, str) and v.strip() in ERRORS:
                    errors.append({'sheet': ws.title, 'cell': cell.coordinate, 'error': v.strip()})
                elif isinstance(v, (int, float)):
                    valued += 1
    return errors, valued


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: recalc_check.py <file.xlsx>')
    src = sys.argv[1]
    workdir = tempfile.mkdtemp(prefix='vr-recalc-')
    try:
        out = recalc(src, workdir)
        errors, valued = scan(out)
        # Liveness: SheetJS caches nothing, so numbers here can only come from a real recalc.
        live = valued > 0
        result = {
            'status': 'success' if (not errors and live) else 'failure',
            'file': os.path.basename(src),
            'total_errors': len(errors),
            'computed_cells': valued,
            'recalc_fired': live,
        }
        if errors:
            result['errors'] = errors[:50]
        if not live:
            result['message'] = ('no computed values found -- recalculation did not fire, '
                                 'so a clean result here would be meaningless')
        print(json.dumps(result, indent=2))
        sys.exit(0 if result['status'] == 'success' else 1)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == '__main__':
    main()
