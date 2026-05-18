# -*- coding: utf-8 -*-
import re

path = r"c:\Users\apa\OneDrive\Desktop\ArctiumLabs\tank-cleaning.html"
with open(path, encoding="utf-8", errors="replace") as f:
    s = f.read()

HELPERS = r"""
  function extractUnCodes(text) {
    const unRe = /\bUN\s*(?:N\/A|\d{4})\b/gi;
    const codes = [];
    let m;
    while ((m = unRe.exec(text)) !== null) {
      const code = m[0].replace(/\s+/g, ' ').trim();
      if (!codes.some((c) => c.toUpperCase() === code.toUpperCase())) codes.push(code);
    }
    return codes;
  }

  function formatDropdownLabel(label) {
    const text = normText(label);
    const codes = extractUnCodes(text);
    if (!codes.length) return text;
    const unRe = /\bUN\s*(?:N\/A|\d{4})\b/gi;
    let product = text.replace(unRe, '');
    product = product
      .replace(/\s*&\s*/g, ' ')
      .replace(/\s*\.\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,.]+|[\s,.]+$/g, '')
      .replace(/\.\s*$/, '')
      .trim();
    return product + ' - ' + codes.join(', ');
  }

  function shortCargoName(label) {
    let t = normText(label);
    t = t.replace(/\bUN\s*(?:N\/A|\d{4})\b/gi, '');
    t = t.replace(/\s*&\s*/g, ' ');
    t = t.replace(/\s*\.\s*/g, '. ');
    t = t.replace(/[\u2020\u2021\u00a7\u03b8\u03b1\u03b2\u03b4\u03b5\u25ca\u0263*]+\s*/g, ' ');
    t = t.replace(/\s{2,}/g, ' ').replace(/^[\s,.]+|[\s,.]+$/g, '').trim();
    return t || normText(label);
  }

  function matrixHeaderLabel(label) {
    return formatDropdownLabel(label);
  }

"""

i0 = s.find("  function formatDropdownLabel")
if i0 < 0:
    i0 = s.find("  function extractUnCodes")
i1 = s.find("  function matrixCellText")
if i0 >= 0 and i1 > i0:
    s = s[:i0] + HELPERS + s[i1:]

s = re.sub(
    r"  function matrixRowHeadHtml\(label\) \{[\s\S]*?\n  \}\n\n  function fillSelect",
    """  function matrixRowHeadHtml(label) {
    return '<span class="mx-cell-inner">' + escapeHtml(matrixHeaderLabel(label)) + '</span>';
  }

  function fillSelect""",
    s,
    1,
)

s = re.sub(
    r"html \+= '<th class=\"col-head\"[^;]+;",
    "html += '<th class=\"col-head\" title=\"' + escapeHtml(p.label) + '\">' + escapeHtml(matrixHeaderLabel(p.label)) + '</th>';",
    s,
    1,
)

s = re.sub(
    r"const FOOTNOTE_SYMBOLS = \[.*?\];",
    "const FOOTNOTE_SYMBOLS = ['\u2020\u2020', '\u2021\u2021', '**', '\u2020', '\u2021', '\u00a7', '\u03b8', '\u03b1', '\u03b2', '\u03b4', '\u03b5', '\u25ca', '\u0263', '*'];",
    s,
    1,
)

s = s.replace(
    "shortCargoName(a.label).localeCompare(shortCargoName(b.label)",
    "matrixHeaderLabel(a.label).localeCompare(matrixHeaderLabel(b.label)",
)

# ASCII-safe UI strings only
fixes = [
    ("<title>Tank Cleaning ? Arctium Lab</title>", "<title>Tank Cleaning - Arctium Lab</title>"),
    ("Shell Ship Pre-Cargo Matrix ? Issue 11.0 ? April 2024 ? White oils",
     "Shell Ship Pre-Cargo Matrix - Issue 11.0 - April 2024 - White oils"),
    ("Drag to pan ? Double-click", "Drag to pan - Double-click"),
    ("for details ? Shift", "for details - Shift"),
    ("Compatibility matrix ? drag", "Compatibility matrix - drag"),
    ("Search all columns?", "Search all columns..."),
    ('verdictTag">?', 'verdictTag">-'),
    ('verdictTitle">?', 'verdictTitle">-'),
    ("return '?'", "return '-'"),
    ('mx-cell-inner">?', 'mx-cell-inner">-'),
    ("requirements ? previous", "requirements - previous"),
    ("COMPATIBLE</strong> ? do", "COMPATIBLE</strong> - do"),
    ("parsed.codes.join(' ? ')", "parsed.codes.join(', ')"),
    ("loadLabel)) + ' ? '", "loadLabel)) + ' <- '"),
    ("To load ? / Previous ?", "To load (rows) / Previous (cols)"),
    ("join(' ') || '?'", "join(' ') || '-'"),
    ("Flash Point (?C)", "Flash Point (deg C)"),
    ("(kg/m?)", "(kg/m3)"),
    ("'? Select previous cargo ?'", "'-- Select previous cargo --'"),
    ("'? Select cargo to load ?'", "'-- Select cargo to load --'"),
    ("p.un_no || '?'", "p.un_no || '-'"),
    ("p.matrix_title || '?'", "p.matrix_title || '-'"),
    ("p.generic_product || '?'", "p.generic_product || '-'"),
    ("p.grade_names || '?'", "p.grade_names || '-'"),
    ("p.characteristics || '?'", "p.characteristics || '-'"),
    ("flash_point_degC ?? '?'", "flash_point_degC ?? '-'"),
    ("density_kg_m3 ?? '?'", "density_kg_m3 ?? '-'"),
    ("sulphur_ppm ?? '?'", "sulphur_ppm ?? '-'"),
    ("Close\"></button>", "Close\">&times;</button>"),
    ("Close\">&times;</button>", "Close\">&times;</button>"),
]
for a, b in fixes:
    s = s.replace(a, b)

s = s.replace("\ufffd", "")
s = s.replace("&middot;", "-")  # normalize any prior entity attempts

# Remove duplicate extractUnCodes if present
dup = s.find("  function extractUnCodes")
dup2 = s.find("  function extractUnCodes", dup + 5)
if dup >= 0 and dup2 > dup:
    end = s.find("  function formatDropdownLabel", dup2)
    if end > dup2:
        s = s[:dup2] + s[end:]

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(s)

with open(path, encoding="utf-8") as f:
    c = f.read()
print("ok", "matrixHeaderLabel" in c, "formatDropdownLabel" in c)
print("questions as UI sep:", "join(' ? ')" in c or "return product + ' ? '" in c)
print("footnote", "\u2020\u2020" in c)
