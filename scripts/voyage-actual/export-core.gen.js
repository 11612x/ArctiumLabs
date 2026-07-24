/* Voyage Actual — Excel export core. Works in browser (global XLSX) and node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VRExport = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  var GRADES = ['VLSFO', 'LSMGO', 'HFO', 'ULSD', 'Bio', 'UREA'];

  function robGet(L, side, g){
    var bag = side==='dep' ? L.robDep : L.robArr;
    if(bag && bag[g]!==undefined && bag[g]!==null && bag[g]!=='') return bag[g];
    /* legacy flat keys from earlier builds */
    if(g==='VLSFO'){ var k=side==='dep'?'robDepV':'robArrV'; if(L[k]!==undefined&&L[k]!==null&&L[k]!=='') return L[k]; }
    if(g==='LSMGO'){ var k2=side==='dep'?'robDepL':'robArrL'; if(L[k2]!==undefined&&L[k2]!==null&&L[k2]!=='') return L[k2]; }
    return '';
  }
  function gradesInUse(V){
    var set={}, g;
    Object.keys(V.opening||{}).forEach(function(x){ set[x]=1; });
    (V.stems||[]).forEach(function(s){ if(s.grade) set[s.grade]=1; });
    (V.legs||[]).forEach(function(L){
      ['robDep','robArr'].forEach(function(side){
        Object.keys(L[side]||{}).forEach(function(x){ if(L[side][x]!==''&&L[side][x]!=null) set[x]=1; });
      });
      if(L.robDepV!==''&&L.robDepV!=null) set.VLSFO=1;
      if(L.robArrV!==''&&L.robArrV!=null) set.VLSFO=1;
      if(L.robDepL!==''&&L.robDepL!=null) set.LSMGO=1;
      if(L.robArrL!==''&&L.robArrL!=null) set.LSMGO=1;
    });
    var out = GRADES.filter(function(x){ return set[x]; });
    Object.keys(set).forEach(function(x){ if(GRADES.indexOf(x)<0) out.push(x); });
    return out.length ? out : ['VLSFO','LSMGO'];
  }
  function migrateVoyage(V){
    if(!V||typeof V!=='object') return V;
    if(!V.opening) V.opening={};
    (V.legs||[]).forEach(function(L){
      if(!L.robDep) L.robDep={};
      if(!L.robArr) L.robArr={};
      if('robDepV' in L){ if(L.robDepV!==''&&L.robDepV!=null&&L.robDep.VLSFO===undefined) L.robDep.VLSFO=L.robDepV; delete L.robDepV; }
      if('robDepL' in L){ if(L.robDepL!==''&&L.robDepL!=null&&L.robDep.LSMGO===undefined) L.robDep.LSMGO=L.robDepL; delete L.robDepL; }
      if('robArrV' in L){ if(L.robArrV!==''&&L.robArrV!=null&&L.robArr.VLSFO===undefined) L.robArr.VLSFO=L.robArrV; delete L.robArrV; }
      if('robArrL' in L){ if(L.robArrL!==''&&L.robArrL!=null&&L.robArr.LSMGO===undefined) L.robArr.LSMGO=L.robArrL; delete L.robArrL; }
    });
    return V;
  }

  function colL(c){ var s=''; c=c+1; while(c>0){var m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=(c-m-1)/26;} return s; }
  /* Logical col 1 = Excel A (no empty margin column). */
  function A(r,c){ return colL(c-1)+(r+1); }
  function Aa(r,c){ return '$'+colL(c-1)+'$'+(r+1); }

  function dSerial(iso){ // ISO "YYYY-MM-DDTHH:MM" -> excel serial as naive wall clock (what you typed)
    if(!iso) return null;
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if(!m) return null;
    // Pure calendar math — no Date/UTC — so Excel shows exactly the typed DD/MM/YY HH:MM
    // regardless of the machine timezone. Excel 1900 system: serial 1 = 1900-01-01;
    // day 0 of the epoch is 1899-12-30 (accounts for the Excel leap-year bug).
    var y=+m[1], mo=+m[2], d=+m[3], hh=+(m[4]||0), mm=+(m[5]||0);
    function daysSince1899_12_30(Y,M,D){
      // days from civil date to 1970-01-01, then add days from 1899-12-30 to 1970-01-01
      function civil(Y,M,D){ // Howard Hinnant algorithm → days since 1970-01-01
        Y-=(M<=2); var era=Math.floor(Y/400); var yoe=Y-era*400;
        var doy=Math.floor((153*(M+(M>2?-3:9))+2)/5)+D-1;
        var doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;
        return era*146097+doe-719468;
      }
      return civil(Y,M,D) - civil(1899,12,30);
    }
    return daysSince1899_12_30(y,mo,d) + (hh*60+mm)/1440;
  }

  function Sheet(){ this.cells={}; this.maxR=0; this.maxC=0; this.merges=[]; }
  Sheet.prototype.set=function(r,c,cell){
    this.cells[A(r,c)]=cell;
    if(r>this.maxR)this.maxR=r; if(c>this.maxC)this.maxC=c;
  };
  Sheet.prototype.S=function(r,c,v){ if(v===undefined||v===null||v==='')return; this.set(r,c,{t:'s',v:String(v)}); };
  /* Labels / titles / column headers — bold, not user-entered values */
  Sheet.prototype.L=function(r,c,v){ if(v===undefined||v===null||v==='')return; this.set(r,c,{t:'s',v:String(v),s:{font:{bold:true}}}); };
  Sheet.prototype.N=function(r,c,v,z){ if(v===undefined||v===null||v==='')return; var cell={t:'n',v:+v}; if(z)cell.z=z; this.set(r,c,cell); };
  Sheet.prototype.D=function(r,c,iso,z){ var s=dSerial(iso); if(s===null)return; this.set(r,c,{t:'n',v:s,z:z||'dd/mm/yy hh:mm'}); };
  Sheet.prototype.F=function(r,c,f,z){ var cell={t:'n',f:f}; if(z)cell.z=z; this.set(r,c,cell); };
  /* Merge style onto a cell (creates an empty cell if needed so fills cover the whole box). */
  Sheet.prototype.style=function(r,c, patch){
    var addr=A(r,c), cell=this.cells[addr];
    if(!cell){ cell={t:'s',v:''}; }
    var prev=cell.s||{}, font=Object.assign({}, prev.font||{}, patch.font||{});
    cell.s=Object.assign({}, prev, patch, {font:font});
    this.set(r,c,cell);
  };
  Sheet.prototype.done=function(){
    var out={}; for(var k in this.cells) out[k]=this.cells[k];
    out['!ref']='A1:'+A(this.maxR,this.maxC);
    if(this.merges.length) out['!merges']=this.merges;
    return out;
  };

  var MONEY='"$"#,##0.00', MT='#,##0.00', PX='"$"#,##0.00', D3='0.000', KN='0.00', DT='dd/mm/yy hh:mm';

  function layersFor(V, g){
    var out=[];
    (V.opening[g]||[]).forEach(function(L){ if(+L.qty>0) out.push({src:(L.label||'Opening ROB'), date:V.legs.length?V.legs[0].dep:'', qty:+L.qty, price:+L.price||0}); });
    V.stems.filter(function(s){return s.grade===g && +s.qty>0;})
      .sort(function(a,b){ return (a.date||'').localeCompare(b.date||''); })
      .forEach(function(s){ out.push({src:'Stem — '+(s.port||'')+(s.supplier?(' / '+s.supplier):''), date:s.date||'', qty:+s.qty, price:+s.price||0}); });
    return out;
  }

  function buildWorkbook(V){
    V = migrateVoyage(JSON.parse(JSON.stringify(V)));
    var ws=new Sheet(), r=0;
    var legs=V.legs||[], nL=legs.length;
    var grades=gradesInUse(V), nG=grades.length;

    ws.L(0,1,'Vessel:');        ws.S(0,2,V.vessel);
    ws.L(0,4,'Voyage No:');     ws.N(0,5,V.voyNo);
    ws.L(0,7,'Charterer:');     ws.S(0,8,V.charterer);
    ws.L(0,10,'CP Date:');      ws.D(0,11,V.cpDate,'dd/mm/yy');
    ws.L(1,1,'Dem. Rate ($/d):'); ws.N(1,2,V.demRate,MONEY);
    ws.L(1,4,'Laytime (hrs):');   ws.N(1,5,V.laytime,'0.00');
    ws.L(1,7,'Estimation No:');   ws.S(1,8,V.estNo);
    ws.L(1,10,'Estimated TCE:');  ws.N(1,11,V.estTce,MONEY);

    ws.L(3,1,'SUMMARY');
    var sumTop=4, sumRows=9+nG;            // reserved, filled at the end
    r = sumTop + sumRows + 2;              // +2 leaves one blank row before legs


    /* ---- VOYAGE LEGS ---- */
    ws.L(r,1,'VOYAGE LEGS'); r++;
    var H=['Dep. Port','Dep. Date & Time','Arr. Port','Arr. Date & Time','Miles','Duration (d)','Speed (kn)','Condition'];
    grades.forEach(function(g){ H.push('ROB Dep '+g); });
    grades.forEach(function(g){ H.push('ROB Arr '+g); });
    grades.forEach(function(g){ H.push('Stems at Sea '+g); });
    grades.forEach(function(g){ H.push('Sea Cons '+g); });
    H.forEach(function(h,i){ ws.L(r,1+i,h); });
    var legHdr=r; r++;
    var legStart=r;
    var robDep0=9, robArr0=9+nG, stemSea0=9+2*nG, seaCons0=9+3*nG;
    legs.forEach(function(L){
      ws.S(r,1,L.depPort); ws.D(r,2,L.dep,DT); ws.S(r,3,L.arrPort); ws.D(r,4,L.arr,DT);
      ws.N(r,5,L.miles,'#,##0');
      ws.F(r,6,'IFERROR('+A(r,4)+'-'+A(r,2)+',"")',D3);
      ws.F(r,7,'IFERROR('+A(r,5)+'/('+A(r,6)+'*24),"")',KN);
      ws.S(r,8,L.cond);
      grades.forEach(function(g,gi){
        ws.N(r, robDep0+gi, robGet(L,'dep',g), MT);
        ws.N(r, robArr0+gi, robGet(L,'arr',g), MT);
      });
      r++;
    });
    var legEnd=r-1;
    ws.L(r,1,'Totals:');
    ws.F(r,5,'SUM('+A(legStart,5)+':'+A(legEnd,5)+')','#,##0');
    ws.F(r,6,'SUM('+A(legStart,6)+':'+A(legEnd,6)+')',D3);
    ws.F(r,7,'IFERROR('+A(r,5)+'/('+A(r,6)+'*24),"")',KN);
    var legTot=r; r+=2;

    /* ---- STEMS ---- */
    ws.L(r,1,'BUNKER STEMS (delivered this voyage)'); r++;
    ['Date','Port','Supplier','Grade','Qty (MT)','Price ($/MT)','Total ($)'].forEach(function(h,i){ ws.L(r,1+i,h); });
    r++;
    var stemStart=r;
    var stems=(V.stems||[]).slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
    if(!stems.length) stems=[{}];
    stems.forEach(function(s){
      ws.D(r,1,s.date,'dd/mm/yy hh:mm'); ws.S(r,2,s.port); ws.S(r,3,s.supplier); ws.S(r,4,s.grade);
      ws.N(r,5,s.qty,MT); ws.N(r,6,s.price,PX);
      ws.F(r,7,'IFERROR('+A(r,5)+'*'+A(r,6)+',"")',MONEY);
      r++;
    });
    var stemEnd=r-1;
    ws.L(r,1,'Total:'); ws.F(r,5,'SUM('+A(stemStart,5)+':'+A(stemEnd,5)+')',MT);
    ws.F(r,7,'SUM('+A(stemStart,7)+':'+A(stemEnd,7)+')',MONEY);
    r+=2;

    /* ---- STEMS AT SEA (deferred leg cols) — sea window (dep, arr) strict ---- */
    var sdR='$A$'+(stemStart+1)+':$A$'+(stemEnd+1), sgR='$D$'+(stemStart+1)+':$D$'+(stemEnd+1), sqR='$E$'+(stemStart+1)+':$E$'+(stemEnd+1);
    legs.forEach(function(L,i){
      var lr = legStart+i;
      grades.forEach(function(g,gi){
        ws.F(lr, stemSea0+gi, 'SUMIFS('+sqR+','+sgR+',"'+g+'",'+sdR+',">"&'+A(lr,2)+','+sdR+',"<"&'+A(lr,4)+')',MT);
        ws.F(lr, seaCons0+gi, A(lr,robDep0+gi)+'+'+A(lr,stemSea0+gi)+'-'+A(lr,robArr0+gi),MT);
      });
    });
    if(nL){
      grades.forEach(function(g,gi){
        ws.F(legTot, stemSea0+gi, 'SUM('+A(legStart,stemSea0+gi)+':'+A(legEnd,stemSea0+gi)+')',MT);
        ws.F(legTot, seaCons0+gi, 'SUM('+A(legStart,seaCons0+gi)+':'+A(legEnd,seaCons0+gi)+')',MT);
      });
    }

    /* ---- PORT STAYS ---- */
    ws.L(r,1,'PORT STAYS & PORT CONSUMPTION'); r++;
    var psH=['Port','Arrived','Departed','Stay (d)'];
    grades.forEach(function(g){ psH.push('Stems '+g); });
    grades.forEach(function(g){ psH.push('Port Cons '+g); });
    psH.forEach(function(h,i){ ws.L(r,1+i,h); });
    r++;
    var psStart=r;
    var psStem0=5, psCons0=5+nG;
    for(var i=0;i<nL-1;i++){
      var la=legStart+i, ln=legStart+i+1;
      ws.S(r,1,legs[i].arrPort);
      ws.F(r,2,A(la,4),DT); ws.F(r,3,A(ln,2),DT);
      ws.F(r,4,A(r,3)+'-'+A(r,2),D3);
      var dR='$A$'+(stemStart+1)+':$A$'+(stemEnd+1), gR='$D$'+(stemStart+1)+':$D$'+(stemEnd+1), qR='$E$'+(stemStart+1)+':$E$'+(stemEnd+1);
      grades.forEach(function(g,gi){
        ws.F(r, psStem0+gi, 'SUMIFS('+qR+','+gR+',"'+g+'",'+dR+',">="&'+A(r,2)+','+dR+',"<="&'+A(r,3)+')',MT);
        ws.F(r, psCons0+gi, A(la,robArr0+gi)+'+'+A(r,psStem0+gi)+'-'+A(ln,robDep0+gi),MT);
      });
      r++;
    }
    var psEnd=r-1, hasPS=nL>1;
    ws.L(r,1,'Totals:');
    if(hasPS){
      ws.F(r,4,'SUM('+A(psStart,4)+':'+A(psEnd,4)+')',D3);
      grades.forEach(function(g,gi){
        ws.F(r, psCons0+gi, 'SUM('+A(psStart,psCons0+gi)+':'+A(psEnd,psCons0+gi)+')',MT);
      });
    }
    r+=2;

    /* ---- FIFO per grade ---- */
    var fifoRef={};
    grades.forEach(function(g,gi){
      ws.L(r,1,g+' — FIFO VALUATION'); r++;
      var closingRef = nL ? A(legEnd, robArr0+gi) : null;
      ws.L(r,1,'Closing ROB (MT):');
      if(closingRef) ws.F(r,2,closingRef,MT); else ws.N(r,2,0,MT);
      ws.L(r,4,'Total consumption (MT):');
      var closCell=A(r,2), consCell=A(r,5), consRow=r;
      r++;
      ['Source','Date','Qty (MT)','Price ($/MT)','Consumed (MT)','Consumed ($)','Remaining (MT)','Remaining ($)'].forEach(function(h,i){ ws.L(r,1+i,h); });
      var hdr=r; r++;
      var Ls=layersFor(V,g); if(!Ls.length) Ls=[{src:'(no layers)',qty:0,price:0}];
      var ls=r;
      Ls.forEach(function(L){
        ws.S(r,1,L.src); ws.D(r,2,L.date,'dd/mm/yy');
        ws.N(r,3,L.qty,MT); ws.N(r,4,L.price,PX);
        ws.F(r,5,'MAX(0,MIN('+A(r,3)+','+Aa(consRow,5)+'-SUM('+Aa(hdr,3)+':'+A(r-1,3)+')))',MT);
        ws.F(r,6,A(r,5)+'*'+A(r,4),MONEY);
        ws.F(r,7,A(r,3)+'-'+A(r,5),MT);
        ws.F(r,8,A(r,7)+'*'+A(r,4),MONEY);
        r++;
      });
      var le=r-1;
      ws.F(consRow,5,'SUM('+A(ls,3)+':'+A(le,3)+')-'+closCell,MT);
      ws.L(r,1,'Totals:');
      ws.F(r,3,'SUM('+A(ls,3)+':'+A(le,3)+')',MT);
      ws.F(r,5,'SUM('+A(ls,5)+':'+A(le,5)+')',MT);
      ws.F(r,6,'SUM('+A(ls,6)+':'+A(le,6)+')',MONEY);
      ws.F(r,7,'SUM('+A(ls,7)+':'+A(le,7)+')',MT);
      ws.F(r,8,'SUM('+A(ls,8)+':'+A(le,8)+')',MONEY);
      fifoRef[g]={cost:A(r,6), closVal:A(r,8), consumed:A(r,5), consTot:consCell};
      var tot=r; r++;
      ws.L(r,1,'Avg $/MT consumed:'); ws.F(r,2,'IFERROR('+A(tot,6)+'/'+A(tot,5)+',"")',PX);
      ws.L(r,4,'Unallocated (data gap, MT):'); ws.F(r,5,consCell+'-'+A(tot,5),MT);
      r+=2;
    });

    /* ---- REVENUE ---- */
    ws.L(r,1,'REVENUE & COMMISSIONS'); r++;
    ws.L(r,1,'Freight:'); ws.N(r,2,V.freight,MONEY); ws.L(r,3,'Comm %:'); ws.N(r,4,V.freightComm,'0.00'); ws.L(r,5,'Commission:'); ws.F(r,6,A(r,2)+'*'+A(r,4)+'/100',MONEY);
    var fr=r; r++;
    ws.L(r,1,'Demurrage:'); ws.N(r,2,V.demurrage,MONEY); ws.L(r,3,'Comm %:'); ws.N(r,4,V.demComm,'0.00'); ws.L(r,5,'Commission:'); ws.F(r,6,A(r,2)+'*'+A(r,4)+'/100',MONEY);
    var dr=r; r++;
    var orv=(V.otherRev||[]).filter(function(x){return x.label||x.amount;});
    if(!orv.length) orv=[{label:'',amount:''}];
    var orS=r;
    orv.forEach(function(x){ if(x.label) ws.S(r,1,x.label); else ws.L(r,1,'Other revenue:'); ws.N(r,2,x.amount,MONEY); r++; });
    var orE=r-1;
    ws.L(r,1,'Total revenue:');
    ws.F(r,2,A(fr,2)+'+'+A(dr,2)+'+SUM('+A(orS,2)+':'+A(orE,2)+')',MONEY);
    var revTot=r; r++;
    ws.L(r,1,'Total commissions:'); ws.F(r,2,A(fr,6)+'+'+A(dr,6),MONEY);
    var commTot=r; r+=2;

    /* ---- PORT COSTS ---- */
    ws.L(r,1,'PORT CALL EXPENSES'); r++;
    ['Port','DA Reason','DA ($)','Other Reason','Other ($)','Total ($)'].forEach(function(h,i){ ws.L(r,1+i,h); });
    r++;
    var pc=(V.portCosts||[]).filter(function(x){return x.port||x.da||x.other;});
    if(!pc.length) pc=[{}];
    var pcS=r;
    pc.forEach(function(x){
      ws.S(r,1,x.port); ws.S(r,2,x.daReason); ws.N(r,3,x.da,MONEY);
      ws.S(r,4,x.otherReason); ws.N(r,5,x.other,MONEY);
      ws.F(r,6,'SUM('+A(r,3)+','+A(r,5)+')',MONEY); r++;
    });
    var pcE=r-1;
    ws.L(r,1,'Total:'); ws.F(r,6,'SUM('+A(pcS,6)+':'+A(pcE,6)+')',MONEY);
    var pcTot=r; r+=2;

    /* ---- OTHER COSTS ---- */
    ws.L(r,1,'OTHER COSTS'); r++;
    var oc=(V.otherCosts||[]).filter(function(x){return x.label||x.amount;});
    if(!oc.length) oc=[{label:'',amount:''}];
    var ocS=r;
    oc.forEach(function(x){ if(x.label) ws.S(r,1,x.label); else ws.L(r,1,'Other cost:'); ws.N(r,2,x.amount,MONEY); r++; });
    var ocE=r-1;
    ws.L(r,1,'Total:'); ws.F(r,2,'SUM('+A(ocS,2)+':'+A(ocE,2)+')',MONEY);
    var ocTot=r; r+=2;

    /* ---- fill SUMMARY ---- */
    var bunkCostParts = grades.map(function(g){ return fifoRef[g].cost; });
    var closValParts = grades.map(function(g){ return fifoRef[g].closVal; });
    var bunkSum = bunkCostParts.join('+') || '0';
    var closSum = closValParts.join('+') || '0';
    var s=sumTop;
    var firstDep=nL?A(legStart,2):null, lastArr=nL?A(legEnd,4):null;
    ws.L(s,1,'Days at sea:');   ws.F(s,2,A(legTot,6),D3);
    ws.L(s,4,'Total revenue:'); ws.F(s,5,A(revTot,2),MONEY); s++;
    ws.L(s,1,'Days in port:');  if(nL){ws.F(s,2,lastArr+'-'+firstDep+'-'+A(legTot,6),D3);}
    ws.L(s,4,'Total costs:');   ws.F(s,5,A(commTot,2)+'+'+bunkSum+'+'+A(pcTot,6)+'+'+A(ocTot,2),MONEY);
    var costsCell=A(s,5); s++;
    ws.L(s,1,'Total duration (d):'); if(nL){ws.F(s,2,lastArr+'-'+firstDep,D3);} var durCell=A(s,2);
    ws.L(s,4,'Net profit:');    ws.F(s,5,A(revTot,2)+'-'+costsCell,MONEY); var netCell=A(s,5); s++;
    ws.L(s,1,'Total miles:');   ws.F(s,2,A(legTot,5),'#,##0');
    ws.L(s,4,'Actual TCE ($/d):'); ws.F(s,5,'IFERROR('+netCell+'/'+durCell+',"")',MONEY); var tceCell=A(s,5); s++;
    ws.L(s,1,'Avg speed (kn):'); ws.F(s,2,A(legTot,7),KN);
    ws.L(s,4,'Estimated TCE ($/d):'); ws.F(s,5,A(1,11),MONEY); var estCell=A(s,5); s++;
    ws.L(s,1,'Commenced:'); if(nL)ws.F(s,2,firstDep,DT);
    ws.L(s,4,'TCE variation ($/d):'); ws.F(s,5,'IFERROR('+tceCell+'-'+estCell+',"")',MONEY); s++;
    ws.L(s,1,'Completed:'); if(nL)ws.F(s,2,lastArr,DT);
    ws.L(s,4,'TCE variation (%):'); ws.F(s,5,'IFERROR(('+tceCell+'-'+estCell+')/'+estCell+',"")','0.0%'); s++;
    ws.L(s,1,'Bunkers consumed (FIFO):'); ws.F(s,2,bunkSum,MONEY);
    ws.L(s,4,'Commissions:'); ws.F(s,5,A(commTot,2),MONEY); s++;
    grades.forEach(function(g,gi){
      ws.L(s,1,g+' cons (MT / $):'); ws.F(s,2,fifoRef[g].consTot,MT); ws.F(s,3,fifoRef[g].cost,MONEY);
      if(gi===0){ ws.L(s,4,'Port call expenses:'); ws.F(s,5,A(pcTot,6),MONEY); }
      else if(gi===1){ ws.L(s,4,'Other costs:'); ws.F(s,5,A(ocTot,2),MONEY); }
      else if(gi===2){ ws.L(s,4,'Closing ROB value ($):'); ws.F(s,5,closSum,MONEY); }
      s++;
    });
    if(nG<3){
      if(nG<1){ /* noop */ }
      if(nG<=1){ ws.L(s,4,'Port call expenses:'); ws.F(s,5,A(pcTot,6),MONEY); s++; }
      if(nG<=2){ ws.L(s,4,'Other costs:'); ws.F(s,5,A(ocTot,2),MONEY); s++; }
      ws.L(s,1,'Closing ROB value ($):'); ws.F(s,2,closSum,MONEY);
    }
    var sumEnd = (nG<3) ? s : (s-1);

    /* Summary box A4:E{end} — light green fill, black text */
    var green={ patternType:'solid', fgColor:{ rgb:'D9EAD3' } };
    for(var sr=3; sr<=sumEnd; sr++){
      for(var sc=1; sc<=5; sc++){
        ws.style(sr, sc, { fill:green, font:{ color:{ rgb:'000000' } } });
      }
    }
    /* D8:E10 — bold + underline (Actual / Estimated / Δ TCE) */
    for(var tr=7; tr<=9; tr++){
      for(var tc=4; tc<=5; tc++){
        ws.style(tr, tc, { font:{ bold:true, underline:true, color:{ rgb:'000000' } } });
      }
    }

    var sheet=ws.done();
    sheet['!cols']=[{wch:26},{wch:18},{wch:18},{wch:18},{wch:18},{wch:12},{wch:11},{wch:12}].concat(
      grades.map(function(){return {wch:14};}),
      grades.map(function(){return {wch:14};}),
      grades.map(function(){return {wch:15};}),
      grades.map(function(){return {wch:14};})
    );
    var wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Voyage Actual');
    /* resumable snapshot — its own sheet so Import can restore exactly */
    var meta=XLSX.utils.aoa_to_sheet([['VR_DATA_V1'],[JSON.stringify(V)]]);
    XLSX.utils.book_append_sheet(wb, meta, 'VR_DATA');
    try{ wb.Workbook={Sheets:wb.SheetNames.map(function(n){return {Hidden:n==='VR_DATA'?1:0};})}; }catch(e){}
    return wb;
  }

  function demoVoyage(){
    return migrateVoyage({
      vessel:'Alpine Link', voyNo:189, estNo:'', charterer:'PMI', cpDate:'2026-02-12',
      demRate:50000, laytime:84, estTce:42518,
      freight:1400000, freightComm:5, demurrage:19062.5, demComm:5,
      otherRev:[{label:'Tugs Claim',amount:97000},{label:'Bunker Interim',amount:197257.99}],
      legs:[
        {depPort:'Tuxpan',   dep:'2026-02-10T11:36', arrPort:'Tampico',  arr:'2026-02-15T12:30', miles:503,  cond:'Laden',
          robDep:{VLSFO:267.95,LSMGO:284.56}, robArr:{VLSFO:214.29,LSMGO:265.32}},
        {depPort:'Tampico',  dep:'2026-02-18T21:06', arrPort:'Rio Haina',arr:'2026-02-24T10:00', miles:1814, cond:'Laden',
          robDep:{VLSFO:195.87,LSMGO:265.32}, robArr:{VLSFO:53.21, LSMGO:262.98}},
        {depPort:'Rio Haina',dep:'2026-02-26T05:42', arrPort:'Houston',  arr:'2026-03-03T04:18', miles:1690, cond:'Ballast',
          robDep:{VLSFO:40.47, LSMGO:255.38}, robArr:{VLSFO:22.22, LSMGO:134.70}}
      ],
      opening:{ VLSFO:[{label:'Opening ROB', qty:267.95, price:525}], LSMGO:[{label:'Opening ROB', qty:284.56, price:712}] },
      stems:[],
      portCosts:[{port:'Tampico',daReason:'LD',da:55000},{port:'Rio Haina',daReason:'Dis',da:30000}],
      otherCosts:[]
    });
  }

  return { buildWorkbook: buildWorkbook, demoVoyage: demoVoyage, GRADES: GRADES, layersFor: layersFor, dSerial: dSerial, gradesInUse: gradesInUse, migrateVoyage: migrateVoyage, robGet: robGet };
}));
