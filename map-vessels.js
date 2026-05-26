/* Map tab — vessel PDF tracking (map_vessels). Independent of Live Position. */
(function () {
  'use strict';

  const MAP_VESSELS_STALE_MS = 96 * 60 * 60 * 1000;
  const MAP_VESSELS_STALE_TICK_MS = 5 * 60 * 1000;
  const MAP_VESSEL_DOT_COLOR = '#e8a040';
  const MAP_VESSEL_DOT_STALE = '#b87878';

  /** Exact PDF field labels (used as boundaries when extracting values). */
  const MAP_VESSEL_FIELD_STOPS = [
    "Vessel's Name:",
    'Last Position',
    'Nearest port',
    'Last Port',
    'Next Port',
    'Speed',
    'Issue Date:',
    'ETA',
    'Distance Over Ground',
    'M/E Power',
    'M/E Speed',
    'Total HFO',
    'Laden - Mean Draft',
    'Daily Summary',
    'Providers Report',
  ];

  let mapVesselsRecords = [];
  let mapVesselsLayerGroup = null;
  let mapVesselsStaleTimer = null;
  let mapVesselsUiBound = false;
  let mapVesselsPdfReady = false;
  let mapVesselsInited = false;

  function mapVesselsNormName(name) {
    return String(name ?? '').trim().replace(/\s+/g, ' ');
  }

  function mapVesselsEscapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function mapVesselsLabelVariants(label) {
    const variants = [label];
    if (label.includes("'")) variants.push(label.replace(/'/g, '\u2019'));
    if (label.includes('\u2019')) variants.push(label.replace(/\u2019/g, "'"));
    return variants;
  }

  function mapVesselsLabelTailRe(label) {
    return label.endsWith(':') ? '' : '(?:\\s*:|\\s+)';
  }

  function mapVesselsFindLabel(body, label) {
    for (const lab of mapVesselsLabelVariants(label)) {
      const esc = mapVesselsEscapeRe(lab);
      const re = new RegExp(esc + mapVesselsLabelTailRe(lab), 'i');
      const m = body.match(re);
      if (m && m.index != null) return { index: m.index, length: m[0].length, label: lab };
    }
    return null;
  }

  function mapVesselsStopBoundaryRe(stop) {
    const esc = mapVesselsEscapeRe(stop);
    const tail = stop.endsWith(':') ? '(?:\\s|$)' : '(?:\\s*:|\\s+)';
    return new RegExp('(?:^|[\\n\\r])\\s*' + esc + tail + '|\\s+' + esc + tail, 'i');
  }

  function mapVesselsFieldSliceEnd(after, matchedLabel) {
    let end = after.length;
    const matchedNorm = matchedLabel.toLowerCase();
    const nl = after.search(/\n/);
    if (nl >= 0) end = Math.min(end, nl);
    for (const stop of MAP_VESSEL_FIELD_STOPS) {
      if (stop.toLowerCase() === matchedNorm) continue;
      for (const stopLab of mapVesselsLabelVariants(stop)) {
        const re = mapVesselsStopBoundaryRe(stopLab);
        const m = after.search(re);
        if (m >= 0 && m < end) end = m;
      }
    }
    return end;
  }

  function mapVesselsGrabField(text, label, opts) {
    const options = opts || {};
    const body = String(text ?? '').replace(/\r\n/g, '\n');
    const hit = mapVesselsFindLabel(body, label);
    if (!hit) return '';
    let after = body.slice(hit.index + hit.length).replace(/^[\s:\-–—]+/, '');
    const end = mapVesselsFieldSliceEnd(after, hit.label);
    let value = after.slice(0, end);
    if (options.firstLineOnly) {
      value = value.split('\n')[0];
    }
    if (options.preserveNewlines) {
      return value.trim();
    }
    return value.replace(/\s+/g, ' ').trim();
  }

  function mapVesselsGrabVesselName(text) {
    const raw = mapVesselsGrabFieldAny(
      text,
      ["Vessel's Name:", 'Vessel name'],
      { firstLineOnly: true, preserveNewlines: true }
    );
    if (!raw) return '';
    let line = raw.split('\n')[0].trim();
    line = line.replace(/\s+IMO\s*(?:No\.?)?\s*:.*$/i, '').trim();
    line = line.replace(/\s+Report\s+Title\s*:.*$/i, '').trim();
    return mapVesselsNormName(line);
  }

  function mapVesselsGrabFieldAny(text, labels, opts) {
    for (const label of labels) {
      const v = mapVesselsGrabField(text, label, opts);
      if (v) return v;
    }
    return '';
  }

  function mapVesselsParseNumber(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).replace(/,/g, '').trim();
    const m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function mapVesselsHemToSign(hem, pos) {
    const h = String(hem || '').toUpperCase();
    if (h === 'S' || h === 'W') return -Math.abs(pos);
    return Math.abs(pos);
  }

  function mapVesselsDmsToDecimal(deg, min, sec, hem) {
    const d = Number(deg) || 0;
    const m = Number(min) || 0;
    const s = sec != null && sec !== '' ? Number(sec) : 0;
    const dec = d + m / 60 + s / 3600;
    return mapVesselsHemToSign(hem, dec);
  }

  /** DMS chunk: 34°52'32" W — optional seconds and straight/curly quotes. */
  const MAP_VESSELS_DMS_CHUNK =
    '(\\d+)\\s*[°º]\\s*(\\d+)\\s*[\'′]\\s*(\\d+(?:\\.\\d+)?)?\\s*[""″]?\\s*([NSEW])';

  function mapVesselsTrimPositionTail(raw) {
    let s = String(raw ?? '').trim();
    const nearIdx = s.search(/,\s*near\s+/i);
    if (nearIdx >= 0) s = s.slice(0, nearIdx).trim();
    return s;
  }

  function mapVesselsParseLastPosition(raw) {
    const s = mapVesselsTrimPositionTail(raw);
    if (!s) return null;

    const longLatFirst = s.match(
      new RegExp(
        'Long\\s+' + MAP_VESSELS_DMS_CHUNK + '\\s*,\\s*Lat\\s+' + MAP_VESSELS_DMS_CHUNK,
        'i'
      )
    );
    if (longLatFirst) {
      return {
        longitude: mapVesselsDmsToDecimal(
          longLatFirst[1],
          longLatFirst[2],
          longLatFirst[3],
          longLatFirst[4]
        ),
        latitude: mapVesselsDmsToDecimal(
          longLatFirst[5],
          longLatFirst[6],
          longLatFirst[7],
          longLatFirst[8]
        ),
      };
    }

    const latLongFirst = s.match(
      new RegExp(
        'Lat\\s+' + MAP_VESSELS_DMS_CHUNK + '\\s*,\\s*Long\\s+' + MAP_VESSELS_DMS_CHUNK,
        'i'
      )
    );
    if (latLongFirst) {
      return {
        latitude: mapVesselsDmsToDecimal(
          latLongFirst[1],
          latLongFirst[2],
          latLongFirst[3],
          latLongFirst[4]
        ),
        longitude: mapVesselsDmsToDecimal(
          latLongFirst[5],
          latLongFirst[6],
          latLongFirst[7],
          latLongFirst[8]
        ),
      };
    }

    const dmsPair = s.match(
      /(\d+)\s*[°º]\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)?\s*[""″]?\s*([NS])\s*(?:[,/]\s*|\s+)(\d+)\s*[°º]\s*(\d+)\s*['′]\s*(\d+(?:\.\d+)?)?\s*[""″]?\s*([EW])/i
    );
    if (dmsPair) {
      return {
        latitude: mapVesselsDmsToDecimal(dmsPair[1], dmsPair[2], dmsPair[3], dmsPair[4]),
        longitude: mapVesselsDmsToDecimal(dmsPair[5], dmsPair[6], dmsPair[7], dmsPair[8]),
      };
    }

    const decHem = s.match(
      /(-?\d+(?:\.\d+)?)\s*([NS])?\s*[,/]\s*(-?\d+(?:\.\d+)?)\s*([EW])?/i
    );
    if (decHem) {
      let lat = Number(decHem[1]);
      let lon = Number(decHem[3]);
      if (decHem[2]) lat = mapVesselsHemToSign(decHem[2], lat);
      if (decHem[4]) lon = mapVesselsHemToSign(decHem[4], lon);
      return { latitude: lat, longitude: lon };
    }

    const latLon = s.match(
      /(?:lat(?:itude)?[:\s]*)?(-?\d+(?:\.\d+)?)\s*(?:[,/]\s*|\s+)(?:lon(?:g(?:itude)?)?[:\s]*)?(-?\d+(?:\.\d+)?)/i
    );
    if (latLon) {
      return { latitude: Number(latLon[1]), longitude: Number(latLon[2]) };
    }

    const nums = s.match(/-?\d+(?:\.\d+)?/g);
    if (nums && nums.length >= 2) {
      const a = Number(nums[0]);
      const b = Number(nums[1]);
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { latitude: a, longitude: b };
      if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { latitude: b, longitude: a };
    }
    return null;
  }

  function mapVesselsParseIssueDate(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const iso = Date.parse(s);
    if (!Number.isNaN(iso)) return new Date(iso).toISOString();

    const dmy = s.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (dmy) {
      const dd = Number(dmy[1]);
      const mm = Number(dmy[2]) - 1;
      let yy = Number(dmy[3]);
      if (yy < 100) yy += 2000;
      const h = Number(dmy[4] || 0);
      const mi = Number(dmy[5] || 0);
      const se = Number(dmy[6] || 0);
      const d = new Date(yy, mm, dd, h, mi, se);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return null;
  }

  function mapVesselsParseMePower(raw) {
    const s = String(raw ?? '');
    const kw = s.match(/([\d.,]+)\s*kW/i);
    const mcr = s.match(/([\d.,]+)\s*%?\s*MCR/i);
    return {
      me_power_kw: kw ? mapVesselsParseNumber(kw[1]) : null,
      me_power_mcr_pct: mcr ? mapVesselsParseNumber(mcr[1]) : null,
    };
  }

  function mapVesselsDetectReportType(text) {
    const t = String(text ?? '');
    if (/Daily\s+Summary/i.test(t)) return 'Daily Summary';
    if (/Providers\s+Report/i.test(t)) return 'Providers Report';
    return null;
  }

  function mapVesselsParseReportText(text) {
    const report_type = mapVesselsDetectReportType(text);
    if (!report_type) {
      return { error: 'Could not detect report type (Daily Summary or Providers Report).' };
    }

    const vessel_name = mapVesselsGrabVesselName(text);
    if (!vessel_name) return { error: 'Missing vessel name.' };

    console.log('FULL TEXT SAMPLE:', JSON.stringify(text.slice(0, 2000)));
    const posRaw = mapVesselsGrabField(text, 'Last Position');
    console.log('RAW POSITION:', JSON.stringify(posRaw));
    const pos = mapVesselsParseLastPosition(posRaw);
    if (!pos || !Number.isFinite(pos.latitude) || !Number.isFinite(pos.longitude)) {
      return { error: `Could not parse Last Position for ${vessel_name}.` };
    }

    const issueRaw = mapVesselsGrabFieldAny(text, ['Issue Date:', 'Issue Date']);
    const issueIso = mapVesselsParseIssueDate(issueRaw);
    if (!issueIso) return { error: `Could not parse Issue Date for ${vessel_name}.` };

    const meRaw = mapVesselsGrabFieldAny(text, ['M/E Power', 'ME Power']);
    const me = mapVesselsParseMePower(meRaw);

    const row = {
      vessel_name,
      report_type,
      latitude: pos.latitude,
      longitude: pos.longitude,
      nearest_port: mapVesselsGrabField(text, 'Nearest port') || null,
      last_port: mapVesselsGrabFieldAny(text, ['Last Port', 'Last port']) || null,
      next_port: mapVesselsGrabFieldAny(text, ['Next Port', 'Next port']) || null,
      speed: mapVesselsParseNumber(mapVesselsGrabField(text, 'Speed')),
      issue_date: issueIso,
      eta: null,
      distance_over_ground: null,
      me_power_kw: null,
      me_power_mcr_pct: null,
      me_rpm: null,
      total_hfo: null,
      mean_draft: null,
    };

    if (report_type === 'Daily Summary') {
      row.eta = mapVesselsGrabField(text, 'ETA') || null;
      row.distance_over_ground = mapVesselsParseNumber(
        mapVesselsGrabFieldAny(text, ['Distance Over Ground', 'Distance over ground'])
      );
      row.me_power_kw = me.me_power_kw;
      row.me_power_mcr_pct = me.me_power_mcr_pct;
      row.me_rpm = mapVesselsParseNumber(
        mapVesselsGrabFieldAny(text, ['M/E Speed', 'ME Speed'])
      );
      row.total_hfo = mapVesselsParseNumber(
        mapVesselsGrabFieldAny(text, ['Total HFO', 'Total HFO consumption'])
      );
      row.mean_draft = mapVesselsParseNumber(
        mapVesselsGrabFieldAny(text, ['Laden - Mean Draft', 'Mean draft'])
      );
    }

    return { row };
  }

  async function mapVesselsEnsurePdfJs() {
    if (mapVesselsPdfReady && typeof pdfjsLib !== 'undefined') return true;
    if (typeof pdfjsLib === 'undefined') return false;
    const ver = pdfjsLib.version || '3.11.174';
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${ver}/pdf.worker.min.js`;
    mapVesselsPdfReady = true;
    return true;
  }

  function mapVesselsItemX(item) {
    return item?.transform?.[4] ?? 0;
  }

  function mapVesselsItemEndX(item) {
    return mapVesselsItemX(item) + (item?.width ?? 0);
  }

  /** Join PDF.js text items without breaking DMS coordinates across spurious spaces. */
  function mapVesselsJoinPageTextItems(items) {
    if (!items?.length) return '';
    let out = '';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str = item?.str ?? '';
      if (!str) continue;
      if (out) {
        const prev = items[i - 1];
        if (prev?.hasEOL) {
          out += '\n';
        } else {
          const gap = mapVesselsItemX(item) - mapVesselsItemEndX(prev);
          const threshold = Math.max(
            3,
            ((prev?.width ?? 0) + (item?.width ?? 0)) * 0.2,
            String(prev?.str ?? '').length * 1.1
          );
          if (gap > threshold) out += ' ';
        }
      }
      out += str;
    }
    return out;
  }

  async function mapVesselsExtractPdfText(file) {
    const ok = await mapVesselsEnsurePdfJs();
    if (!ok) throw new Error('PDF library did not load.');
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      parts.push(mapVesselsJoinPageTextItems(content.items));
    }
    return parts.join('\n');
  }

  function mapVesselsIssueMs(row) {
    const t = row?.issue_date;
    if (!t) return null;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function mapVesselsIsStale(row, nowMs) {
    const ms = mapVesselsIssueMs(row);
    if (ms == null) return true;
    return nowMs - ms > MAP_VESSELS_STALE_MS;
  }

  function mapVesselsFormatAgo(ms) {
    if (!Number.isFinite(ms)) return '—';
    const diff = Math.max(0, Date.now() - ms);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function mapVesselsFormatAgoFromMs(diffMs) {
    const hours = Math.floor(diffMs / 3600000);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} old`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} old`;
  }

  function mapVesselsFmtCoord(lat, lon) {
    const la = Number(lat).toFixed(5);
    const lo = Number(lon).toFixed(5);
    return `${la}, ${lo}`;
  }

  function mapVesselsFmtDate(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(iso ?? '—');
    }
  }

  function mapVesselsReportLabel(reportType) {
    return reportType === 'Daily Summary'
      ? 'Daily Summary'
      : 'Providers Report — limited data';
  }

  function mapVesselsPopupHtml(row, stale) {
    const issueMs = mapVesselsIssueMs(row);
    const ago = mapVesselsFormatAgo(issueMs);
    const staleWarn = stale
      ? `<div class="map-vessel-popup__warn">Data is ${mapVesselsFormatAgoFromMs(Date.now() - issueMs)}</div>`
      : '';

    let extra = '';
    if (row.report_type === 'Daily Summary') {
      extra = `
        <dt>ETA</dt><dd>${row.eta || '—'}</dd>
        <dt>Distance over ground</dt><dd>${row.distance_over_ground ?? '—'}</dd>
        <dt>ME power</dt><dd>${row.me_power_kw != null ? row.me_power_kw + ' kW' : '—'}${row.me_power_mcr_pct != null ? ` (${row.me_power_mcr_pct}% MCR)` : ''}</dd>
        <dt>ME speed</dt><dd>${row.me_rpm != null ? row.me_rpm + ' RPM' : '—'}</dd>
        <dt>Total HFO</dt><dd>${row.total_hfo != null ? row.total_hfo + ' tn' : '—'}</dd>
        <dt>Mean draft</dt><dd>${row.mean_draft ?? '—'}</dd>`;
    }

    return `
      <div class="map-vessel-popup">
        <div class="map-vessel-popup__title">${row.vessel_name}</div>
        <div class="map-vessel-popup__type">${mapVesselsReportLabel(row.report_type)}</div>
        <dl>
          <dt>Position</dt><dd>${mapVesselsFmtCoord(row.latitude, row.longitude)}</dd>
          <dt>Nearest port</dt><dd>${row.nearest_port || '—'}</dd>
          <dt>Last port</dt><dd>${row.last_port || '—'}</dd>
          <dt>Next port</dt><dd>${row.next_port || '—'}</dd>
          <dt>Speed</dt><dd>${row.speed != null ? row.speed : '—'}</dd>
          <dt>Issue date</dt><dd>${mapVesselsFmtDate(row.issue_date)} (${ago})</dd>
          ${extra}
        </dl>
        ${staleWarn}
      </div>`;
  }

  function mapVesselsGetMap() {
    return typeof arctiumMap !== 'undefined' ? arctiumMap : null;
  }

  function mapVesselsEnsureLayer() {
    const map = mapVesselsGetMap();
    if (!map || typeof L === 'undefined') return null;
    if (!mapVesselsLayerGroup) {
      mapVesselsLayerGroup = L.layerGroup().addTo(map);
    }
    return mapVesselsLayerGroup;
  }

  function mapVesselsMarkerHtml(row, stale, theme, index) {
    const i = Number(index) || 0;
    const above = i % 2 === 0;
    const posClass = above
      ? 'map-vessel-marker__label--above'
      : 'map-vessel-marker__label--below';
    const themeClass =
      theme === 'light' ? '' : ' map-vessel-marker__label--dark';
    const labelClass = `map-vessel-marker__label ${posClass}${themeClass}`;
    const staleCls = stale ? ' map-vessel-marker--stale' : '';
    const name = row.vessel_name.replace(/</g, '&lt;');
    const label = `<span class="${labelClass.trim()}">${name}</span>`;
    const dot = '<span class="map-vessel-marker__dot"></span>';
    return `<div class="map-vessel-marker${staleCls}" data-vessel="${name}">
      ${above ? `${label}${dot}` : `${dot}${label}`}
    </div>`;
  }

  function mapVesselsMarkerIconOptions(index) {
    return {
      className: 'map-vessel-divicon',
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    };
  }

  function mapVesselsRenderMarkers() {
    const layer = mapVesselsEnsureLayer();
    if (!layer) return;
    layer.clearLayers();
    const theme = typeof getMapTheme === 'function' ? getMapTheme() : 'dark';
    const now = Date.now();

    let idx = 0;
    for (const row of mapVesselsRecords) {
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const stale = mapVesselsIsStale(row, now);
      const icon = L.divIcon({
        ...mapVesselsMarkerIconOptions(idx),
        html: mapVesselsMarkerHtml(row, stale, theme, idx),
      });
      const marker = L.marker([lat, lon], { icon });
      marker._mapVesselRow = row;
      marker._mapVesselIndex = idx;
      idx += 1;
      marker.bindPopup(mapVesselsPopupHtml(row, stale), {
        className: 'map-vessel-leaflet-popup',
        maxWidth: 340,
      });
      layer.addLayer(marker);
    }
  }

  function mapVesselsUpdateStaleStyles() {
    const now = Date.now();
    const theme = typeof getMapTheme === 'function' ? getMapTheme() : 'dark';
    if (!mapVesselsLayerGroup) return;
    mapVesselsLayerGroup.eachLayer(marker => {
      const row = marker._mapVesselRow;
      if (!row) return;
      const stale = mapVesselsIsStale(row, now);
      const idx = marker._mapVesselIndex ?? 0;
      const icon = L.divIcon({
        ...mapVesselsMarkerIconOptions(idx),
        html: mapVesselsMarkerHtml(row, stale, theme, idx),
      });
      marker.setIcon(icon);
      marker.setPopupContent(mapVesselsPopupHtml(row, stale));
    });
  }

  async function mapVesselsLoadAll() {
    if (!window.currentUser) {
      mapVesselsRecords = [];
      mapVesselsRenderMarkers();
      return;
    }
    const { data, error } = await window.sb
      .from('map_vessels')
      .select('*')
      .order('vessel_name');
    if (error) {
      console.warn('map_vessels load:', error.message);
      return;
    }
    mapVesselsRecords = Array.isArray(data) ? data : [];
    mapVesselsRenderMarkers();
  }

  function mapVesselsFindExisting(vesselName) {
    const key = mapVesselsNormName(vesselName).toLowerCase();
    return mapVesselsRecords.find(
      r => mapVesselsNormName(r.vessel_name).toLowerCase() === key
    );
  }

  function mapVesselsShouldUpsert(incoming, existing) {
    if (!existing) return true;
    const inMs = mapVesselsIssueMs(incoming);
    const exMs = mapVesselsIssueMs(existing);
    if (inMs == null) return false;
    if (exMs == null) return true;
    return inMs > exMs;
  }

  function mapVesselsUploadSetStatus(msg, isErr) {
    const el = document.getElementById('mapVesselsUploadStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('map-vessels-upload-status--err', !!isErr);
    el.hidden = !msg;
  }

  function mapVesselsUploadAddSkip(msg) {
    const list = document.getElementById('mapVesselsUploadSkips');
    if (!list) return;
    const li = document.createElement('li');
    li.textContent = msg;
    list.appendChild(li);
    list.hidden = false;
  }

  function mapVesselsOpenUploadModal() {
    if (!window.currentUser) {
      alert('Sign in to upload vessel reports.');
      return;
    }
    const overlay = document.getElementById('mapVesselsUploadOverlay');
    if (!overlay) return;
    const list = document.getElementById('mapVesselsUploadSkips');
    if (list) {
      list.innerHTML = '';
      list.hidden = true;
    }
    mapVesselsUploadSetStatus('', false);
    const inp = document.getElementById('mapVesselsFileInput');
    if (inp) inp.value = '';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
  }

  function mapVesselsCloseUploadModal() {
    const overlay = document.getElementById('mapVesselsUploadOverlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function mapVesselsProcessFiles(fileList) {
    if (!window.currentUser) return;
    const files = [...fileList].filter(f => f && /\.pdf$/i.test(f.name));
    if (!files.length) {
      mapVesselsUploadSetStatus('Select one or more PDF files.', true);
      return;
    }

    mapVesselsUploadSetStatus('Reading PDFs…', false);
    const btn = document.getElementById('mapVesselsUploadSubmit');
    if (btn) btn.disabled = true;

    const toSave = [];
    const errors = [];

    try {
      for (const file of files) {
        let text;
        try {
          text = await mapVesselsExtractPdfText(file);
        } catch (e) {
          errors.push(`${file.name}: ${e.message || 'read failed'}`);
          continue;
        }
        const parsed = mapVesselsParseReportText(text);
        if (parsed.error) {
          errors.push(`${file.name}: ${parsed.error}`);
          continue;
        }
        const row = { ...parsed.row, uploaded_at: new Date().toISOString() };
        const existing = mapVesselsFindExisting(row.vessel_name);
        if (!mapVesselsShouldUpsert(row, existing)) {
          mapVesselsUploadAddSkip(
            `Skipped ${row.vessel_name} — uploaded data is not newer than existing record.`
          );
          continue;
        }
        toSave.push(row);
      }

      if (toSave.length) {
        mapVesselsUploadSetStatus(`Saving ${toSave.length} vessel(s)…`, false);
        const { error } = await window.sb
          .from('map_vessels')
          .upsert(toSave, { onConflict: 'vessel_name' });
        if (error) {
          mapVesselsUploadSetStatus(error.message || 'Save failed.', true);
          return;
        }
        for (const row of toSave) {
          const key = mapVesselsNormName(row.vessel_name).toLowerCase();
          const idx = mapVesselsRecords.findIndex(
            r => mapVesselsNormName(r.vessel_name).toLowerCase() === key
          );
          if (idx >= 0) mapVesselsRecords[idx] = row;
          else mapVesselsRecords.push(row);
        }
        mapVesselsRecords.sort((a, b) =>
          mapVesselsNormName(a.vessel_name).localeCompare(mapVesselsNormName(b.vessel_name))
        );
        mapVesselsRenderMarkers();
      }

      let msg = '';
      if (toSave.length) msg += `Saved ${toSave.length} vessel(s). `;
      if (errors.length) msg += errors.join(' ');
      mapVesselsUploadSetStatus(msg.trim() || 'No vessels saved.', !!errors.length && !toSave.length);
      if (toSave.length && !errors.length) {
        setTimeout(mapVesselsCloseUploadModal, 1200);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function mapVesselsStartStaleTimer() {
    mapVesselsStopStaleTimer();
    mapVesselsStaleTimer = setInterval(() => {
      mapVesselsUpdateStaleStyles();
    }, MAP_VESSELS_STALE_TICK_MS);
  }

  function mapVesselsStopStaleTimer() {
    if (mapVesselsStaleTimer) {
      clearInterval(mapVesselsStaleTimer);
      mapVesselsStaleTimer = null;
    }
  }

  function mapVesselsBindUi() {
    if (mapVesselsUiBound) return;
    mapVesselsUiBound = true;

    document.getElementById('mapVesselsUploadBtn')?.addEventListener('click', mapVesselsOpenUploadModal);
    document.getElementById('mapVesselsUploadClose')?.addEventListener('click', mapVesselsCloseUploadModal);
    document.getElementById('mapVesselsUploadCancel')?.addEventListener('click', mapVesselsCloseUploadModal);
    document.getElementById('mapVesselsUploadOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'mapVesselsUploadOverlay') mapVesselsCloseUploadModal();
    });

    const inp = document.getElementById('mapVesselsFileInput');
    document.getElementById('mapVesselsUploadPick')?.addEventListener('click', () => inp?.click());
    inp?.addEventListener('change', () => {
      const n = inp.files?.length || 0;
      const hint = document.getElementById('mapVesselsFileHint');
      if (hint) hint.textContent = n ? `${n} file(s) selected` : 'No files selected';
    });

    document.getElementById('mapVesselsUploadSubmit')?.addEventListener('click', async () => {
      const files = inp?.files;
      if (!files?.length) {
        mapVesselsUploadSetStatus('Choose at least one PDF.', true);
        return;
      }
      await mapVesselsProcessFiles(files);
    });

    document.addEventListener('keydown', e => {
      const overlay = document.getElementById('mapVesselsUploadOverlay');
      if (e.key === 'Escape' && overlay && !overlay.hidden) mapVesselsCloseUploadModal();
    });
  }

  function mapVesselsOnThemeChange() {
    mapVesselsUpdateStaleStyles();
  }

  function mapVesselsInit() {
    mapVesselsBindUi();
    if (!mapVesselsInited) {
      mapVesselsStartStaleTimer();
      mapVesselsInited = true;
    }
    void mapVesselsLoadAll();
  }

  function mapVesselsTeardown() {
    mapVesselsInited = false;
    mapVesselsStopStaleTimer();
    mapVesselsRecords = [];
    if (mapVesselsLayerGroup) {
      mapVesselsLayerGroup.clearLayers();
    }
    mapVesselsCloseUploadModal();
  }

  function mapVesselsOnMapTabActive() {
    mapVesselsEnsureLayer();
    mapVesselsRenderMarkers();
    resizeArctiumMap?.();
  }

  window.mapVesselsInit = mapVesselsInit;
  window.mapVesselsTeardown = mapVesselsTeardown;
  window.mapVesselsOnMapTabActive = mapVesselsOnMapTabActive;
  window.mapVesselsOnThemeChange = mapVesselsOnThemeChange;
  window.mapVesselsLoadAll = mapVesselsLoadAll;
})();
