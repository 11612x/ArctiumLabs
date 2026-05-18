/* Bunker Negotiator — shared with Bunkers_Negotiator.html */
let bunkIsAdmin = false;
let bunkIsOps = false;

function applyRoleUI() {
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = bunkIsAdmin ? '' : 'none';
  });
  document.querySelectorAll('[data-admin-or-ops]').forEach(el => {
    el.style.display = (bunkIsAdmin || bunkIsOps) ? '' : 'none';
  });
}

function bunkReceiveUiState(data) {
  if (!data || data.type !== 'arctium-ui') return;
  document.documentElement.setAttribute('data-ui-theme', data.theme === 'light' ? 'light' : 'dark');
  bunkIsAdmin = !!data.isAdmin;
  bunkIsOps = !!data.isOps;
  applyRoleUI();
}

function initBunkPortAutocomplete() {
  const inp = document.getElementById('bunk-port');
  if (!inp || inp.dataset.portAcBound === '1') return;
  bindPortAutocomplete(inp);
}

function wireBunkerPorts() {
  initBunkPortAutocomplete();
}

function parseNum(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function sanitizeNumInputValue(value) {
  return String(value).replace(/[^\d.,]/g, '');
}

function sanitizeNumInputEl(el) {
  if (!el) return;
  const sanitized = sanitizeNumInputValue(el.value);
  if (el.value === sanitized) return;
  const pos = el.selectionStart;
  el.value = sanitized;
  if (typeof pos === 'number') {
    const nextPos = Math.min(pos, sanitized.length);
    el.setSelectionRange(nextPos, nextPos);
  }
}

function fmtNumInput(value, decimals = 0) {
  const n = typeof value === 'number' ? value : parseNum(value);
  if (n === null) return '';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

function formatNumInputEl(el) {
  if (!el) return;
  const decimals = Number(el.dataset.decimals || 0);
  let n = parseNum(el.value);
  if (n === null) return;
  if (el.dataset.max != null && el.dataset.max !== '') {
    const mx = parseNum(el.dataset.max);
    if (mx !== null && n > mx) n = mx;
  }
  if (el.dataset.min != null && el.dataset.min !== '') {
    const mn = parseNum(el.dataset.min);
    if (mn !== null && n < mn) n = mn;
  }
  el.value = fmtNumInput(n, decimals);
}

function formatAllNumInputs(root = document) {
  root.querySelectorAll('input.num-fmt').forEach(formatNumInputEl);
}

const VESSEL_FIELD_DEFAULTS = {
  vesSpdLaden: 12.5,
  vesSpdBallast: 14,
  vesCommission: 2.5,
  vesVLSFO: 25,
  vesLSMGO: 5,
  vesPortDays: 1.5,
  vlsfoPrice: 500,
  lsmgoPrice: 650
};

function applyVesselFieldDefaults() {
  Object.entries(VESSEL_FIELD_DEFAULTS).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const decimals = Number(el.dataset.decimals || 0);
    el.value = fmtNumInput(value, decimals);
  });
}

function numInputHtml(value, decimals, oninput) {
  const display = value == null || value === '' ? '' : fmtNumInput(value, decimals);
  return `type="text" inputmode="decimal" class="num-fmt" data-decimals="${decimals}" value="${display}" oninput="${oninput}"`;
}
let portsCatalog = null;

function getArctiumPortsCatalog() {
  if (portsCatalog) return portsCatalog;
  try {
    const data = window.ARCTIUM_PORTS;
    if (!Array.isArray(data) || !data.length) throw new Error('ports.js not loaded');
    portsCatalog = dedupePortsCatalog(data.filter(p => !p.is_inactive));
  } catch {
    portsCatalog = [];
  }
  return portsCatalog;
}

function loadPortsCatalog() {
  return Promise.resolve(getArctiumPortsCatalog());
}

function isValidPortCatalogEntry(p) {
  if (!p) return false;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return true;
}

function portCatalogLabel(p) {
  return `${(p.name || p.port_name_full).toUpperCase()} — ${p.port_country || ''}`;
}

function portCatalogSearchKeys(p) {
  const keys = new Set();
  if (p.name) keys.add(p.name.toLowerCase().trim());
  if (p.port_name_full) keys.add(p.port_name_full.toLowerCase().trim());
  keys.add(portCatalogLabel(p).toLowerCase());
  return keys;
}

function dedupePortsCatalog(ports) {
  const byName = new Map();
  for (const p of ports) {
    if (!isValidPortCatalogEntry(p)) continue;
    const key = (p.name || p.port_name_full || '').toLowerCase().trim();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (Math.abs(p.lat) + Math.abs(p.lon) > Math.abs(existing.lat) + Math.abs(existing.lon))) {
      byName.set(key, p);
    }
  }
  return [...byName.values()].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
}

function escapePortRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function portCatalogMatchScore(p, ql) {
  const name = (p.name || '').toLowerCase();
  const full = (p.port_name_full || '').toLowerCase();
  const country = (p.port_country || '').toLowerCase();

  function scoreText(text, w) {
    if (!text || !text.includes(ql)) return 0;
    if (text === ql) return w.exact;
    if (text.startsWith(ql)) return w.prefix;
    const wordRe = new RegExp('(?:^|[\\s(/-])' + escapePortRegex(ql), 'i');
    if (wordRe.test(text)) return w.wordStart;
    return w.includes;
  }

  const nameW = { exact: 10000, prefix: 5000, wordStart: 3000, includes: 400 };
  const fullW = { exact: 2000, prefix: 1500, wordStart: 900, includes: 150 };
  const countryW = { exact: 200, prefix: 150, wordStart: 100, includes: 50 };

  let score = Math.max(
    scoreText(name, nameW),
    scoreText(full, fullW),
    scoreText(country, countryW)
  );
  if (score <= 0) return 0;

  const parenIdx = name.indexOf('(');
  if (parenIdx >= 0) {
    const before = name.slice(0, parenIdx);
    const inside = name.slice(parenIdx);
    if (!before.includes(ql) && inside.includes(ql) && scoreText(name, nameW) <= nameW.wordStart) {
      score -= 2500;
    }
  }
  if (scoreText(name, nameW) === 0 && scoreText(full, fullW) > 0 && scoreText(full, fullW) < fullW.wordStart) {
    score -= 500;
  }
  return Math.max(score, 1);
}

function filterPortsByQuery(q) {
  const ports = getArctiumPortsCatalog();
  if (!ports.length) return [];
  const ql = q.trim().toLowerCase();
  if (ql.length < 2) return [];
  const scored = [];
  for (const p of ports) {
    const s = portCatalogMatchScore(p, ql);
    if (s > 0) scored.push({ p, s });
  }
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    const an = (a.p.name || a.p.port_name_full || '').length;
    const bn = (b.p.name || b.p.port_name_full || '').length;
    if (an !== bn) return an - bn;
    return (a.p.name || '').localeCompare(b.p.name || '', undefined, { sensitivity: 'base' });
  });
  return scored.slice(0, 10).map(x => x.p);
}

function findExactPortInCatalog(inputVal) {
  const v = inputVal.trim().toLowerCase();
  if (!v) return null;
  const matches = getArctiumPortsCatalog().filter(p => portCatalogSearchKeys(p).has(v));
  return matches.length === 1 ? matches[0] : null;
}

function portCatalogMatchesSelection(p, inputVal) {
  if (!p || !isValidPortCatalogEntry(p)) return false;
  return portCatalogSearchKeys(p).has(inputVal.trim().toLowerCase());
}

function ensureRoutePortChrome(wrap, input) {
  let meta = wrap.querySelector(':scope > .port-meta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'port-meta';
    input.insertAdjacentElement('afterend', meta);
  }
  let list = wrap.querySelector(':scope > .route-port-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'route-port-list';
    wrap.appendChild(list);
  }
  return { meta, list };
}

function bindRoutePortAutocomplete(input) {
  if (!input || input.dataset.portAcBound === '1') return;
  const wrap = input.closest('.port-ac-wrap');
  if (!wrap) return;
  wrap.classList.add('route-port-wrap');
  const { meta, list } = ensureRoutePortChrome(wrap, input);
  input.dataset.portAcBound = '1';
  input.setAttribute('autocomplete', 'off');

  let activeIdx = -1;
  let lastMatches = [];
  let selectedPort = null;
  let suppressPortSearch = false;

  function closeList() {
    list.classList.remove('open');
    list.innerHTML = '';
    activeIdx = -1;
    lastMatches = [];
  }

  function clearSelection() {
    selectedPort = null;
    meta.textContent = '';
    input.classList.remove('port-valid');
  }

  function selectPort(p) {
    if (!isValidPortCatalogEntry(p)) return;
    selectedPort = p;
    input.value = portCatalogLabel(p);
    input.classList.add('port-valid');
    const draft = p.draft != null ? p.draft.toFixed(1) : '—';
    meta.textContent = `lat: ${Number(p.lat).toFixed(2)}  lon: ${Number(p.lon).toFixed(2)}  draft: ${draft} m`;
    closeList();
    suppressPortSearch = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    suppressPortSearch = false;
  }

  function render(matches) {
    lastMatches = matches;
    list.innerHTML = '';
    if (!matches.length) {
      list.innerHTML = '<div class="route-port-empty">No ports found</div>';
      list.classList.add('open');
      return;
    }
    matches.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'route-port-item';
      div.textContent = portCatalogLabel(p);
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectPort(p);
      });
      list.appendChild(div);
    });
    list.classList.add('open');
    activeIdx = -1;
  }

  function syncFromInput() {
    const exact = findExactPortInCatalog(input.value);
    if (exact) {
      selectPort(exact);
      return true;
    }
    if (selectedPort && portCatalogMatchesSelection(selectedPort, input.value)) return true;
    clearSelection();
    return false;
  }

  function updateActive() {
    const items = list.querySelectorAll('.route-port-item');
    items.forEach((el, i) => el.classList.toggle('active', i === activeIdx));
    if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', () => {
    if (suppressPortSearch) return;
    if (selectedPort && portCatalogMatchesSelection(selectedPort, input.value)) {
      input.classList.add('port-valid');
      closeList();
      return;
    }
    input.classList.remove('port-valid');
    if (selectedPort && !portCatalogMatchesSelection(selectedPort, input.value)) clearSelection();
    if (input.value.trim().length < 2) {
      closeList();
      return;
    }
    render(filterPortsByQuery(input.value));
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (list.classList.contains('open') && activeIdx >= 0 && lastMatches[activeIdx]) {
        selectPort(lastMatches[activeIdx]);
      } else if (lastMatches.length === 1) {
        selectPort(lastMatches[0]);
      } else {
        syncFromInput();
      }
      return;
    }
    const items = list.querySelectorAll('.route-port-item');
    if (!list.classList.contains('open') || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      updateActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      updateActive();
    } else if (e.key === 'Escape') {
      list.classList.remove('open');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      closeList();
      syncFromInput();
    }, 150);
  });
}

