// FreshFlow printer routing V0.9
(() => {
  const ROUTES = ['receipt','report'];
  const isAdmin = () => ['owner','admin'].includes(String(globalThis.profile?.role||'').trim().toLowerCase());
  const E = v => typeof esc === 'function' ? esc(v) : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const M = v => typeof money === 'function' ? money(v) : 'R ' + Number(v||0).toFixed(2);
  const defaults = {
    receipt:{route:'receipt',printer_name:'',paper_size:'80mm',print_mode:'browser',agent_url:'http://127.0.0.1:17891',enabled:true},
    report:{route:'report',printer_name:'',paper_size:'A4',print_mode:'browser',agent_url:'http://127.0.0.1:17891',enabled:true}
  };
  let routes = {...defaults};

  const style = document.createElement('style');
  style.textContent = `
    .ff-printer-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
    .ff-printer-card{border:1px solid var(--line);border-radius:12px;padding:13px}
    .ff-printer-card h3{margin:0 0 4px}.ff-printer-card p{margin:0 0 10px}
    .ff-printer-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
    .ff-print-report{background:#fff;color:#111;padding:18mm;font-family:Arial,sans-serif}
    .ff-print-report h1{margin:0 0 3px;font-size:22px}.ff-print-report .sub{font-size:11px;color:#555;margin-bottom:18px}
    .ff-print-report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
    .ff-print-report .metric{border:1px solid #ddd;border-radius:8px;padding:10px}.ff-print-report .metric span{display:block;font-size:9px;text-transform:uppercase;color:#666}.ff-print-report .metric strong{font-size:16px}
    @media(max-width:760px){.ff-printer-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  async function loadRoutes(){
    if(!globalThis.profile?.business_id || !globalThis.profile?.branch_id) return routes;
    try{
      const {data:rows,error}=await sb.from('branch_printer_routes').select('*').eq('business_id',profile.business_id).eq('branch_id',profile.branch_id);
      if(error) throw error;
      routes = {...defaults};
      (rows||[]).forEach(r => { if(ROUTES.includes(r.route)) routes[r.route] = {...defaults[r.route],...r}; });
    }catch(e){ console.warn('FreshFlow printer routes:',e); }
    return routes;
  }

  function routeLabel(route){ return route === 'receipt' ? 'Receipt printer' : 'Admin report printer'; }
  function routeHint(route){ return route === 'receipt' ? '80 mm customer receipts from the POS.' : 'A4 owner reports and management reporting.'; }

  async function saveRoute(route){
    if(!isAdmin()) return toast('Owner or admin access required');
    const printer_name=document.getElementById('ffPrinterName_'+route)?.value.trim()||'';
    const print_mode=document.getElementById('ffPrintMode_'+route)?.value||'browser';
    const agent_url=document.getElementById('ffAgentUrl_'+route)?.value.trim()||'http://127.0.0.1:17891';
    const paper_size=route==='receipt'?'80mm':'A4';
    const row={business_id:profile.business_id,branch_id:profile.branch_id,route,printer_name,paper_size,print_mode,agent_url,enabled:true,updated_at:new Date().toISOString()};
    const {error}=await sb.from('branch_printer_routes').upsert(row,{onConflict:'business_id,branch_id,route'});
    if(error) return toast(error.message);
    await loadRoutes();
    toast(routeLabel(route)+' saved');
  }

  function printerCard(route){
    const r=routes[route]||defaults[route];
    return `<div class="ff-printer-card"><h3>${routeLabel(route)}</h3><p class="muted">${routeHint(route)}</p>
      <div class="field"><label>Printer name</label><input id="ffPrinterName_${route}" value="${E(r.printer_name||'')}" placeholder="${route==='receipt'?'EPSON TM T20III':'HP LaserJet Office'}"></div>
      <div class="field"><label>Printing method</label><select id="ffPrintMode_${route}" onchange="document.getElementById('ffAgentWrap_${route}').style.display=this.value==='agent'?'block':'none'"><option value="browser" ${r.print_mode==='browser'?'selected':''}>Browser print dialog</option><option value="agent" ${r.print_mode==='agent'?'selected':''}>FreshFlow Print Agent</option></select></div>
      <div class="field" id="ffAgentWrap_${route}" style="display:${r.print_mode==='agent'?'block':'none'}"><label>Print Agent address</label><input id="ffAgentUrl_${route}" value="${E(r.agent_url||'http://127.0.0.1:17891')}"></div>
      <div class="hint">Paper: ${r.paper_size}. Browser mode opens the normal print dialog. Agent mode routes directly to the named printer when the local agent is installed.</div>
      <div class="ff-printer-actions"><button class="btn primary" onclick="savePrinterRouteV09('${route}')">Save printer</button><button class="btn secondary" onclick="testPrinterRouteV09('${route}')">Test print</button></div>
    </div>`;
  }

  async function renderPrinterSettings(){
    if(!isAdmin()) return '';
    await loadRoutes();
    return `<div class="card" style="margin-top:10px"><h2 style="margin:0">Printers</h2><p class="muted">Choose separate printers for counter receipts and admin reporting for this branch.</p><div class="ff-printer-grid">${printerCard('receipt')}${printerCard('report')}</div></div>`;
  }

  async function sendAgent(route,html,title){
    const r=routes[route]||defaults[route];
    if(!r.printer_name) throw new Error('Choose a printer name in Settings first');
    const base=(r.agent_url||'http://127.0.0.1:17891').replace(/\/$/,'');
    const response=await fetch(base+'/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({route,printer:r.printer_name,paper_size:r.paper_size,title,html})});
    if(!response.ok) throw new Error('Print Agent returned '+response.status);
  }

  function browserPrint(html,route,title){
    const width=route==='receipt'?'92mm':'900px';
    const w=window.open('','_blank',`width=${route==='receipt'?430:980},height=800`);
    if(!w){ toast('Allow popups to print'); return; }
    const pageSize=route==='receipt'?'80mm auto':'A4';
    const receiptPrintCss=route==='receipt'?'html,body{width:80mm!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important}body>*:not(.receipt){display:none!important}.receipt{display:block!important;position:static!important;height:auto!important;min-height:0!important;max-height:none!important;page-break-after:avoid!important;break-after:avoid-page!important}':'';
    w.document.write(`<!doctype html><html><head><title>${E(title||'FreshFlow Print')}</title><meta charset="utf-8"><style>@page{size:${pageSize};margin:${route==='receipt'?'2mm':'12mm'}}${receiptPrintCss}body{margin:0;background:#fff;color:#111;font-family:Arial,sans-serif}.receipt{width:${route==='receipt'?'76mm':'72mm'};margin:0 auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.receipt h2{text-align:center;margin:0}.receipt .center{text-align:center}.receipt hr{border:0;border-top:1px dashed #777;margin:10px 0}.receiptline{display:flex;justify-content:space-between;gap:12px;font-size:11px;padding:2px 0}.receipt .big{font-size:16px;font-weight:900}.receiptfoot{text-align:center;font-size:10px;margin-top:12px}.ff-print-report{max-width:${width};margin:auto;padding:0}.ff-print-report-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.metric{border:1px solid #ddd;padding:10px}.metric span{display:block;font-size:9px;color:#666;text-transform:uppercase}.metric strong{font-size:16px}</style></head><body>${html}<script>window.onload=()=>{if(document.fonts&&document.fonts.ready){document.fonts.ready.then(()=>setTimeout(()=>window.print(),80))}else{setTimeout(()=>window.print(),80)};window.onafterprint=()=>window.close()}<\/script></body></html>`);
    w.document.close();
  }

  async function routePrint(route,html,title){
    await loadRoutes();
    const r=routes[route]||defaults[route];
    if(r.print_mode==='agent'){
      try{ await sendAgent(route,html,title); toast('Sent to '+(r.printer_name||routeLabel(route))); return; }
      catch(e){ console.warn('Print Agent unavailable:',e); toast('Print Agent unavailable. Opening browser print dialog.'); }
    }
    browserPrint(html,route,title);
  }

  window.savePrinterRouteV09=saveRoute;
  window.routePrintV09=routePrint;
  window.printReceiptV09=id=>{const o=data.orders.find(x=>x.id===id);if(o)routePrint('receipt',receiptHTML(o),'Receipt #'+o.order_number);};
  window.testPrinterRouteV09=async route=>{
    const html=route==='receipt'
      ? '<div class="receipt"><h2>FRESHFLOW</h2><div class="center">Printer test</div><hr><div class="receiptline"><span>Route</span><strong>Receipt</strong></div><div class="receiptfoot">Printer configuration successful</div></div>'
      : '<div class="ff-print-report"><h1>FreshFlow printer test</h1><div class="sub">Admin report printer</div><p>If you can read this page, the report print route is working.</p></div>';
    await routePrint(route,html,'FreshFlow printer test');
  };

  window.printOwnerReportV09=async function(){
    if(!isAdmin()) return toast('Owner or admin access required');
    const today=new Date(),from=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10),to=today.toISOString().slice(0,10);
    const {data:d,error}=await sb.rpc('admin_dashboard',{p_from:from,p_to:to});
    if(error) return toast(error.message);
    const html=`<div class="ff-print-report"><h1>${E(data?.business?.name||'FreshFlow')} Owner Report</h1><div class="sub">${from} to ${to}</div><div class="ff-print-report-grid"><div class="metric"><span>Sales</span><strong>${M(d.sales)}</strong></div><div class="metric"><span>Orders</span><strong>${d.orders}</strong></div><div class="metric"><span>Expenses</span><strong>${M(d.expenses)}</strong></div><div class="metric"><span>Outstanding</span><strong>${M(d.outstanding)}</strong></div></div><h3>Operations</h3><p>Overdue orders: <strong>${d.overdue}</strong></p><p>Ready for collection: <strong>${d.ready}</strong></p><p>Commercial debt: <strong>${M(d.commercial_debt)}</strong></p><p>Net after expenses: <strong>${M(Number(d.sales)-Number(d.expenses))}</strong></p><hr><small>Generated by FreshFlow at ${new Date().toLocaleString('en-ZA')}</small></div>`;
    routePrint('report',html,'FreshFlow Owner Report');
  };

  const oldShowReceipt=window.showReceipt;
  if(typeof oldShowReceipt==='function') window.showReceipt=function(id){
    oldShowReceipt(id);
    setTimeout(()=>{
      const primary=[...document.querySelectorAll('#modal .noPrint button')].find(b=>/print receipt/i.test(b.textContent||''));
      if(primary) primary.onclick=()=>printReceiptV09(id);
    },0);
  };

  const oldOpenV07=window.openV07;
  if(typeof oldOpenV07==='function') window.openV07=async function(view){
    const out=await oldOpenV07(view);
    if(view==='reports'&&isAdmin()) setTimeout(()=>{
      const head=document.querySelector('#v07host .pagehead');
      if(head&&!head.querySelector('[data-print-report]')){
        const b=document.createElement('button');b.className='btn secondary';b.dataset.printReport='1';b.textContent='Print report';b.onclick=()=>printOwnerReportV09();head.appendChild(b);
      }
    },0);
    return out;
  };

  async function addSettings(){
    const host=document.getElementById('v08host')||document.getElementById('v07host');
    if(!host||!isAdmin()) return;
    const html=await renderPrinterSettings();
    if(!document.getElementById('ffPrinterSettings')){
      const wrap=document.createElement('div');wrap.id='ffPrinterSettings';wrap.innerHTML=html;host.appendChild(wrap);
    }
  }

  const oldOpenV08=window.openV08;
  if(typeof oldOpenV08==='function') window.openV08=async function(view){
    const out=await oldOpenV08(view);
    if(view==='settings') setTimeout(addSettings,0);
    return out;
  };

  loadRoutes();
})();