/* Bunker tab — loaded after index.html main script */
/* Bunker Negotiator — shared with Bunkers_Negotiator.html */
let bunkIsAdmin = false;
let bunkIsOps = false;

function bunkApplyRoleUI() {
  const root = document.getElementById('bunker-app');
  if (!root) return;
  root.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = bunkIsAdmin ? '' : 'none';
  });
  root.querySelectorAll('[data-admin-or-ops]').forEach(el => {
    el.style.display = (bunkIsAdmin || bunkIsOps) ? '' : 'none';
  });
}

function bunkReceiveUiState(data) {
  if (!data || data.type !== 'arctium-ui') return;
  document.documentElement.setAttribute('data-ui-theme', data.theme === 'light' ? 'light' : 'dark');
  bunkIsAdmin = !!data.isAdmin;
  bunkIsOps = !!data.isOps;
  bunkApplyRoleUI();
}

function initBunkPortAutocomplete() {
  const inp = document.getElementById('bunk-port');
  if (!inp || inp.dataset.portAcBound === '1') return;
  bindPortAutocomplete(inp);
}

function wireBunkerPorts() {
  initBunkPortAutocomplete();
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── BUNKERS TAB ────────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

let bunkSuppliers = [];
let bunkSid = 0;
let bunkVesselTabs = [];
let bunkTabId = 0;
let bunkTabNum = 0;
let bunkActiveTabId = null;
let bunkViewMode = 'vessel';

function bunkEmptyTabState(id) {
  bunkTabNum++;
  return {
    id,
    tabNum: bunkTabNum,
    vessel: '',
    port: '',
    dateFrom: '',
    dateTo: '',
    qtyFo: '',
    qtyGo: '',
    targetLumpsum: '',
    suppliers: [],
    sid: 0
  };
}

function bunkGetActiveTab() {
  return bunkVesselTabs.find(t => t.id === bunkActiveTabId) || null;
}

function bunkTabLabel(tab) {
  const vessel = (tab.vessel || '').trim();
  return vessel || ('Tab ' + tab.tabNum);
}

function bunkEscapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bunkPersistActiveTab() {
  if (bunkViewMode !== 'vessel') return;
  const tab = bunkGetActiveTab();
  if (!tab) return;
  tab.vessel = document.getElementById('bunk-vessel').value;
  tab.port = document.getElementById('bunk-port').value;
  tab.dateFrom = document.getElementById('bunk-date-from').value;
  tab.dateTo = document.getElementById('bunk-date-to').value;
  tab.qtyFo = document.getElementById('bunk-qty-fo').value;
  tab.qtyGo = document.getElementById('bunk-qty-go').value;
  tab.targetLumpsum = document.getElementById('bunk-target-lumpsum').value;
  tab.suppliers = JSON.parse(JSON.stringify(bunkSuppliers));
  tab.sid = bunkSid;
}

function bunkRestorePortField(portVal) {
  const input = document.getElementById('bunk-port');
  const meta = document.getElementById('bunk-port-meta');
  if (!input) return;
  input.value = portVal || '';
  const exact = typeof findExactPortInCatalog === 'function' ? findExactPortInCatalog(portVal) : null;
  if (exact && meta) {
    input.classList.add('port-valid');
    const draft = exact.draft != null ? exact.draft.toFixed(1) : '—';
    meta.textContent = `lat: ${Number(exact.lat).toFixed(2)}  lon: ${Number(exact.lon).toFixed(2)}  draft: ${draft} m`;
  } else {
    input.classList.remove('port-valid');
    if (meta) meta.textContent = '';
  }
}

function bunkRestoreTab(tabId) {
  const tab = bunkVesselTabs.find(t => t.id === tabId);
  if (!tab) return;
  bunkActiveTabId = tabId;
  document.getElementById('bunk-vessel').value = tab.vessel || '';
  bunkRestorePortField(tab.port);
  document.getElementById('bunk-date-from').value = tab.dateFrom || '';
  document.getElementById('bunk-date-to').value = tab.dateTo || '';
  document.getElementById('bunk-qty-fo').value = tab.qtyFo || '';
  document.getElementById('bunk-qty-go').value = tab.qtyGo || '';
  document.getElementById('bunk-target-lumpsum').value = tab.targetLumpsum || '';
  bunkSuppliers = JSON.parse(JSON.stringify(tab.suppliers || []));
  bunkSid = tab.sid || 0;
  if (!bunkSuppliers.length) {
    bunkAddSupplier();
    bunkAddSupplier();
  } else {
    bunkRender();
  }
  formatAllNumInputs(document.getElementById('bunk-vessel-content'));
  bunkUpdateToolbarVisibility();
  bunkUpdateTitle();
}

function bunkUpdateToolbarVisibility() {
  const vesselContent = document.getElementById('bunk-vessel-content');
  const toolbar = vesselContent?.querySelector('.bunker-toolbar');
  if (!toolbar) return;
  const exportBtn = toolbar.querySelector('.bunker-toolbar-side:not(.right) .bunker-toolbar-btn');
  const resetBtn = toolbar.querySelector('.bunker-toolbar-side.right .bunker-toolbar-btn');
  const show = bunkViewMode === 'vessel';
  if (exportBtn) exportBtn.style.display = show ? '' : 'none';
  if (resetBtn) resetBtn.style.display = show ? '' : 'none';
}

function bunkSwitchToVesselTab(tabId) {
  if (bunkViewMode === 'vessel' && bunkActiveTabId === tabId) return;
  bunkPersistActiveTab();
  bunkViewMode = 'vessel';
  document.getElementById('bunk-vessel-content').hidden = false;
  document.getElementById('bunk-summary-content').hidden = true;
  bunkRestoreTab(tabId);
  bunkRenderVesselTabBar();
}

function bunkSwitchToSummary() {
  if (bunkViewMode === 'summary') return;
  bunkPersistActiveTab();
  bunkViewMode = 'summary';
  document.getElementById('bunk-vessel-content').hidden = true;
  document.getElementById('bunk-summary-content').hidden = false;
  bunkRenderSummary();
  bunkRenderVesselTabBar();
  bunkUpdateToolbarVisibility();
}

function bunkAddVesselTab() {
  bunkPersistActiveTab();
  bunkTabId++;
  const tab = bunkEmptyTabState(bunkTabId);
  bunkVesselTabs.push(tab);
  bunkViewMode = 'vessel';
  document.getElementById('bunk-vessel-content').hidden = false;
  document.getElementById('bunk-summary-content').hidden = true;
  bunkSuppliers = [];
  bunkSid = 0;
  bunkActiveTabId = bunkTabId;
  document.getElementById('bunk-vessel').value = '';
  bunkRestorePortField('');
  document.getElementById('bunk-date-from').value = '';
  document.getElementById('bunk-date-to').value = '';
  document.getElementById('bunk-qty-fo').value = '';
  document.getElementById('bunk-qty-go').value = '';
  document.getElementById('bunk-target-lumpsum').value = '';
  bunkAddSupplier();
  bunkAddSupplier();
  bunkRenderVesselTabBar();
  bunkUpdateToolbarVisibility();
  bunkUpdateTitle();
}

function bunkCloseVesselTab(tabId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const idx = bunkVesselTabs.findIndex(t => t.id === tabId);
  if (idx < 0) return;
  bunkVesselTabs.splice(idx, 1);
  if (!bunkVesselTabs.length) {
    bunkTabId++;
    const tab = bunkEmptyTabState(bunkTabId);
    bunkVesselTabs.push(tab);
    bunkViewMode = 'vessel';
    document.getElementById('bunk-vessel-content').hidden = false;
    document.getElementById('bunk-summary-content').hidden = true;
    bunkSuppliers = [];
    bunkSid = 0;
    bunkActiveTabId = tab.id;
    document.getElementById('bunk-vessel').value = '';
    bunkRestorePortField('');
    document.getElementById('bunk-date-from').value = '';
    document.getElementById('bunk-date-to').value = '';
    document.getElementById('bunk-qty-fo').value = '';
    document.getElementById('bunk-qty-go').value = '';
    document.getElementById('bunk-target-lumpsum').value = '';
    bunkAddSupplier();
    bunkAddSupplier();
    bunkRenderVesselTabBar();
    bunkUpdateToolbarVisibility();
    bunkUpdateTitle();
    return;
  }
  if (bunkViewMode === 'summary') {
    bunkRenderSummary();
    bunkRenderVesselTabBar();
    return;
  }
  if (bunkActiveTabId === tabId) {
    const next = bunkVesselTabs[Math.min(idx, bunkVesselTabs.length - 1)];
    bunkSwitchToVesselTab(next.id);
  } else {
    bunkRenderVesselTabBar();
  }
}

function bunkRenderVesselTabBar() {
  const el = document.getElementById('bunk-vessel-tabs');
  if (!el) return;
  const tabsHtml = bunkVesselTabs.map((tab) => {
    const label = bunkTabLabel(tab);
    const active = bunkViewMode === 'vessel' && tab.id === bunkActiveTabId;
    return `<div class="bunker-vtab${active ? ' active' : ''}" role="tab" aria-selected="${active}" tabindex="0" onclick="bunkSwitchToVesselTab(${tab.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();bunkSwitchToVesselTab(${tab.id})}">
      <span class="bunker-vtab-label">${bunkEscapeHtml(label)}</span>
      <button type="button" class="bunker-vtab-close" title="Delete tab" aria-label="Delete ${bunkEscapeHtml(label)}" onclick="bunkCloseVesselTab(${tab.id}, event)">×</button>
    </div>`;
  }).join('');
  const summaryActive = bunkViewMode === 'summary';
  el.innerHTML = `${tabsHtml}<button type="button" class="bunker-vtab-add" title="Add vessel tab" onclick="bunkAddVesselTab()">+</button><button type="button" class="bunker-vtab bunker-vtab-summary${summaryActive ? ' active' : ''}" role="tab" aria-selected="${summaryActive}" onclick="bunkSwitchToSummary()"><span class="bunker-vtab-label">Summary</span></button>`;
}

function bunkSummaryQty(tab) {
  return {
    fo: parseNum(tab.qtyFo) || 0,
    go: parseNum(tab.qtyGo) || 0
  };
}

function bunkSummarySupplierStats(tab) {
  const q = bunkSummaryQty(tab);
  const stats = (tab.suppliers || []).map(s => {
    const supplierTotals = s.rounds.map(r => bunkCalcTotal(r, q)).filter(t => t !== null);
    const latestTotal = supplierTotals.length ? supplierTotals[supplierTotals.length - 1] : null;
    const last = [...s.rounds].reverse().find(r => (parseNum(r.fo) || 0) > 0 || (parseNum(r.go) || 0) > 0);
    return { name: s.name, latestTotal, last };
  });
  const totals = stats.map(s => s.latestTotal).filter(t => t !== null);
  const minT = totals.length ? Math.min(...totals) : null;
  const maxT = totals.length > 1 ? Math.max(...totals) : null;
  return { stats, minT, maxT, q };
}

function bunkRenderSummary() {
  const body = document.getElementById('bunk-summary-body');
  if (!body) return;
  if (!bunkVesselTabs.length) {
    body.innerHTML = '<div class="card"><div class="bunker-summary-empty">No vessel tabs open.</div></div>';
    return;
  }
  body.innerHTML = bunkVesselTabs.map((tab) => {
    const label = bunkTabLabel(tab);
    const port = (tab.port || '').trim() || '—';
    const df = bunkNormalizeDDMMYY(tab.dateFrom) || '—';
    const dt = bunkNormalizeDDMMYY(tab.dateTo) || '—';
    const q = bunkSummaryQty(tab);
    const qtyTxt = (q.fo + q.go) > 0 ? `${q.fo.toLocaleString()} FO + ${q.go.toLocaleString()} GO MT` : '—';
    const { stats, minT, maxT } = bunkSummarySupplierStats(tab);
    const target = parseNum(tab.targetLumpsum);

    let suppliersHtml = '';
    if (!stats.length) {
      suppliersHtml = '<div class="bunker-summary-empty">No suppliers yet</div>';
    } else {
      suppliersHtml = `<div class="bunker-summary-suppliers">${stats.map(s => {
        let cls = 'bunker-summary-supplier';
        if (s.latestTotal !== null && minT !== null && maxT !== null) {
          if (s.latestTotal === minT) cls += ' best';
          else if (s.latestTotal === maxT) cls += ' worst';
        }
        const totalTxt = s.latestTotal !== null ? bunkFmt(s.latestTotal) : '—';
        let detail = '';
        if (s.last) {
          const fo = parseNum(s.last.fo);
          const go = parseNum(s.last.go);
          const parts = [];
          if (fo) parts.push(`FO $${fo.toFixed(2)}/MT`);
          if (go) parts.push(`GO $${go.toFixed(2)}/MT`);
          if (parts.length) detail = parts.join(' · ');
        }
        return `<div class="${cls}"><div class="bunker-summary-supplier-name">${bunkEscapeHtml(s.name)}</div><div class="bunker-summary-supplier-total">${totalTxt}</div>${detail ? `<div class="bunker-summary-supplier-detail">${detail}</div>` : ''}</div>`;
      }).join('')}</div>`;
    }

    let targetHtml = '';
    if (target && !isNaN(target)) {
      const best = stats.filter(s => s.latestTotal !== null).sort((a, b) => a.latestTotal - b.latestTotal)[0];
      if (best && best.last) {
        const fo = parseNum(best.last.fo) || 0;
        const go = parseNum(best.last.go) || 0;
        const b = parseNum(best.last.barging) || 0;
        const adj = q.fo * fo + q.go * go;
        if (adj) {
          const scale = (target - b) / adj;
          const nFo = Math.round(fo * scale);
          const nGo = Math.round(go * scale);
          const nTotal = q.fo * nFo + q.go * nGo + b;
          const delta = best.latestTotal !== null ? target - best.latestTotal : null;
          const deltaTxt = delta !== null ? (delta < 0 ? '−$' + Math.abs(Math.round(delta)).toLocaleString() : '+$' + Math.round(delta).toLocaleString()) : '';
          targetHtml = `<div class="bunker-summary-meta" style="margin-top:14px"><div class="bunker-summary-meta-key">Target counter (${best.name})</div><div class="bunker-summary-meta-val">FO $${nFo}/MT · GO $${nGo}/MT · ${bunkFmt(nTotal)}${deltaTxt ? ` (${deltaTxt})` : ''}</div></div>`;
        }
      }
    }

    return `<div class="card bunker-summary-vessel" onclick="bunkSwitchToVesselTab(${tab.id})">
      <div class="card-title">${bunkEscapeHtml(label)}</div>
      <div class="bunker-summary-head">
        <div class="bunker-summary-meta"><div class="bunker-summary-meta-key">Port</div><div class="bunker-summary-meta-val">${port}</div></div>
        <div class="bunker-summary-meta"><div class="bunker-summary-meta-key">Delivery</div><div class="bunker-summary-meta-val">${df} – ${dt}</div></div>
        <div class="bunker-summary-meta"><div class="bunker-summary-meta-key">Quantities</div><div class="bunker-summary-meta-val">${qtyTxt}</div></div>
        ${target ? `<div class="bunker-summary-meta"><div class="bunker-summary-meta-key">Target</div><div class="bunker-summary-meta-val">${bunkFmt(target)}</div></div>` : ''}
      </div>
      ${suppliersHtml}
      ${targetHtml}
      <div class="bunker-summary-jump">Click to open tab →</div>
    </div>`;
  }).join('');
}

function bunkOnMetaChange() {
  bunkPersistActiveTab();
  bunkUpdateTitle();
}

function bunkUpdateTitle() {
  document.title = 'Arctium Labs';
  bunkRenderVesselTabBar();
}

function bunkInitVesselTabs() {
  if (bunkVesselTabs.length) return;
  bunkTabId = 1;
  const tab = bunkEmptyTabState(bunkTabId);
  bunkVesselTabs.push(tab);
  bunkActiveTabId = bunkTabId;
  bunkRenderVesselTabBar();
}

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
  bunkPersistActiveTab();
}