function bindPortAutocomplete(input) {
  bindRoutePortAutocomplete(input);
}

function clearRoutePortField(inputId, metaId) {
  const input = document.getElementById(inputId);
  const meta = metaId ? document.getElementById(metaId) : input?.closest('.route-port-wrap')?.querySelector('.port-meta');
  if (input) {
    input.value = '';
    input.classList.remove('port-valid');
  }
  if (meta) meta.textContent = '';
}
const ARC_LOADING_MIN_MS = 1500;
const ARC_LOADING_PAINT_MS = 15;
let arcLoadingDepth = 0;

function arcLoadingPaintBuffer() {
  return new Promise((resolve) => setTimeout(resolve, ARC_LOADING_PAINT_MS));
}

function showArcLoading() {
  arcLoadingDepth++;
  const overlay = document.getElementById('arcLoadingOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('arc-loading');
  document.body.setAttribute('aria-busy', 'true');
}

function hideArcLoading() {
  arcLoadingDepth = Math.max(0, arcLoadingDepth - 1);
  if (arcLoadingDepth > 0) return;
  const overlay = document.getElementById('arcLoadingOverlay');
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('arc-loading');
  document.body.removeAttribute('aria-busy');
}

async function withArcLoading(task) {
  showArcLoading();
  await arcLoadingPaintBuffer();
  const started = performance.now();
  try {
    return await task();
  } finally {
    const delay = Math.max(0, ARC_LOADING_MIN_MS - (performance.now() - started));
    await new Promise(resolve => setTimeout(resolve, delay));
    hideArcLoading();
  }
}
const EXPORT_PAGE_BADGE_LOGO_SCALE = 1.35;
const EXPORT_PAGE_BADGE_GAP_PT = 4;
const EXPORT_PDF_CAPTURE_SCALE = 2;

function buildChainExportMount(source) {
  const mount = document.createElement('div');
  mount.className = 'chain-export-surface';
  mount.setAttribute('aria-hidden', 'true');

  const defaultsWrap = document.createElement('div');
  defaultsWrap.innerHTML = vesselDefaultsExportHtml(getVesselDefaults());
  const defaultsCard = defaultsWrap.firstElementChild;
  if (defaultsCard) mount.appendChild(defaultsCard);

  source.querySelectorAll(':scope > *:not(.chain-export-wrap):not(.results-save-bar)').forEach(node => {
    mount.appendChild(node.cloneNode(true));
  });

  return mount;
}

function tcAnalysisExportHtml(options = {}) {
  const includeArcs = options.includeArcs !== false;
  const showText = (value) => (value != null && String(value).trim() !== '' ? String(value).trim() : '—');
  const vesselEl = document.getElementById('tcVesselName');
  const vessel = vesselEl ? String(vesselEl.value || '').trim() : '';
  const discEl = document.getElementById('discountRate');
  const vesselTypeEl = document.getElementById('vesselType');
  const vesselType = vesselTypeEl?.options?.[vesselTypeEl.selectedIndex]?.text ?? '—';
  const rows = [
    ['Vessel', showText(vessel)],
    ['Discount rate %/yr', showText(discEl?.value)],
    ['Vessel type', showText(vesselType)],
    ['Spot Bear $/day', showText(document.getElementById('spotBear')?.value)],
    ['Spot Base $/day', showText(document.getElementById('spotBase')?.value)],
    ['Spot Bull $/day', showText(document.getElementById('spotBull')?.value)],
  ];
  const cells = rows.map(([label, value]) => `
    <div class="field">
      <label>${label}</label>
      <div class="export-default-value">${value}</div>
    </div>`).join('');
  let arcsCell = '';
  if (includeArcs) {
    const spotRates = getTcSpotScenarioRates();
    const horizon = tcMaxTcArcDurationYears();
    const arcSummary = tcOptions.flatMap(o => {
      if (tcIsSpotArc(o)) {
        const ref = tcLongestTcArcOption();
        const dur = ref ? tcFmtDurationYearsAs(ref, horizon) : '—';
        return [
          `SPOT (Bear): ${fmtDay(spotRates.spotBear)} · ${dur}`,
          `SPOT (Base): ${fmtDay(spotRates.spotBase)} · ${dur}`,
          `SPOT (Bull): ${fmtDay(spotRates.spotBull)} · ${dur}`,
        ];
      }
      const dur = tcFmtDurationTcPlusSpot(o, horizon);
      let line = `${o.label}: ${fmtDay(o.rate)} · ${dur}`;
      if (tcArcHasBaseSpotTail(o, horizon)) line += ` · base spot ${fmtDay(spotRates.spotBase)}`;
      return [line];
    }).join('<br>') || '—';
    arcsCell = `
    <div class="field" style="grid-column:1/-1">
      <label>Arcs</label>
      <div class="export-default-value">${arcSummary}</div>
    </div>`;
  }
  return `<div class="card export-vessel-defaults"><div class="params-grid-3">${cells}${arcsCell}</div></div>`;
}

function tcAnalysisExportFilename() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rawName = (document.getElementById('tcVesselName')?.value || '').trim();
  const vesselName = rawName
    ? rawName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    : 'Vessel';
  return `${vesselName}_${dd}${mm}_tc.pdf`;
}

