/* Extract export-core from the HTML, build a workbook, write it out.
   Usage: node build.js <in.html> <out.xlsx> [voyage.json] */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const htmlPath = process.argv[2];
const outPath = process.argv[3];
const voyPath = process.argv[4];

const html = fs.readFileSync(htmlPath, 'utf8');
const lines = html.split('\n');

// script block 1 = the UMD export-core; find it by its marker comment
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Excel export core')) { start = i; break; }
}
if (start < 0) throw new Error('export-core marker not found');
let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i].trim() === '</script>') { end = i; break; }
}
if (end < 0) throw new Error('closing </script> not found');

const core = lines.slice(start, end).join('\n');
const corePath = path.join(__dirname, 'export-core.gen.js');
fs.writeFileSync(corePath, core);

global.XLSX = XLSX;
const VR = require(corePath);

const V = voyPath ? JSON.parse(fs.readFileSync(voyPath, 'utf8')) : VR.demoVoyage();
const wb = VR.buildWorkbook(V);
XLSX.writeFile(wb, outPath);
console.log('wrote', outPath, '| sheets:', wb.SheetNames.join(', '));

// round-trip check (§9 step 2): VR_DATA must restore V identically
const back = XLSX.readFile(outPath);
const ds = back.Sheets['VR_DATA'] || back.Sheets['_vrdata'];
if (!ds) { console.error('FAIL: no VR_DATA sheet'); process.exit(1); }
const tag = ds['A1'] && ds['A1'].v;
const restored = JSON.parse(ds['A2'].v);
const same = JSON.stringify(restored) === JSON.stringify(V);
console.log('VR_DATA tag:', tag, '| round-trip identical:', same);
if (!same) process.exit(1);