function bunkRemoveSupplier(id) {
  bunkSuppliers = bunkSuppliers.filter(s => s.id !== id);
  bunkRender();
  bunkPersistActiveTab();
}

function bunkAddRound(id) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) {
    s.rounds.push({ fo: '', go: '', barging: '', isCounter: false });
    bunkRender();
    bunkPersistActiveTab();
  }
}

function bunkRemoveRound(id, ri) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s && s.rounds.length > 1) {
    s.rounds.splice(ri, 1);
    bunkRender();
    bunkPersistActiveTab();
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
  if (s) {
    s.rounds[ri].isCounter = checked;
    bunkPersistActiveTab();
  }
}

function bunkUpdateName(id, val) {
  const s = bunkSuppliers.find(s => s.id === id);
  if (s) {
    s.name = val;
    bunkPersistActiveTab();
  }
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
  if (bunkViewMode === 'vessel') bunkPersistActiveTab();
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
  bunkRenderVesselTabBar();
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
  if (bunkViewMode !== 'vessel') return;
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
  bunkPersistActiveTab();
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
  bunkApplyRoleUI();
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
  if (bunkViewMode === 'vessel') bunkPersistActiveTab();
}

function bunkInitApp() {
  const inIframe = window.parent !== window;
  const root = document.getElementById('bunker-app');
  if (!root || root.dataset.bunkInit === '1') return;
  root.dataset.bunkInit = '1';

  if (!inIframe) {
    document.documentElement.setAttribute('data-ui-theme', 'dark');
  }

  document.addEventListener('input', e => {
    if (e.target.matches('input.num-fmt')) sanitizeNumInputEl(e.target);
  }, true);
  document.addEventListener('blur', e => {
    if (e.target.matches('input.num-fmt')) formatNumInputEl(e.target);
  }, true);

  formatAllNumInputs(root);
  wireBunkerPorts();
  bunkInitVesselTabs();

  if (!bunkSuppliers.length) {
    bunkAddSupplier();
    bunkAddSupplier();
  }
  bunkPersistActiveTab();

  if (inIframe) {
    window.parent.postMessage({ type: 'arctium-bunker-ready' }, '*');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bunkInitApp);
} else {
  bunkInitApp();
}

window.addEventListener('message', e => bunkReceiveUiState(e.data));