function buildTcExportMount(source) {
  const mount = document.createElement('div');
  mount.className = 'chain-export-surface';
  mount.setAttribute('aria-hidden', 'true');

  const headerWrap = document.createElement('div');
  headerWrap.innerHTML = tcAnalysisExportHtml();
  const headerCard = headerWrap.firstElementChild;
  if (headerCard) mount.appendChild(headerCard);

  source.querySelectorAll(':scope > *:not(.chain-export-wrap):not(.results-save-bar)').forEach(node => {
    mount.appendChild(node.cloneNode(true));
  });

  return mount;
}

async function exportTcAnalysis() {
  if (!lastTcAnalysis) return;
  const source = document.getElementById('results');
  if (!source) return;

  const btn = source.querySelector('.chain-export-btn');
  if (btn?.disabled) return;

  await withArcLoading(async () => {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }

    let mount = null;
    try {
      if (typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) {
        throw new Error('Export libraries failed to load');
      }

      mount = buildTcExportMount(source);
      await saveExportMountAsPdf(mount, tcAnalysisExportFilename());
      mount = null;
    } catch (err) {
      console.error(err);
      alert('Could not export PDF. Check your connection and try again.');
    } finally {
      if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Export';
      }
    }
  });
}

async function saveExportMountAsPdf(mount, filename) {
  if (!mount?.children?.length) throw new Error('Export surface missing');
  const htmlEl = document.documentElement;
  const prevAttr = htmlEl.getAttribute('data-ui-theme');
  const prevTheme = prevAttr === 'light' || prevAttr === 'dark' ? prevAttr : 'dark';
  const awaitPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  document.body.appendChild(mount);
  try {
    htmlEl.setAttribute('data-ui-theme', 'dark');
    await awaitPaint();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const badgeLogo = await getExportPageBadgeLogoDataUrl();
    await appendExportBlocksToPdf(doc, [...mount.children], badgeLogo, { scale: EXPORT_PDF_CAPTURE_SCALE });
    doc.save(filename);
  } finally {
    htmlEl.setAttribute('data-ui-theme', prevTheme);
    await awaitPaint();
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

function exportPageBadgeLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="square">
    <rect x="29" y="29" width="6" height="6"></rect>
    <line x1="32" y1="29" x2="32" y2="10"></line>
    <line x1="32" y1="10" x2="38" y2="10"></line>
    <line x1="32" y1="35" x2="32" y2="54"></line>
    <line x1="32" y1="54" x2="26" y2="54"></line>
    <line x1="35" y1="32" x2="54" y2="32"></line>
    <line x1="54" y1="32" x2="54" y2="26"></line>
    <line x1="29" y1="32" x2="10" y2="32"></line>
    <line x1="10" y1="32" x2="10" y2="38"></line>
    <line x1="35" y1="29" x2="46" y2="18"></line>
    <line x1="46" y1="18" x2="46" y2="14"></line>
    <line x1="29" y1="35" x2="18" y2="46"></line>
    <line x1="18" y1="46" x2="18" y2="50"></line>
    <line x1="35" y1="35" x2="46" y2="46"></line>
    <line x1="46" y1="46" x2="50" y2="46"></line>
    <line x1="29" y1="29" x2="18" y2="18"></line>
    <line x1="18" y1="18" x2="14" y2="18"></line>
  </svg>`;
}

function getExportPageBadgeLogoDataUrl() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([exportPageBadgeLogoSvg()], { type: 'image/svg+xml' }));
    img.onload = () => {
      const logoSize = Math.round(96 * EXPORT_PAGE_BADGE_LOGO_SCALE);
      const badge = document.createElement('canvas');
      badge.width = logoSize;
      badge.height = logoSize;
      const ctx = badge.getContext('2d');
      ctx.drawImage(img, 0, 0, logoSize, logoSize);
      URL.revokeObjectURL(url);
      resolve(badge.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Export badge logo failed to load'));
    };
    img.src = url;
  });
}

async function appendExportBlocksToPdf(doc, blocks, badgeLogoDataUrl, options = {}) {
  const margin = 36;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const badgeW = 28 * EXPORT_PAGE_BADGE_LOGO_SCALE;
  const badgeH = 28 * EXPORT_PAGE_BADGE_LOGO_SCALE;
  const badgeY = 16;
  const contentTop = badgeY + badgeH + EXPORT_PAGE_BADGE_GAP_PT;
  const contentW = pageW - margin * 2;
  const contentMaxH = pageH - contentTop - margin;
  const blockGapPt = options.blockGapPt ?? 14;
  const captureScale = options.scale ?? 2;
  let pageIndex = 0;
  let yCursor = contentTop;

  const addPageHeader = () => {
    if (pageIndex > 0) doc.addPage();
    doc.addImage(badgeLogoDataUrl, 'PNG', (pageW - badgeW) / 2, badgeY, badgeW, badgeH);
    yCursor = contentTop;
    pageIndex++;
  };

  const fitBlockSize = (canvas) => {
    let drawW = contentW;
    let drawH = canvas.height * (drawW / canvas.width);
    if (drawH > contentMaxH) {
      drawH = contentMaxH;
      drawW = canvas.width * (drawH / canvas.height);
    }
    return { drawW, drawH };
  };

  addPageHeader();

  for (const block of blocks) {
    const canvas = await html2canvas(block, {
      backgroundColor: null,
      scale: captureScale,
      logging: false,
      useCORS: true
    });
    const { drawW, drawH } = fitBlockSize(canvas);
    const drawX = margin + (contentW - drawW) / 2;

    if (yCursor > contentTop && yCursor + drawH > contentTop + contentMaxH) {
      addPageHeader();
    }

    doc.addImage(canvas.toDataURL('image/png'), 'PNG', drawX, yCursor, drawW, drawH);
    yCursor += drawH + blockGapPt;
  }
}
// ═════════════════════════════════════════════════════════════════════════════
// ─── BUNKERS TAB ────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

let bunkSuppliers = [];
let bunkSid = 0;

function bunkQty() {
  return {
    fo: parseNum(document.getElementById('bunk-qty-fo').value) || 0,
    go: parseNum(document.getElementById('bunk-qty-go').value) || 0
  };
}

function bunkCalcTotal(r, q) {
  const fo = parseNum(r.fo) || 0;
  const go = parseNum(r.go) || 0;
  const b = parseNum(r.barging) || 0;
  if (!fo && !go && !b) return null;
  return q.fo * fo + q.go * go + b;
}

function bunkFmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function bunkAddSupplier() {
  bunkSid++;
  bunkSuppliers.push({
    id: bunkSid,
    name: 'Supplier ' + bunkSid,
    rounds: [{ fo: '', go: '', barging: '', isCounter: false }]
  });
  bunkRender();
}

function bunkRemoveSupplier(id) {
  bunkSuppliers = bunkSuppliers.filter(s => s.id !== id);
  bunkRender();
}

function bunkAddRound(id) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) {
    s.rounds.push({ fo: '', go: '', barging: '', isCounter: false });
    bunkRender();
  }
}

function bunkRemoveRound(id, ri) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s && s.rounds.length > 1) {
    s.rounds.splice(ri, 1);
    bunkRender();
  }
}

function bunkUpdateRound(id, ri, field, val) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) {
    s.rounds[ri][field] = val === '' || val === null ? '' : parseNum(val);
    bunkRecalcAll();
  }
}

function bunkUpdateRoundCounter(id, ri, checked) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) s.rounds[ri].isCounter = checked;
}

function bunkUpdateName(id, val) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) s.name = val;
}

/** Updates qty line, row totals, supplier badges, and counter block without re-building quote inputs (so typing stays focused). */
function bunkRefreshQuotesUi() {
  const q = bunkQty();
  document.getElementById('bunk-qty-info').textContent = (q.fo + q.go).toLocaleString() + ' MT total';
  const allTotals = [];
  bunkSuppliers.forEach(s => s.rounds.forEach(r => {
    const t = bunkCalcTotal(r, q);
    if (t !== null) allTotals.push(t);
  }));
  const minT = allTotals.length ? Math.min(...allTotals) : null;
  const maxT = allTotals.length > 1 ? Math.max(...allTotals) : null;

  bunkSuppliers.forEach(s => {
    const card = document.querySelector(`#bunk-suppliers-container .bunker-supplier[data-bunk-sid="${s.id}"]`);
    if (!card) return;

    const supplierTotals = s.rounds.map(r => bunkCalcTotal(r, q)).filter(t => t !== null);
    const latestTotal = supplierTotals.length ? supplierTotals[supplierTotals.length - 1] : null;
    let badgeCls = '';
    let badgeTxt = '';
    if (latestTotal !== null) {
      badgeTxt = bunkFmt(latestTotal);
      if (minT !== null && maxT !== null) {
        if (latestTotal === minT) badgeCls = 'best';
        else if (latestTotal === maxT) badgeCls = 'worst';
      }
    }

    const headRight = card.querySelector('.bunker-supplier-head-right');
    if (headRight) {
      const removeBtn = headRight.querySelector('.bunker-btn-ghost.danger');
      let badge = headRight.querySelector('.bunker-supplier-badge');
      if (badgeTxt) {
        if (!badge) {
          badge = document.createElement('span');
          if (removeBtn) headRight.insertBefore(badge, removeBtn);
          else headRight.appendChild(badge);
        }
        badge.className = 'bunker-supplier-badge' + (badgeCls ? ' ' + badgeCls : '');
        badge.textContent = badgeTxt;
      } else if (badge) {
        badge.remove();
      }
    }

    s.rounds.forEach((r, ri) => {
      const row = card.querySelector(`tbody tr[data-bunk-ri="${ri}"]`);
      if (!row) return;
      const t = bunkCalcTotal(r, q);
      let cls = 'bunker-total-val';
      if (t !== null && minT !== null && allTotals.length > 1) {
        if (t === minT) cls += ' best';
        else if (maxT !== null && t === maxT) cls += ' worst';
      }
      const span = row.querySelector('.bunker-total-val');
      if (span) {
        span.className = cls;
        span.textContent = t !== null ? bunkFmt(t) : '—';
      }
    });
  });

  bunkCalcCounters();
}

