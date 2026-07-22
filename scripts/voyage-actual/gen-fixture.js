/* Build the at-sea-stems fixture from demoVoyage. Two stems on purpose:
   1. VLSFO 100 MT mid-passage on leg 2  -> must land in the SEA window
   2. LSMGO  50 MT stamped exactly on leg 1's arrival -> must land in the PORT stay (boundary rule)
*/
const fs = require('fs');
const XLSX = require('xlsx');
global.XLSX = XLSX;
const VR = require('./export-core.gen.js');

const V = VR.demoVoyage();
V.voyNo = 190;
V.stems = [
  { date: '2026-02-15T12:30', port: 'Tampico', supplier: 'Boundary Test', grade: 'LSMGO', qty: 50, price: 700 },
  { date: '2026-02-21T08:00', port: 'At sea (STS)', supplier: 'Mid-passage', grade: 'VLSFO', qty: 100, price: 600 }
];
fs.writeFileSync('fixture-atsea.json', JSON.stringify(V, null, 2));
console.log('fixture written: voy', V.voyNo, '| stems:', V.stems.length);
