// FreshFlow V0.9 dark interface experiment
(() => {
  const style=document.createElement('style');
  style.textContent=`
  :root{--ink:#f5f8ff;--muted:#8d9ab2;--bg:#07111f;--panel:#0d1828;--line:#1a2a3f;--nav:#0b51d8;--accent:#2477ff;--accent2:#145bd2;--soft:#11233c;--danger:#ff525d;--warn:#ffad32;--radius:14px;--shadow:0 10px 30px rgba(0,0,0,.18)}
  html,body{background:#07111f!important;color:#f5f8ff!important}
  body{background:radial-gradient(circle at 75% 0%,rgba(37,119,255,.08),transparent 32%),#07111f!important}
  .shell{grid-template-columns:214px minmax(0,1fr)!important}
  .side{background:linear-gradient(180deg,#2477ff 0%,#135bd6 58%,#0e47b6 100%)!important;padding:16px 12px!important;box-shadow:10px 0 35px rgba(0,0,0,.18)}
  .brand{display:block!important;padding:4px 8px 18px!important}
  .brand:after{content:'SUPERKLEEN';display:block;font-size:16px;font-weight:900;letter-spacing:.02em;margin-top:-31px;margin-left:54px;color:#fff}
  .brandmark{background:#07111f!important;color:#5fe7cf!important;border-radius:50%!important;width:42px!important;height:42px!important;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
  .nav{gap:4px!important}
  .navbtn,.nav [data-v07],.nav [data-v07x],.nav [data-v08]{color:#dce8ff!important;background:transparent!important;border-radius:10px!important;text-align:left!important;padding:11px 13px!important;font-size:12px!important;font-weight:700!important;width:100%!important;display:flex!important;align-items:center!important;gap:12px!important;min-height:42px}
  .navbtn b,.nav [data-v07] b,.nav [data-v07x] b,.nav [data-v08] b{display:inline-grid!important;place-items:center!important;width:20px!important;margin:0!important;font-size:16px!important;color:#dce8ff!important}
  .navbtn.active,.navbtn:hover,.nav [data-v07]:hover,.nav [data-v07].active,.nav [data-v07x]:hover,.nav [data-v08]:hover{background:rgba(255,255,255,.14)!important;color:#fff!important}
  .nav .badge{margin-left:auto!important;background:#0a2f79!important;color:#fff!important}
  .shopcard{display:block!important;margin-top:auto!important;background:rgba(4,32,91,.27)!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;padding:12px!important;color:#eaf2ff!important;text-align:left!important;font-size:10px!important}
  .main{max-width:none!important;margin:0!important;padding:20px 24px 42px!important;background:transparent!important}
  .top{margin-bottom:18px!important;padding:0 2px!important}
  .top h2{font-size:22px!important;color:#fff!important}
  .actions .btn{background:#0d1828!important;color:#f5f8ff!important;border-color:#1b2d46!important}
  .avatar{background:#12344e!important;color:#5fe7cf!important}
  #rolePill{background:#102d23!important;color:#5ce0a3!important}
  .card,.metric,.ffpanel,.ffkpi,.cashbox,.priceitem,.product,.login,.modal,.stat{background:linear-gradient(180deg,#0f1b2d,#0c1726)!important;border-color:#1a2a3f!important;color:#f5f8ff!important;box-shadow:var(--shadow)!important}
  .card h3,.ffpanel h3,.metric strong,.ffkpi strong,.stat strong,.modal h2{color:#fff!important}
  .muted,.ffdash-sub,.hint,.checkoutmeta,.ffkpi small,.fflist-main div,.ffnotif div,.ffquick span,.priceitem small,.cashbox small,.field label{color:#8d9ab2!important}
  .btn{border-radius:9px!important}.btn.primary,.primary{background:#2477ff!important;color:#fff!important}.btn.primary:hover,.primary:hover{background:#145bd2!important}.btn.secondary,.secondary{background:#101d2f!important;color:#f5f8ff!important;border-color:#20334d!important}.btn.danger,.danger{background:#321824!important;color:#ff7880!important}
  .input,.field input,.field select,.field textarea,select,input,textarea{background:#0a1524!important;border-color:#20334d!important;color:#f5f8ff!important}
  .input::placeholder,input::placeholder,textarea::placeholder{color:#64728a!important}
  .input:focus,.field input:focus,.field select:focus,.field textarea:focus{border-color:#2477ff!important;box-shadow:0 0 0 3px rgba(36,119,255,.14)!important}
  .ffdash{gap:14px!important}.ffdash-head h1{font-size:27px!important;color:#fff!important}.ffdash-kpis{gap:10px!important}.ffkpi{padding:16px!important}.ffkpi-icon{background:#102b50!important;color:#4e9cff!important;border-radius:12px!important}.ffkpi:nth-child(2) .ffkpi-icon{color:#b978ff!important;background:#251a45!important}.ffkpi:nth-child(3) .ffkpi-icon{color:#ffad32!important;background:#3b2a16!important}.ffkpi:nth-child(4) .ffkpi-icon{color:#56e3a7!important;background:#123427!important}.ffkpi:nth-child(5) .ffkpi-icon{color:#ff6870!important;background:#3a1b22!important}.ffkpi:nth-child(6) .ffkpi-icon{color:#a987ff!important;background:#241b44!important}
  .ffbars{border-color:#21324a!important}.ffbar{background:linear-gradient(180deg,#3185ff,#1769ff)!important;box-shadow:0 0 10px rgba(36,119,255,.3)!important}.ffdonut:after{background:#0d1828!important}.ffservicebar{background:#17263a!important}.ffservicebar span{background:#2477ff!important}.ffrank,.ffnotif-icon{background:#15243a!important;color:#9fb8de!important}.fflist-row,.ffnotif{border-color:#1a2a3f!important}.ffstatus{background:#162537!important;color:#c7d4e8!important}.ffstatus.Ready{background:#103424!important;color:#65e8a5!important}.ffstatus.Washing,.ffstatus.Drying{background:#132b4c!important;color:#6cb7ff!important}.ffstatus.Ironing{background:#3a2a12!important;color:#ffc45c!important}.ffoverdue{color:#ff646c!important}.ffquick button{background:#0f1b2d!important;border-color:#1a2a3f!important;color:#fff!important}.ffquick button:hover{border-color:#2477ff!important;background:#11233c!important}
  .poslayout{grid-template-columns:minmax(0,1fr) 330px!important}.poshead{background:#07111f!important}.categories,.subrow{padding-bottom:9px!important}.catbtn,.groupbtn{background:#0e1a2b!important;border-color:#1c2e47!important;color:#c9d6ea!important}.catbtn.active,.groupbtn.active{background:#2477ff!important;color:#fff!important;border-color:#2477ff!important}.product{min-height:78px!important}.product:hover{border-color:#2477ff!important;transform:translateY(-1px)}.product .cat{color:#74839a!important}.product .price{color:#5fe7cf!important}.star{color:#536174!important}.star.on{color:#ffc54a!important}.cart{background:transparent!important}.cartrow,th,td{border-color:#1a2a3f!important}.total{color:#fff!important}
  table{color:#e9f0fb!important}th{color:#7f90a8!important}tr:hover td{background:#0f1c2d!important}.chip{background:#17263a!important;color:#dce7f7!important}.chip.Ready,.chip.paid{background:#103424!important;color:#65e8a5!important}.chip.partial{background:#3a2a12!important;color:#ffc45c!important}
  .cashbox strong,.priceitem strong{color:#fff!important}.notice{background:#2e2411!important;border-color:#5b471b!important;color:#f1cf79!important}.testrow{border-color:#20334d!important}.testrow.pass{background:#102d23!important}.testrow.fail{background:#331b23!important}.testrow.wait{background:#111e30!important}
  .modalback{background:rgba(0,6,15,.72)!important;backdrop-filter:blur(5px)}.checkoutsummary{background:#091522!important;border-color:#20334d!important}.receipt{background:#fff!important;color:#111!important;padding:14px!important;border-radius:10px!important}.receipt *{color:#111!important}
  .loginwrap{background:radial-gradient(circle at 70% 20%,rgba(36,119,255,.2),transparent 30%),#07111f!important}.login{background:#0e192a!important}.mark{background:#2477ff!important}.login h1{color:#fff!important}
  .toast{background:#17365d!important;color:#fff!important;box-shadow:0 12px 35px rgba(0,0,0,.35)!important}
  @media(max-width:1100px){.shell{grid-template-columns:176px minmax(0,1fr)!important}.navbtn,.nav [data-v07],.nav [data-v07x],.nav [data-v08]{font-size:11px!important}.brand:after{font-size:13px!important}}
  @media(max-width:840px){.shell{display:block!important}.side{background:linear-gradient(90deg,#0d4bbf,#176dff)!important;padding:6px 8px!important}.nav{display:flex!important;overflow:auto!important;gap:4px!important}.navbtn,.nav [data-v07],.nav [data-v07x],.nav [data-v08]{min-width:76px!important;display:grid!important;text-align:center!important;padding:7px 5px!important;font-size:9px!important;gap:2px!important}.navbtn b,.nav [data-v07] b,.nav [data-v07x] b,.nav [data-v08] b{margin:auto!important}.main{padding:14px 12px 88px!important}.ffdash-kpis{grid-template-columns:repeat(2,1fr)!important}.poslayout{grid-template-columns:1fr!important}.products{grid-template-columns:1fr!important}.ffdash-row,.ffdash-bottom{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);

  document.body.classList.add('freshflow-dark');
  const mark=document.querySelector('.brandmark');if(mark)mark.textContent='SK';
  const title=document.querySelector('.login p.muted');if(title)title.textContent='Powered by FreshFlow V0.9 Preview';
  const version=document.querySelector('.shopcard span:last-child');if(version)version.textContent='V0.9 Preview';
  document.title='FreshFlow V0.9 Preview | Superkleen';
})();