function bunkRecalcAll() {
  bunkRefreshQuotesUi();
}

function bunkFormatDateInput(el) {
  const digits = (el.value || '').replace(/\D/g, '').slice(0, 6);
  let out = '';
  if (digits.length >= 1) out += digits.slice(0, 2);
  if (digits.length >= 3) out += '/' + digits.slice(2, 4);
  if (digits.length >= 5) out += '/' + digits.slice(4, 6);
  el.value = out;
}

function bunkNormalizeDDMMYY(raw) {
  if (!raw) return '';
  const parts = raw.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || d.length !== 2 || m.length !== 2 || y.length !== 2) return '';
  return d + '/' + m + '/' + y;
}

function bunkNormalizeDateFile(raw) {
  if (!raw) return '';
  const parts = raw.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || d.length !== 2 || m.length !== 2 || y.length !== 2) return '';
  return d + m + y;
}

function bunkUpdateTitle() {
  document.title = 'Arctium Labs';
}

function bunkBuildFilename() {
  const vessel = document.getElementById('bunk-vessel').value.trim();
  const port = document.getElementById('bunk-port').value.trim();
  const df = bunkNormalizeDDMMYY(document.getElementById('bunk-date-from').value);
  const dt = bunkNormalizeDDMMYY(document.getElementById('bunk-date-to').value);
  const earliest = df || dt;
  const datePart = earliest || '';
  const parts = [vessel, port, datePart].filter(Boolean);
  return (parts.length ? parts.join('_') : 'Bunker_Calc') + '.pdf';
}

function bunkExportShowText(value) {
  const text = (value ?? '').toString().trim();
  return text ? text : '—';
}

function bunkReplaceControlWithExportValue(el) {
  const div = document.createElement('div');
  div.className = 'export-default-value';
  if (el.matches('input[type="checkbox"]')) {
    div.textContent = el.checked ? '●' : '—';
    const counterLabel = el.closest('.bunker-counter-check-label');
    if (counterLabel) {
      counterLabel.replaceWith(div);
      return;
    }
  } else {
    div.textContent = bunkExportShowText(el.value);
  }
  el.replaceWith(div);
}

function bunkSanitizeExportClone(root) {
  root.querySelectorAll(
    '.bunker-toolbar-btn, .bunker-btn-add-supplier, .bunker-btn-add-round, .bunker-btn-ghost'
  ).forEach(el => el.remove());
  root.querySelectorAll('input').forEach(bunkReplaceControlWithExportValue);
  root.querySelectorAll('.bunker-table tr').forEach(row => {
    const cells = row.querySelectorAll('th, td');
    if (cells.length) cells[cells.length - 1].remove();
  });
  root.querySelectorAll('.bunker-supplier-head-right:empty').forEach(el => el.remove());
}

function buildBunkerExportMount() {
  const mount = document.createElement('div');
  mount.className = 'bunker-export-surface';
  mount.setAttribute('aria-hidden', 'true');
  const layout = document.getElementById('bunker-app')?.querySelector('.bunker-layout');
  if (!layout) return null;

  layout.querySelectorAll('.card:not(.bunker-toolbar):not(.bunker-counter-block)').forEach(card => {
    const clone = card.cloneNode(true);
    bunkSanitizeExportClone(clone);
    mount.appendChild(clone);
  });

  const suppliers = document.getElementById('bunk-suppliers-container');
  if (suppliers) {
    suppliers.querySelectorAll('.bunker-supplier').forEach(card => {
      const clone = card.cloneNode(true);
      bunkSanitizeExportClone(clone);
      mount.appendChild(clone);
    });
  }

  return mount;
}

async function bunkExportPDF() {
  const btn = document.querySelector('#bunker-app .bunker-toolbar-side:not(.right) .bunker-toolbar-btn');
  if (btn?.disabled) return;

  await withArcLoading(async () => {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }

    let mount = null;
    try {
      if (typeof html2canvas !== 'function' || !window.jspdf?.jsPDF) {
        throw new Error('Export libraries failed to load');
      }

      mount = buildBunkerExportMount();
      await saveExportMountAsPdf(mount, bunkBuildFilename());
      mount = null;
    } catch (err) {
      console.error(err);
      alert('Could not export PDF. Check your connection and try again.');
    } finally {
      if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Export';
      }
    }
  });
}

function bunkResetAll() {
  document.getElementById('bunk-vessel').value = '';
  clearRoutePortField('bunk-port', 'bunk-port-meta');
  document.getElementById('bunk-date-from').value = '';
  document.getElementById('bunk-date-to').value = '';
  document.getElementById('bunk-qty-fo').value = '';
  document.getElementById('bunk-qty-go').value = '';
  document.getElementById('bunk-target-lumpsum').value = '';
  bunkSuppliers = [];
  bunkSid = 0;
  bunkAddSupplier();
  bunkAddSupplier();
  bunkUpdateTitle();
}

function bunkRender() {
  const q = bunkQty();
  const allTotals = [];
  bunkSuppliers.forEach(s => s.rounds.forEach(r => {
    const t = bunkCalcTotal(r, q);
    if (t !== null) allTotals.push(t);
  }));
  const minT = allTotals.length ? Math.min(...allTotals) : null;
  const maxT = allTotals.length > 1 ? Math.max(...allTotals) : null;

  document.getElementById('bunk-suppliers-container').innerHTML = bunkSuppliers.map(s => {
    const supplierTotals = s.rounds.map(r => bunkCalcTotal(r, q)).filter(t => t !== null);
    const latestTotal = supplierTotals.length ? supplierTotals[supplierTotals.length - 1] : null;
    let badgeCls = '';
    let badgeTxt = '';
    if (latestTotal !== null) {
      badgeTxt = bunkFmt(latestTotal);
      if (minT !== null && maxT !== null) {
        if (latestTotal === minT) badgeCls = 'best';
        else if (latestTotal === maxT) badgeCls = 'worst';
      }
    }

    const rows = s.rounds.map((r, ri) => {
      const t = bunkCalcTotal(r, q);
      let cls = 'bunker-total-val';
      if (t !== null && minT !== null && allTotals.length > 1) {
        if (t === minT) cls += ' best';
        else if (maxT !== null && t === maxT) cls += ' worst';
      }
      return `<tr data-bunk-ri="${ri}">
        <td><span class="bunker-round-tag">R${ri + 1}</span></td>
        <td><input ${numInputHtml(r.fo === '' || r.fo == null ? '' : r.fo, 2, `bunkUpdateRound(${s.id},${ri},'fo',this.value)`)} placeholder="—"></td>
        <td><input ${numInputHtml(r.go === '' || r.go == null ? '' : r.go, 2, `bunkUpdateRound(${s.id},${ri},'go',this.value)`)} placeholder="—"></td>
        <td><input ${numInputHtml(r.barging === '' || r.barging == null ? '' : r.barging, 0, `bunkUpdateRound(${s.id},${ri},'barging',this.value)`)} placeholder="—"></td>
        <td><label class="bunker-counter-check-label" title="my counter offer"><input type="checkbox" class="bunker-counter-check-input" ${r.isCounter ? 'checked' : ''} onchange="bunkUpdateRoundCounter(${s.id},${ri},this.checked)"><span class="bunker-counter-check-visual" aria-hidden="true"><span class="bunker-counter-check-icon bunker-counter-check-unchecked"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="#a8b8a8" fill-rule="evenodd" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" clip-rule="evenodd"/></svg></span><span class="bunker-counter-check-icon bunker-counter-check-checked"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="#a8b8a8" fill-rule="evenodd" clip-rule="evenodd"><path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="M17.096 8.282a1 1 0 0 1 .022 1.414l-5.643 5.822a1.24 1.24 0 0 1-1.78 0L7.281 13.03a1 1 0 1 1 1.436-1.392l1.867 1.926l5.097-5.259a1 1 0 0 1 1.414-.022Z"/></g></svg></span></span></label></td>
        <td><span class="${cls}">${t !== null ? bunkFmt(t) : '—'}</span></td>
        <td><button class="bunker-btn-ghost danger" type="button" data-admin-only onclick="bunkRemoveRound(${s.id},${ri})">×</button></td>
      </tr>`;
    }).join('');

    return `<div class="card bunker-supplier" data-bunk-sid="${s.id}">
      <div class="bunker-supplier-head">
        <input class="bunker-supplier-name" type="text" value="${s.name}" oninput="bunkUpdateName(${s.id},this.value)">
        <div class="bunker-supplier-head-right">
          ${badgeTxt ? `<span class="bunker-supplier-badge ${badgeCls}">${badgeTxt}</span>` : ''}
          <button class="bunker-btn-ghost danger" type="button" data-admin-only onclick="bunkRemoveSupplier(${s.id})">remove</button>
        </div>
      </div>
      <div class="bunker-quotes-wrap">
        <table class="bunker-table">
          <thead><tr>
            <th style="width:80px">round</th>
            <th>FO ($/MT)</th>
            <th>GO ($/MT)</th>
            <th>barging ($)</th>
            <th>ctr</th>
            <th>total</th>
            <th style="width:30px"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <button class="bunker-btn-ghost bunker-btn-add-round" type="button" onclick="bunkAddRound(${s.id})">+ round</button>
    </div>`;
  }).join('');

  bunkCalcCounters();
  applyRoleUI();
}

function bunkCalcCounters() {
  const target = parseNum(document.getElementById('bunk-target-lumpsum').value);
  const q = bunkQty();
  const el = document.getElementById('bunk-counter-results');
  if (!target || isNaN(target) || !bunkSuppliers.length) {
    el.innerHTML = '';
    return;
  }

  const cards = bunkSuppliers.map(s => {
    const last = [...s.rounds].reverse().find(r => (parseNum(r.fo) || 0) > 0 || (parseNum(r.go) || 0) > 0);
    if (!last) {
      return `<div class="bunker-counter-card"><div class="bunker-cc-name"><span>${s.name.toUpperCase()}</span></div><div class="bunker-no-quote">no quotes yet</div></div>`;
    }

    const fo = parseNum(last.fo) || 0;
    const go = parseNum(last.go) || 0;
    const b = parseNum(last.barging) || 0;
    const adj = q.fo * fo + q.go * go;
    if (!adj) {
      return `<div class="bunker-counter-card"><div class="bunker-cc-name"><span>${s.name.toUpperCase()}</span></div><div class="bunker-no-quote">need fo/go prices</div></div>`;
    }

    const scale = (target - b) / adj;
    const nFo = fo * scale;
    const nGo = go * scale;
    const nFoRnd = Math.round(nFo);
    const nGoRnd = Math.round(nGo);
    const nTotal = q.fo * nFoRnd + q.go * nGoRnd + b;
    const curr = bunkCalcTotal(last, q);
    const delta = curr !== null ? target - curr : null;
    const deltaTxt = delta !== null ? (delta < 0 ? '−$' + Math.abs(Math.round(delta)).toLocaleString() : '+$' + Math.round(delta).toLocaleString()) : '';
    const deltaCls = delta !== null ? (delta < 0 ? 'neg' : 'pos') : '';

    return `<div class="bunker-counter-card">
      <div class="bunker-cc-name">
        <span>${s.name.toUpperCase()}</span>
        ${deltaTxt ? `<span class="bunker-cc-delta ${deltaCls}">${deltaTxt}</span>` : ''}
      </div>
      <div class="bunker-cc-line">
        <span class="bunker-cc-key">FO</span>
        <div style="text-align:right">
          <div class="bunker-cc-val">$${nFoRnd}/MT</div>
          <div class="bunker-cc-was">was $${fo.toFixed(2)}</div>
        </div>
      </div>
      <div class="bunker-cc-line">
        <span class="bunker-cc-key">GO</span>
        <div style="text-align:right">
          <div class="bunker-cc-val">$${nGoRnd}/MT</div>
          <div class="bunker-cc-was">was $${go.toFixed(2)}</div>
        </div>
      </div>
      ${b > 0 ? `<div class="bunker-cc-line"><span class="bunker-cc-key">barging</span><span class="bunker-cc-val">$${b.toLocaleString()}</span></div>` : ''}
      <div class="bunker-cc-total">
        <span class="bunker-cc-total-label">counter total</span>
        <span class="bunker-cc-total-val">${bunkFmt(nTotal)}</span>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="bunker-counter-grid">${cards}</div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const embeddedInIndex = !!document.getElementById('tab-dashboard');
  const root = document.getElementById('bunker-app');
  if (!root) return;

  if (!embeddedInIndex) {
    document.documentElement.setAttribute('data-ui-theme', 'dark');
    document.addEventListener('input', e => {
      if (e.target.matches('input.num-fmt')) sanitizeNumInputEl(e.target);
    }, true);
    document.addEventListener('blur', e => {
      if (e.target.matches('input.num-fmt')) formatNumInputEl(e.target);
    }, true);
  }

  formatAllNumInputs(root);
  wireBunkerPorts();

  if (!bunkSuppliers.length) {
    bunkAddSupplier();
    bunkAddSupplier();
  }

  if (!embeddedInIndex && window.parent !== window) {
    window.parent.postMessage({ type: 'arctium-bunker-ready' }, '*');
  }
});

window.addEventListener('message', e => bunkReceiveUiState(e.data));
