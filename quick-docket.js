// FreshFlow counter layer.
// Quick Docket is the default staff screen. It reuses the existing cart,
// create_order RPC, customer records, and the 80mm print route.
// Tiles use the branch price (priceAt) and skip items that branch has hidden.
// Loaded last so it sits on V0.5–V0.9 without replacing them.
(() => {
  document.body.dataset.ffq = '1';

  const $ = id => document.getElementById(id);
  const admin = () => ['owner', 'admin'].includes(String((typeof profile !== 'undefined' && profile && profile.role) || '').toLowerCase());
  const biz = () => (typeof profile !== 'undefined' && profile && profile.business_id) || 'local';
  const pinKey = () => 'superkleen_quick_pins_' + biz();
  const dueKey = () => 'superkleen_quick_due_days_' + biz();
  const digits = v => String(v || '').replace(/\D/g, '');
  const itemLabel = s => (s && (s.item_name || s.name)) || 'Item';
  const sellPrice = s => (typeof priceAt === 'function' ? priceAt(s) : Number(s && s.price) || 0);
  const onCounter = s => !!s && (typeof serviceSellable !== 'function' || serviceSellable(s));
  const priceLabel = s => (typeof money === 'function' ? money(sellPrice(s)) : sellPrice(s)) + (s.unit === 'kg' ? '/kg' : '');
  const shopTitle = () => {
    if (typeof profile === 'undefined' || !profile) return '';
    try {
      if (typeof shopBrand === 'function') {
        const name = shopBrand().name;
        if (name) return name;
      }
    } catch (err) { console.error(err); }
    return (typeof data !== 'undefined' && data.business && data.business.name) || '';
  };

  const SLOTS = [
    { re: /\bshirts?\b/i, avoid: /t-?\s?shirt|sweat|night/i, cat: /dry/i },
    { re: /trouser|\bpants\b|slacks|\bbroek\b/i, avoid: /\bshorts?\b/i, cat: /dry/i },
    { re: /jacket|blazer|\bbaadjie\b/i, avoid: /leather|suede|pyjama|pajama/i, cat: /dry/i },
    { re: /\bdress(es)?\b/i, avoid: /dressing|address/i, cat: /dry/i },
    { re: /\bskirts?\b/i, cat: /dry/i },
    { re: /jersey|jumper|pullover|knitwear|sweater|\btrui\b/i, cat: /dry/i },
    { re: /\bsuits?\b/i, avoid: /track|swim|boiler|jumpsuit|wetsuit/i, cat: /dry/i },
    { re: /\bcoats?\b|overcoat/i, avoid: /waistcoat|petticoat|jacket/i, cat: /dry/i },
    { laundry: true },
    { re: /duvet|quilt|comforter/i },
    { re: /shirt/i, avoid: /t-?\s?shirt|sweat/i, cat: /press/i },
    { re: /\bties?\b/i, cat: /dry/i }
  ];

  let booted = false;
  let dataReady = false;
  let saving = false;
  let collecting = false;
  let payChoice = 'unpaid';
  let matchedId = '';
  let nameEdited = false;
  let lastAutoName = '';
  let dueDirty = false;
  let collectQuery = '';
  let lastOrderId = '';

  const style = document.createElement('style');
  style.id = 'ffq-style';
  style.textContent = `
  body.ff-quick{background:#f3f6f4!important;color:#102018!important;color-scheme:light}
  body.ff-quick .main{background:transparent!important;color:#102018!important}
  body.ff-quick .top h2{color:#102018!important;font-size:30px!important}
  body.ff-quick #rolePill{display:none!important}
  body.ff-quick .side{background:#fff!important;color:#102018!important;box-shadow:none!important;border-right:1px solid #d5e0d9!important}
  body.ff-quick .brand:after{color:#102018!important}
  body.ff-quick .brandname{display:block!important;color:#102018!important;font-size:13px!important;font-weight:900!important;line-height:1.1!important;max-width:140px!important}
  body.ff-quick .brandmark{background:#14583d!important;color:#fff!important;box-shadow:none!important}
  body.ff-quick .shopcard{background:#e7f2ec!important;color:#102018!important;border:0!important;font-size:14px!important;text-align:center!important}
  body.ff-quick .shopcard span:last-child{display:none!important}
  body.ff-quick .nav{gap:6px!important}
  body.ff-quick .nav > button:not([data-ffq]){display:none!important}
  body.ff-owner .nav > [data-ffq]:not([data-ffq="back"]){display:none!important}
  body.ff-owner .nav > [data-ffq="back"]{display:flex!important;order:-1;align-items:center;justify-content:center;gap:6px;background:#fff!important;color:#102018!important;font-size:15px!important;font-weight:800!important;min-height:52px!important;border-radius:10px!important;width:100%!important}
  body.ff-quick .nav [data-ffq]{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:2px!important;min-height:68px!important;border:0!important;border-radius:12px!important;background:transparent!important;color:#102018!important;font-size:15px!important;font-weight:800!important;text-align:center!important;width:100%!important;padding:8px 4px!important;cursor:pointer;touch-action:manipulation}
  body.ff-quick .nav [data-ffq] b{display:block!important;font-size:20px!important;color:inherit!important;margin:0!important;width:auto!important}
  body.ff-quick .nav [data-ffq] span{display:block;line-height:1.1}
  body.ff-quick .nav [data-ffq].active{background:#14583d!important;color:#fff!important}
  body.ff-quick .nav [data-ffq="back"]{display:none!important}
  body.ff-quick .actions .btn{background:#fff!important;color:#102018!important;border:2px solid #1b4332!important;font-size:16px!important;padding:10px 12px!important}
  body.ff-quick .avatar{background:#e7f2ec!important;color:#14583d!important}
  body.ff-quick .card,body.ff-quick .metric,body.ff-quick .cashbox,body.ff-quick .modal{background:#fff!important;color:#102018!important;border-color:#d5e0d9!important;box-shadow:none!important}
  body.ff-quick .card h3,body.ff-quick .modal h2,body.ff-quick .cashbox strong{color:#102018!important}
  body.ff-quick input,body.ff-quick select,body.ff-quick textarea{background:#fff!important;color:#102018!important;border-color:#8aa898!important;font-size:18px!important}
  body.ff-quick table,body.ff-quick td,body.ff-quick th{color:#102018!important;border-color:#d5e0d9!important}
  body.ff-quick th{font-size:14px!important}
  body.ff-quick #cashup td{font-size:16px!important}
  body.ff-quick .cashbox small,body.ff-quick .field label{font-size:14px!important;color:#3e5248!important;text-transform:none!important;letter-spacing:0!important}
  body.ff-quick .cashbox strong{font-size:28px!important}
  body.ff-quick #cashup .btn.primary,body.ff-quick .btn.primary{background:#14583d!important;color:#fff!important;font-size:20px!important;padding:14px 16px!important}
  body.ff-quick #cashup .btn.primary:disabled{background:#d5e0d9!important;color:#3e5248!important;cursor:not-allowed}
  body.ff-quick .btn.secondary{background:#fff!important;color:#102018!important;border-color:#1b4332!important}
  body.ff-quick .muted,body.ff-quick .hint{color:#3e5248!important}
  body.ff-quick .toast{background:#102018!important;color:#fff!important;font-size:18px!important}
  body.ff-quick .modalback{background:rgba(8,20,15,.48)!important}
  body.ff-quick .modal{font-size:18px!important}
  body.ff-quick .modal td,body.ff-quick .modal .btn{font-size:16px!important}
  body.ff-quick #productionChecks .testrow{font-size:16px!important}
  .ffq-new{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px);gap:16px;align-items:start}
  .ffq-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:10px}
  .ffq-tile{position:relative;min-height:112px;border-radius:16px;border:3px solid #1b4332;background:#fff;color:#102018;padding:14px 12px 12px;text-align:left;cursor:pointer;font-weight:800;line-height:1.15;touch-action:manipulation}
  .ffq-tile-name{display:block;font-size:22px}
  .ffq-tile-price{display:block;margin-top:8px;font-size:18px;color:#0f5a3d}
  .ffq-tile.on{background:#14583d;color:#fff;border-color:#0d3b2c}
  .ffq-tile.on .ffq-tile-price{color:#d9ffe8}
  .ffq-tile.other{border-style:dashed;background:#e7f2ec}
  .ffq-badge{position:absolute;top:8px;right:8px;min-width:32px;height:32px;padding:0 8px;border-radius:999px;background:#102018;color:#fff;font-size:18px;display:grid;place-items:center}
  .ffq-tile.on .ffq-badge{background:#fff;color:#14583d}
  .ffq-dec{position:absolute;left:8px;bottom:8px;width:44px;height:44px;border-radius:12px;border:2px solid currentColor;background:transparent;color:inherit;font-size:28px;line-height:1;display:grid;place-items:center}
  .ffq-tile.on{padding-bottom:56px}
  .ffq-panel{background:#fff;border:2px solid #d5e0d9;border-radius:18px;padding:16px}
  .ffq-hint{font-size:18px;color:#3e5248;margin:8px 0}
  .ffq-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid #d5e0d9}
  .ffq-line strong{display:block;font-size:20px}
  .ffq-lineprice{font-size:16px;color:#3e5248}
  .ffq-qty{display:flex;align-items:center;gap:6px}
  .ffq-qty button,.ffq-remove{min-width:48px;height:48px;border-radius:12px;border:2px solid #1b4332;background:#fff;color:#102018;font-size:22px;font-weight:800;cursor:pointer}
  .ffq-remove{font-size:16px;padding:0 10px}
  .ffq-qty input{width:68px;height:48px;text-align:center;font-size:22px!important;border-radius:12px!important;border:2px solid #1b4332!important}
  .ffq-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;font-size:18px;font-weight:800}
  .ffq-total strong{font-size:32px}
  .ffq-field{display:grid;gap:6px;margin-top:12px;font-size:16px;font-weight:800;color:#1d4d38}
  body.ff-quick .ffq-field input,body.ff-quick .ffq-field textarea{font-size:24px!important;min-height:64px;border-radius:14px!important;border:3px solid #1b4332!important;padding:10px 14px!important}
  .ffq-match{min-height:28px;margin-top:6px;font-size:18px;font-weight:800;color:#14583d}
  .ffq-match.new{color:#7a4e12}
  .ffq-pick{display:block;width:100%;text-align:left;margin-top:6px;min-height:52px;border-radius:12px;border:2px solid #1b4332;background:#fff;font-size:18px;font-weight:800;padding:8px 12px;cursor:pointer}
  .ffq-pay{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ffq-pay button{flex:1 1 40%;min-height:52px;border-radius:12px;border:2px solid #1b4332;background:#fff;color:#102018;font-size:16px;font-weight:800;cursor:pointer}
  .ffq-pay button.active{background:#14583d;color:#fff}
  .ffq-note{margin-top:8px;background:transparent;border:0;color:#14583d;font-size:16px;font-weight:800;cursor:pointer;padding:6px 0}
  .ffq-need{min-height:26px;margin:8px 0 0;font-size:18px;font-weight:700;color:#7a4e12}
  .ffq-save{width:100%;min-height:76px;margin-top:8px;border:0;border-radius:16px;background:#14583d;color:#fff;font-size:26px;font-weight:900;cursor:pointer;touch-action:manipulation}
  .ffq-save:disabled{background:#9bb0a6;cursor:not-allowed}
  .ffq-last{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding:10px 12px;border-radius:12px;border:2px solid #1b4332;background:#e5f6ec;font-size:18px;font-weight:800}
  .ffq-last button{min-height:48px;padding:8px 12px;border-radius:12px;border:2px solid #1b4332;background:#fff;font-size:16px;font-weight:800;cursor:pointer}
  .ffq-h{font-size:22px;margin:8px 0}
  .ffq-search{width:100%;min-height:64px;margin:8px 0 12px;border-radius:14px!important;border:3px solid #1b4332!important;font-size:22px!important;padding:10px 14px!important}
  .ffq-card{background:#fff;border:2px solid #d5e0d9;border-radius:16px;padding:14px;margin:0 0 10px}
  .ffq-card.late{border-color:#a23f39}
  .ffq-card h3{margin:0;font-size:22px;color:#102018}
  .ffq-card p{margin:6px 0;font-size:18px;color:#24352c}
  .ffq-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .ffq-actions button{min-height:56px;padding:10px 14px;border-radius:12px;border:2px solid #1b4332;background:#fff;color:#102018;font-size:18px;font-weight:800;cursor:pointer}
  .ffq-actions button.pay{background:#14583d;color:#fff;border-color:#14583d}
  .ffq-actions button.quiet{background:transparent}
  .ffq-menu{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
  .ffq-menu button{text-align:left;background:#fff;border:3px solid #1b4332;border-radius:16px;min-height:96px;padding:14px;cursor:pointer;color:#102018}
  .ffq-menu button b{display:block;font-size:20px}
  .ffq-menu button span{display:block;margin-top:4px;font-size:16px;font-weight:600;color:#3e5248}
  .ffq-lead{font-size:18px;margin:0 0 14px;color:#24352c}
  .ffq-overlay{position:fixed;inset:0;z-index:70;background:rgba(10,24,18,.45);display:grid;place-items:end center;padding:12px}
  .ffq-overlay-card{background:#f7faf8;color:#102018;width:min(880px,100%);max-height:min(94vh,920px);overflow:auto;border-radius:18px;padding:18px}
  .ffq-overlay-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
  .ffq-overlay-head h2{margin:0;font-size:28px}
  .ffq-overlay-head p{margin:4px 0 0;font-size:18px;color:#3e5248}
  .ffq-done{min-height:52px;padding:8px 16px;border-radius:12px;border:2px solid #1b4332;background:#14583d;color:#fff;font-size:18px;font-weight:800;cursor:pointer}
  .ffq-due-setting{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0;font-size:18px;font-weight:800}
  .ffq-due-setting button{width:48px;height:48px;border-radius:12px;border:2px solid #1b4332;background:#fff;font-size:26px;cursor:pointer}
  .ffq-chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
  .ffq-chips button{font-size:16px;font-weight:800;padding:10px 12px;border-radius:999px;border:2px solid #1b4332;background:#14583d;color:#fff;cursor:pointer}
  .ffq-textbtn{background:transparent;border:0;color:#14583d;font-size:16px;font-weight:800;cursor:pointer;padding:6px 0}
  .ffq-pinrow,.ffq-result{display:flex;justify-content:space-between;gap:10px;align-items:center;width:100%;text-align:left;background:#fff;border:2px solid #d5e0d9;border-radius:14px;padding:12px;margin-top:8px;cursor:pointer;color:#102018}
  .ffq-pinrow strong,.ffq-result strong{display:block;font-size:18px}
  .ffq-pinrow small,.ffq-result small{display:block;font-size:16px;color:#3e5248}
  .ffq-pinrow button,.ffq-result em{font-style:normal;font-weight:800;font-size:18px;min-height:48px;display:grid;place-items:center}
  .ffq-pinrow button{min-width:132px;border-radius:12px;border:2px solid #1b4332;background:#fff;cursor:pointer}
  .ffq-pinrow button.on{background:#14583d;color:#fff}
  @media(min-width:981px){body.ff-quick .ffq-panel{position:sticky;top:12px}}
  @media(max-width:980px){
    .ffq-new{grid-template-columns:1fr}
    .ffq-tile-name{font-size:20px}
    .ffq-line{grid-template-columns:minmax(0,1fr)}
    .ffq-qty{justify-content:flex-start}
  }
  @media(max-width:840px){
    body.ff-quick .shell{display:block!important}
    body.ff-quick .side{position:fixed!important;left:0;right:0;bottom:0;top:auto!important;height:auto!important;z-index:40!important;background:#fff!important;border-top:1px solid #d5e0d9!important;padding:6px!important}
    body.ff-quick .brand,body.ff-quick .shopcard{display:none!important}
    body.ff-quick .nav{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;overflow:hidden!important;gap:4px!important}
    body.ff-quick .nav [data-ffq]{min-width:0!important;min-height:58px!important;font-size:13px!important;padding:4px 2px!important}
    body.ff-quick .main{padding:14px 12px 128px!important}
    body.ff-quick .top h2{font-size:26px!important}
    body.ff-owner .nav{display:flex!important;overflow:auto!important}
  }
  .loginwrap{background:#f3f6f4!important}
  .login{background:#fff!important;color:#102018!important}
  .login h1,.login p{color:#102018!important}
  .login .field label{font-size:16px!important;color:#1d4d38!important;letter-spacing:0!important;text-transform:none!important}
  .login input{font-size:20px!important;padding:14px!important;min-height:56px!important;background:#fff!important;color:#102018!important;border:2px solid #1b4332!important}
  .login .btn.primary{font-size:20px!important;min-height:56px!important;padding:14px!important;background:#14583d!important}
  .login .hint,.login .muted{font-size:16px!important;color:#3e5248!important}
  .ffq-shopline{font-size:18px;font-weight:800;margin-top:2px}
  body.ff-quick .ffq-shopline{color:#14583d}
  body.ff-owner .ffq-shopline{color:#9fb8de}
  .ffq-tile:focus-visible,.ffq-save:focus-visible,.ffq-field input:focus-visible{outline:3px solid #0b3d2c;outline-offset:2px}
  `;
  document.head.appendChild(style);

  const loginNote = document.querySelector('.login p.muted');
  if (loginNote) loginNote.textContent = 'Sign in to the counter';

  function parkDiagnostics() {
    const box = $('productionChecks');
    const card = box && box.closest('.card');
    if (!card || $('ffqDiagHolder')) return;
    const holder = document.createElement('div');
    holder.id = 'ffqDiagHolder';
    holder.hidden = true;
    document.body.appendChild(holder);
    holder.appendChild(card);
  }

  function buildShell() {
    const main = document.querySelector('main');
    if (!main || $('ffqNew')) return;
    main.insertAdjacentHTML('beforeend', `
      <section id="ffqNew" class="view">
        <div class="ffq-new">
          <div id="ffqTiles" class="ffq-tiles"></div>
          <form id="ffqForm" class="ffq-panel" autocomplete="off">
            <div class="ffq-total"><span>This docket</span><strong id="ffqTotalAmt"></strong></div>
            <div id="ffqLines"></div>
            <label class="ffq-field">Phone number
              <input id="ffqPhone" inputmode="tel" autocomplete="tel" placeholder="082 000 0000">
            </label>
            <div id="ffqMatch" class="ffq-match"></div>
            <label class="ffq-field">Name
              <input id="ffqName" autocomplete="name" placeholder="Customer name">
            </label>
            <label class="ffq-field" id="ffqDueLabel"><span id="ffqDueText">Ready on</span>
              <input id="ffqDue" type="date">
            </label>
            <div id="ffqPay" class="ffq-pay">
              <button type="button" data-pay="unpaid" class="active">Pay on collection</button>
              <button type="button" data-pay="cash">Cash now</button>
              <button type="button" data-pay="card">Card now</button>
              <button type="button" data-pay="eft">EFT now</button>
            </div>
            <button type="button" class="ffq-note" id="ffqNoteToggle">Add a note</button>
            <div id="ffqNoteBox" class="hidden"><textarea id="ffqNotes" class="ffq-field" rows="2" placeholder="Stain or care note"></textarea></div>
            <div id="ffqNeed" class="ffq-need"></div>
            <div class="ffq-savebar"><button type="submit" class="ffq-save" id="ffqSave" disabled>Save &amp; Print</button></div>
            <div id="ffqLast" class="ffq-last hidden"><span id="ffqLastText"></span><button type="button" id="ffqLastPrint">Print again</button></div>
          </form>
        </div>
      </section>
      <section id="ffqReady" class="view">
        <input id="ffqReadySearch" class="ffq-search" placeholder="Search name, phone or docket number">
        <div id="ffqReadyList"></div>
      </section>
      <section id="ffqCollect" class="view">
        <input id="ffqCollectSearch" class="ffq-search" placeholder="Phone, name or docket number" inputmode="search">
        <div id="ffqCollectList"></div>
      </section>
      <section id="ffqOwner" class="view"><div id="ffqOwnerList"></div></section>
    `);
    document.body.insertAdjacentHTML('beforeend', `
      <div id="ffqSearch" class="ffq-overlay hidden">
        <div class="ffq-overlay-card">
          <div class="ffq-overlay-head"><div><h2>Other item</h2><p>Search the price list and tap to add it.</p></div><button type="button" class="ffq-done" id="ffqSearchClose">Done</button></div>
          <input id="ffqSearchInput" class="ffq-search" placeholder="Try shirt, duvet, curtains">
          <div id="ffqSearchResults"></div>
        </div>
      </div>
      <div id="ffqPins" class="ffq-overlay hidden">
        <div class="ffq-overlay-card">
          <div class="ffq-overlay-head"><div><h2>Counter favourites</h2><p>These are the big buttons on New docket. Pick up to 12. This device remembers them.</p></div><button type="button" class="ffq-done" id="ffqPinsClose">Done</button></div>
          <div class="ffq-due-setting"><span>Usually ready in</span><button type="button" id="ffqDueMinus" aria-label="Fewer days">−</button><strong id="ffqDueDays">2</strong><span>days</span><button type="button" id="ffqDuePlus" aria-label="More days">+</button></div>
          <div id="ffqPinChips" class="ffq-chips"></div>
          <button type="button" class="ffq-textbtn" id="ffqPinsReset">Use suggested items</button>
          <input id="ffqPinSearch" class="ffq-search" placeholder="Search the price list to add an item">
          <div id="ffqPinResults"></div>
        </div>
      </div>
    `);
    const nav = document.querySelector('.nav');
    if (nav) {
      const tabs = [['back', '←', 'Counter'], ['new', '＋', 'New'], ['ready', '✓', 'Ready'], ['collect', '↗', 'Collect'], ['cash', 'R', 'Cash up'], ['owner', '☰', 'Owner']];
      tabs.forEach(([key, icon, label]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.ffq = key;
        b.innerHTML = '<b>' + icon + '</b><span>' + label + '</span>';
        b.addEventListener('click', () => {
          if (key === 'back' || key === 'new') window.go('ffqNew');
          else if (key === 'ready') window.go('ffqReady');
          else if (key === 'collect') window.go('ffqCollect');
          else if (key === 'cash') window.go('cashup');
          else window.go('ffqOwner');
        });
        nav.appendChild(b);
      });
    }
  }

  function scoreSlot(s, slot) {
    const item = String(s.item_name || s.name || '');
    const name = [item, s.service_group, s.category].filter(Boolean).join(' ');
    if (slot.cat && !slot.cat.test(String(s.category || ''))) return -1;
    if (slot.avoid && slot.avoid.test(name)) return -1;
    if (slot.laundry) {
      if (!/laundry/i.test(String(s.category || ''))) return -1;
      let score = s.unit === 'kg' ? 80 : 40;
      if (/mixed|general|laundry|per kg|\bkg\b/i.test(item)) score += 20;
      return score - Math.min(30, item.length / 3);
    }
    if (slot.re && !slot.re.test(name)) return -1;
    let score = 100 - Math.min(36, item.length / 2);
    if (/express|urgent|wedding|bead|leather|suede|silk|special|evening/i.test(name)) score -= 30;
    return score;
  }

  function defaultServices() {
    const used = new Set();
    const picked = [];
    SLOTS.forEach(slot => {
      let best = null;
      let bestScore = 0;
      (data.services || []).forEach(s => {
        if (!onCounter(s) || used.has(s.id)) return;
        const score = scoreSlot(s, slot);
        if (score > bestScore) { bestScore = score; best = s; }
      });
      if (best) { used.add(best.id); picked.push(best); }
    });
    if (picked.length < 8) {
      const rest = (data.services || []).filter(s => onCounter(s) && !used.has(s.id) && /dry/i.test(String(s.category || '')));
      rest.sort((a, b) => itemLabel(a).length - itemLabel(b).length);
      rest.forEach(s => {
        if (picked.length >= 8) return;
        picked.push(s);
        used.add(s.id);
      });
    }
    return picked.slice(0, 12);
  }

  function savedPinIds() {
    const raw = localStorage.getItem(pinKey());
    if (raw === null) return null;
    try {
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return [];
      return ids.filter(id => (data.services || []).some(s => s.id === id)).slice(0, 12);
    } catch (e) { return []; }
  }

  function counterServices() {
    const saved = savedPinIds();
    const list = saved ? saved.map(id => data.services.find(s => s.id === id)).filter(Boolean) : defaultServices();
    return list.filter(onCounter).slice(0, 12);
  }

  function setPins(ids) {
    localStorage.setItem(pinKey(), JSON.stringify(ids.slice(0, 12)));
  }

  function dueDays() {
    const n = Number(localStorage.getItem(dueKey()));
    return Number.isFinite(n) && n >= 1 && n <= 14 ? Math.round(n) : 2;
  }

  function setDueDays(n) {
    const days = Math.min(14, Math.max(1, n));
    localStorage.setItem(dueKey(), String(days));
    if (!dueDirty) ensureDue();
    renderPins();
  }

  function addDays(isoDate, days) {
    const [y, m, d] = String(isoDate || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
    return dt.toISOString().slice(0, 10);
  }

  function friendlyDate(isoDate) {
    const [y, m, d] = String(isoDate || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  function ensureDue() {
    const el = $('ffqDue');
    if (!el || dueDirty) return;
    const today = typeof localDate === 'function' ? localDate() : new Date().toISOString().slice(0, 10);
    el.value = addDays(today, dueDays());
  }

  function refreshDueLabel() {
    const el = $('ffqDue');
    const text = $('ffqDueText');
    if (!el || !text) return;
    text.textContent = el.value ? ('Ready on ' + friendlyDate(el.value)) : 'Ready on';
  }

  function tileTitle(s, all) {
    const label = itemLabel(s);
    if (/press/i.test(String(s.category || '')) && !/^press\b/i.test(label)) return 'Press ' + label;
    const dupes = all.filter(x => x.id !== s.id && itemLabel(x).toLowerCase() === label.toLowerCase() && !/press/i.test(String(x.category || '')));
    if (!dupes.length) return label;
    const group = s.service_group || s.category || '';
    return group ? label + ' · ' + group : label;
  }

  function lineLabel(line) {
    const s = (data.services || []).find(x => x.id === line.id);
    if (s) return itemLabel(s);
    return typeof shortDesc === 'function' ? shortDesc(line.description) : (line.name || 'Item');
  }

  function samePhone(a, b) {
    const x = digits(a);
    const y = digits(b);
    if (x.length < 9 || y.length < 9) return false;
    return x === y || x.slice(-9) === y.slice(-9);
  }

  function findCustomers(phone) {
    if (digits(phone).length < 10) return [];
    return (data.customers || []).filter(c => samePhone(c.phone, phone));
  }

  function resolveCustomer() {
    const phone = $('ffqPhone').value;
    const matches = findCustomers(phone);
    if (matchedId && matches.some(c => c.id === matchedId)) return matchedId;
    if (matches.length === 1) return matches[0].id;
    const name = $('ffqName').value.trim().toLowerCase();
    const byName = matches.filter(c => String(c.name || '').trim().toLowerCase() === name);
    return byName.length === 1 ? byName[0].id : null;
  }

  function renderMatch(matches) {
    const host = $('ffqMatch');
    if (!host) return;
    const d = digits($('ffqPhone').value);
    host.className = 'ffq-match';
    if (d.length < 10) {
      host.textContent = d.length >= 7 ? 'Almost — finish the phone number.' : '';
      return;
    }
    if (!matches) matches = findCustomers($('ffqPhone').value);
    if (matches.length === 1) { host.textContent = 'Existing customer'; return; }
    if (matches.length > 1) {
      host.innerHTML = '<div>More than one customer has this number. Tap the right name.</div>' + matches.slice(0, 6).map(c => `<button type="button" class="ffq-pick" data-customer="${esc(c.id)}">${esc(c.name || 'Customer')}</button>`).join('');
      return;
    }
    host.className = 'ffq-match new';
    host.textContent = 'New customer — type their name below.';
  }

  function canSave() {
    return cart.length > 0 && digits($('ffqPhone').value).length >= 10 && $('ffqName').value.trim().length > 0 && !!$('ffqDue').value && !saving;
  }

  function missingText() {
    if (saving) return '';
    if (!cart.length) return 'Add at least one item.';
    if (digits($('ffqPhone').value).length < 10) return 'Type the full phone number.';
    if (!$('ffqName').value.trim()) return 'Type the customer name.';
    if (!$('ffqDue').value) return 'Choose the ready date.';
    return '';
  }

  function updateSave() {
    const btn = $('ffqSave');
    const need = $('ffqNeed');
    if (need) need.textContent = missingText();
    if (!btn || saving) return;
    btn.disabled = !canSave();
  }

  function renderTiles() {
    const services = counterServices();
    const host = $('ffqTiles');
    if (!host) return;
    const tiles = services.map(s => {
      const line = cart.find(x => x.id === s.id);
      const qty = line ? line.qty : 0;
      const title = tileTitle(s, services);
      return `<button type="button" class="ffq-tile${qty ? ' on' : ''}" data-add="${esc(s.id)}">
        ${qty ? `<span class="ffq-badge">${esc(String(qty))}</span><span class="ffq-dec" data-dec="${esc(s.id)}" aria-label="Less ${esc(title)}">−</span>` : ''}
        <span class="ffq-tile-name">${esc(title)}</span>
        <span class="ffq-tile-price">${esc(priceLabel(s))}</span>
      </button>`;
    }).join('');
    host.innerHTML = tiles + '<button type="button" class="ffq-tile other" data-other="1"><span class="ffq-tile-name">Other item</span><span class="ffq-tile-price">Search the list</span></button>';
  }

  function renderLines() {
    const host = $('ffqLines');
    if (!host) return;
    if (!cart.length) host.innerHTML = '<p class="ffq-hint">Tap the big buttons to add items. Tap again to add another.</p>';
    else host.innerHTML = cart.map(line => {
      const label = lineLabel(line);
      const step = line.unit === 'kg' ? '0.1' : '1';
      return `<div class="ffq-line"><div><strong>${esc(label)}</strong><div class="ffq-lineprice">${esc(money(Number(line.price) * Number(line.qty)))}</div></div>
        <div class="ffq-qty">
          <button type="button" data-dec="${esc(line.id)}" aria-label="Less ${esc(label)}">−</button>
          <input data-qty="${esc(line.id)}" inputmode="decimal" step="${step}" min="0" value="${line.qty}" aria-label="Quantity for ${esc(label)}">
          <button type="button" data-inc="${esc(line.id)}" aria-label="More ${esc(label)}">+</button>
        </div>
        <button type="button" class="ffq-remove" data-remove="${esc(line.id)}">Remove</button></div>`;
    }).join('');
    const total = cart.reduce((sum, line) => sum + Number(line.price) * Number(line.qty), 0);
    const amt = $('ffqTotalAmt');
    if (amt) amt.textContent = money(total);
  }

  function renderQuickNew() {
    renderTiles();
    renderLines();
    ensureDue();
    refreshDueLabel();
    updateSave();
    updateReadyBadge();
  }

  function changeQtyById(id, delta) {
    const i = cart.findIndex(x => x.id === id);
    if (delta > 0) addService(id);
    else if (i >= 0) {
      if (Number(cart[i].qty) <= 1) cart.splice(i, 1);
      else cart[i].qty = roundQty(Number(cart[i].qty) - 1, cart[i].unit);
      renderCart();
    }
    renderQuickNew();
  }

  function setQtyById(id, value) {
    const i = cart.findIndex(x => x.id === id);
    if (i < 0) return;
    const n = Number(value);
    if (!(n > 0)) cart.splice(i, 1);
    else cart[i].qty = roundQty(n, cart[i].unit);
    renderCart();
    renderQuickNew();
  }

  function onPhoneInput() {
    const matches = findCustomers($('ffqPhone').value);
    if (matches.length === 1) {
      matchedId = matches[0].id;
      if (!nameEdited || !$('ffqName').value.trim() || $('ffqName').value === lastAutoName) {
        $('ffqName').value = matches[0].name || '';
        lastAutoName = $('ffqName').value;
        nameEdited = false;
      }
    } else if (!(matchedId && matches.some(c => c.id === matchedId))) matchedId = '';
    renderMatch(matches);
    updateSave();
  }

  function syncPay() {
    document.querySelectorAll('#ffqPay button').forEach(b => b.classList.toggle('active', b.dataset.pay === payChoice));
  }

  async function saveQuick() {
    if (saving) return;
    const phone = $('ffqPhone').value.trim();
    const name = $('ffqName').value.trim();
    const due = $('ffqDue').value;
    if (!cart.length) return toast('Add at least one item');
    if (digits(phone) < 10) return toast('Type the full phone number');
    if (!name) return toast('Type the customer name');
    if (!due) return toast('Choose the ready date');
    const items = cart.map(x => ({ service_id: x.id, description: x.description, quantity: Number(x.qty), unit_price: Number(x.price) }));
    const method = payChoice === 'unpaid' ? null : payChoice;
    saving = true;
    const btn = $('ffqSave');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const { data: id, error } = await sb.rpc('create_order', {
        p_customer_id: resolveCustomer() || null,
        p_customer_name: name,
        p_customer_phone: phone,
        p_due_date: due,
        p_instructions: $('ffqNotes').value.trim(),
        p_items: items,
        p_payment_method: method
      });
      if (error) throw error;
      cart.splice(0, cart.length);
      renderCart();
      $('ffqPhone').value = '';
      $('ffqName').value = '';
      matchedId = '';
      nameEdited = false;
      lastAutoName = '';
      $('ffqNotes').value = '';
      $('ffqNoteBox').classList.add('hidden');
      payChoice = 'unpaid';
      syncPay();
      dueDirty = false;
      renderMatch([]);
      await refreshAll();
      const order = (data.orders || []).find(x => x.id === id);
      if (order) {
        lastOrderId = order.id;
        $('ffqLastText').textContent = 'Saved docket #' + order.order_number;
        $('ffqLast').classList.remove('hidden');
        toast('Docket #' + order.order_number + ' saved');
        try {
          if (typeof printReceiptV09 === 'function') printReceiptV09(order.id);
          else showReceipt(order.id);
        } catch (err) {
          console.error(err);
          showReceipt(order.id);
        }
      } else toast('Docket saved');
    } catch (err) {
      console.error(err);
      toast((err && err.message) || 'Could not save the docket');
    } finally {
      saving = false;
      btn.textContent = 'Save & Print';
      renderQuickNew();
    }
  }

  function itemsSummary(o) {
    return (o.items || []).map(i => (Number(i.quantity) || 0) + ' × ' + (typeof shortDesc === 'function' ? shortDesc(i.description) : i.description)).join(', ');
  }

  function balanceOf(o) {
    const paid = typeof paidFor === 'function' ? Number(paidFor(o.id) || 0) : 0;
    return Math.max(0, Number(o.total) - paid);
  }

  function orderMatches(o, q) {
    const query = String(q || '').trim().toLowerCase();
    if (!query) return true;
    const queryDigits = digits(query);
    return String(o.order_number).toLowerCase().includes(query.replace('#', ''))
      || String(o.customerName || '').toLowerCase().includes(query)
      || (queryDigits.length >= 3 && digits(o.phone).includes(queryDigits));
  }

  function openOrders() {
    return (data.orders || []).filter(o => !['Collected', 'Cancelled'].includes(o.status));
  }

  function cardHtml(o, mode) {
    const bal = balanceOf(o);
    const late = o.due_date && o.due_date < (typeof localDate === 'function' ? localDate() : '');
    const pay = bal > 0.009 && mode === 'collect'
      ? `<button type="button" class="pay" data-collect="${esc(o.id)}" data-method="cash">Cash ${esc(money(bal))}</button>
         <button type="button" class="pay" data-collect="${esc(o.id)}" data-method="card">Card ${esc(money(bal))}</button>
         <button type="button" class="pay" data-collect="${esc(o.id)}" data-method="eft">EFT ${esc(money(bal))}</button>`
      : (mode === 'collect' ? `<button type="button" class="pay" data-collect="${esc(o.id)}" data-method="">Collect</button>` : `<button type="button" class="pay" data-jump="${esc(o.order_number)}">Collect</button>`);
    const ready = mode === 'ready' && o.status !== 'Ready' ? `<button type="button" data-ready="${esc(o.id)}">Mark ready</button>` : '';
    return `<article class="ffq-card${late && o.status !== 'Ready' ? ' late' : ''}">
      <h3>#${esc(o.order_number)} · ${esc(o.customerName || 'Customer')}</h3>
      <p>${esc(o.phone || '')}</p>
      <p>${esc(itemsSummary(o) || 'No items')}</p>
      <p>Ready ${esc(o.due_date ? friendlyDate(o.due_date) : '—')} · ${esc(o.status)} · ${esc(money(bal))} due</p>
      <div class="ffq-actions">${o.status === 'Ready' || mode === 'collect' ? pay : ''}${ready}<button type="button" data-print="${esc(o.id)}">Print</button><button type="button" class="quiet" data-details="${esc(o.id)}">Details</button></div>
    </article>`;
  }

  function renderReady() {
    const host = $('ffqReadyList');
    if (!host) return;
    const q = ($('ffqReadySearch') && $('ffqReadySearch').value || '').trim();
    const open = openOrders().filter(o => orderMatches(o, q)).sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    const ready = open.filter(o => o.status === 'Ready');
    const working = open.filter(o => o.status !== 'Ready');
    host.innerHTML = `<h3 class="ffq-h">Ready to collect (${ready.length})</h3>`
      + (ready.map(o => cardHtml(o, 'ready')).join('') || '<p class="ffq-hint">Nothing is ready for collection.</p>')
      + `<h3 class="ffq-h">Still in the shop (${working.length})</h3>`
      + (working.map(o => cardHtml(o, 'ready')).join('') || '<p class="ffq-hint">No garments in progress.</p>');
    updateReadyBadge();
  }

  function renderCollect() {
    const host = $('ffqCollectList');
    if (!host) return;
    const q = collectQuery.trim();
    let list = openOrders();
    list = q ? list.filter(o => orderMatches(o, q)) : list.filter(o => o.status === 'Ready');
    list.sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
    host.innerHTML = list.length
      ? list.map(o => cardHtml(o, 'collect')).join('')
      : `<p class="ffq-hint">${q ? 'No open docket matches.' : 'Nothing is waiting for collection.'}</p>`;
  }

  async function collectOrder(id, method) {
    if (collecting) return;
    const order = (data.orders || []).find(x => x.id === id);
    if (!order) return;
    collecting = true;
    try {
      const bal = balanceOf(order);
      if (method && bal > 0.009) {
        const pay = await sb.rpc('record_order_payment', { p_order_id: id, p_amount: Number(bal.toFixed(2)), p_method: method });
        if (pay.error) return toast(pay.error.message);
      }
      const collected = await sb.rpc('confirm_order_collection', { p_order_id: id, p_collected_by: order.customerName || 'Customer' });
      if (collected.error) {
        const missing = /function|schema|PGRST202|Could not find the function/i.test(String(collected.error.message || ''));
        if (!missing) {
          await refreshAll();
          return toast(collected.error.message);
        }
        const upd = await sb.from('orders').update({ status: 'Collected' }).eq('id', id);
        if (upd.error) return toast(collected.error.message);
      }
      await refreshAll();
      toast('Collected order #' + order.order_number);
    } catch (err) {
      toast((err && err.message) || 'Could not collect');
    } finally {
      collecting = false;
    }
  }

  function updateReadyBadge() {
    const n = (data.orders || []).filter(o => o.status === 'Ready').length;
    const span = document.querySelector('[data-ffq="ready"] span');
    if (span) span.textContent = n ? 'Ready (' + n + ')' : 'Ready';
  }

  function renderOwner() {
    const host = $('ffqOwnerList');
    if (!host) return;
    const items = [
      ['pins', 'Counter favourites', 'Choose the big buttons on New docket', true],
      ['go:pricebook', 'Price list', 'See and change prices', false],
      ['go:neworder', 'Full sale screen', 'The whole price list, item by item', false],
      ['go:orders', 'All orders', 'Find any docket', false],
      ['go:customers', 'Customers', 'Names and phone numbers', false],
      ['v07:production', 'Production', 'Garments still being cleaned', false],
      ['v07:notifications', 'Alerts', 'Late work and warnings', false],
      ['v07:accounts', 'Accounts', 'Account customers', false],
      ['v07x:quotes', 'Quotes', 'Price estimates', false],
      ['v07x:messages', 'Messages', 'WhatsApp messages waiting to send', false],
      ['v08:stock', 'Stock', 'Hangers, bags and chemicals', false],
      ['v08:staff', 'Staff', 'Who works here, and shifts', false],
      ['v07:reports', 'Reports', 'Sales and costs', true],
      ['v07x:billing', 'Billing', 'Monthly account invoices', true],
      ['v08:business', 'Business', 'Suppliers and shop costs', true],
      ['v08:settings', 'Settings and printers', 'Receipt details and printers', true],
      ['go:dashboard', 'Overview', 'A summary of the shop', false],
      ['diag', 'System check', 'Technical checks for the person who set this up', true]
    ].filter(item => !item[3] || admin());
    host.innerHTML = `<p class="ffq-lead">${admin() ? 'Shop setup and the rest of FreshFlow. The counter is under New.' : 'Other parts of the shop. Taking a docket is under New.'}</p><div class="ffq-menu">`
      + items.map(([action, title, sub]) => `<button type="button" data-action="${esc(action)}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>`).join('')
      + '</div>';
  }

  function openPins() {
    if (!admin()) return toast('Only the owner can change counter items');
    $('ffqPins').classList.remove('hidden');
    renderPins();
    setTimeout(() => $('ffqPinSearch') && $('ffqPinSearch').focus(), 50);
  }

  function renderPins() {
    if (!$('ffqPins') || $('ffqPins').classList.contains('hidden')) return;
    $('ffqDueDays').textContent = String(dueDays());
    const current = counterServices();
    $('ffqPinChips').innerHTML = current.map(s => `<button type="button" data-unpin="${esc(s.id)}">${esc(tileTitle(s, current))} ×</button>`).join('') || '<p class="ffq-hint">No items on the counter yet. Search below to add some.</p>';
    const q = ($('ffqPinSearch').value || '').trim().toLowerCase();
    const shown = new Set(current.map(s => s.id));
    const rows = q ? (data.services || []).filter(s => onCounter(s) && [s.category, s.service_group, s.item_name, s.name].join(' ').toLowerCase().includes(q)).slice(0, 40) : [];
    $('ffqPinResults').innerHTML = !q
      ? '<p class="ffq-hint">Search the price list, then tap Show on the counter.</p>'
      : (rows.map(s => `<div class="ffq-pinrow"><div><strong>${esc(itemLabel(s))}</strong><small>${esc(s.category || '')} · ${esc(s.service_group || '')} · ${esc(priceLabel(s))}</small></div><button type="button" data-pin="${esc(s.id)}" class="${shown.has(s.id) ? 'on' : ''}">${shown.has(s.id) ? 'On counter' : 'Show'}</button></div>`).join('') || '<p class="ffq-hint">Nothing matches. Try another word.</p>');
  }

  function togglePin(id) {
    if (!admin()) return toast('Only the owner can change counter items');
    let ids = counterServices().map(s => s.id);
    if (ids.includes(id)) ids = ids.filter(x => x !== id);
    else if (ids.length >= 12) return toast('The counter holds 12 items. Remove one first.');
    else ids.push(id);
    setPins(ids);
    refreshPinButtons();
    renderPins();
    if ($('ffqNew') && $('ffqNew').classList.contains('active')) renderQuickNew();
  }

  function refreshPinButtons() {
    const shown = new Set(counterServices().map(s => s.id));
    document.querySelectorAll('[data-ffq-pin]').forEach(b => {
      const on = shown.has(b.dataset.ffqPin);
      b.textContent = on ? 'On counter' : 'Add to counter';
      b.classList.toggle('primary', on);
    });
  }

  function enhancePriceBook() {
    if (!admin()) return;
    const bar = document.querySelector('#pricebook .toolbar');
    if (bar && !$('ffqPriceLink')) {
      const link = document.createElement('button');
      link.id = 'ffqPriceLink';
      link.type = 'button';
      link.className = 'btn secondary';
      link.textContent = 'Counter favourites';
      link.addEventListener('click', openPins);
      bar.appendChild(link);
    }
    document.querySelectorAll('#priceBookGrid .priceitem').forEach(el => {
      if (el.querySelector('[data-ffq-pin]')) return;
      const save = el.querySelector('button[onclick*="savePrice"]');
      const match = save && String(save.getAttribute('onclick')).match(/savePrice\('([^']+)'\)/);
      if (!match) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn secondary';
      b.dataset.ffqPin = match[1];
      b.style.marginTop = '8px';
      b.style.fontSize = '16px';
      b.style.padding = '10px 12px';
      b.addEventListener('click', () => togglePin(match[1]));
      el.appendChild(b);
    });
    refreshPinButtons();
  }

  function openSearch() {
    $('ffqSearch').classList.remove('hidden');
    $('ffqSearchInput').value = '';
    renderSearch();
    setTimeout(() => $('ffqSearchInput').focus(), 50);
  }

  function renderSearch() {
    const q = $('ffqSearchInput').value.trim().toLowerCase();
    const host = $('ffqSearchResults');
    if (!q) { host.innerHTML = '<p class="ffq-hint">Type an item, for example shirt or duvet.</p>'; return; }
    const rows = (data.services || []).filter(s => onCounter(s) && [s.category, s.service_group, s.item_name, s.name].join(' ').toLowerCase().includes(q)).slice(0, 30);
    host.innerHTML = rows.length ? rows.map(s => `<button type="button" class="ffq-result" data-add="${esc(s.id)}"><span><strong>${esc(itemLabel(s))}</strong><small>${esc(s.category || '')} · ${esc(s.service_group || '')}</small></span><em>${esc(priceLabel(s))}</em></button>`).join('') : '<p class="ffq-hint">Nothing matches. Try another word.</p>';
  }

  function openSystemCheck() {
    if (!admin()) return toast('Only the owner can run the system check');
    const holder = $('ffqDiagHolder');
    const card = ($('productionChecks') && $('productionChecks').closest('.card')) || (holder && holder.querySelector('.card'));
    if (card && holder) holder.appendChild(card);
    modal.innerHTML = `<div class="modalhead"><div><h2>System check</h2><div class="muted">Technical checks. Counter staff can ignore this.</div></div><button class="btn secondary" type="button" id="ffqDiagClose">Close</button></div><div id="ffqDiagMount"></div>`;
    modalBack.classList.remove('hidden');
    $('ffqDiagClose').onclick = () => { if (card && holder) holder.appendChild(card); closeModal(); };
    if (card) $('ffqDiagMount').appendChild(card);
    if (typeof runProductionChecks === 'function') runProductionChecks();
  }

  function printOrder(id) {
    if (typeof printReceiptV09 === 'function') printReceiptV09(id);
    else if (typeof showReceipt === 'function') showReceipt(id);
  }

  function wire() {
    $('ffqForm').addEventListener('submit', e => { e.preventDefault(); saveQuick(); });
    $('ffqPhone').addEventListener('input', onPhoneInput);
    $('ffqName').addEventListener('input', () => {
      nameEdited = $('ffqName').value !== lastAutoName;
      updateSave();
    });
    $('ffqDue').addEventListener('change', () => { dueDirty = true; refreshDueLabel(); updateSave(); });
    $('ffqPay').addEventListener('click', e => {
      const b = e.target.closest('[data-pay]');
      if (!b) return;
      payChoice = b.dataset.pay;
      syncPay();
    });
    $('ffqNoteToggle').addEventListener('click', () => {
      $('ffqNoteBox').classList.toggle('hidden');
      if (!$('ffqNoteBox').classList.contains('hidden')) $('ffqNotes').focus();
    });
    $('ffqLastPrint').addEventListener('click', () => { if (lastOrderId) printOrder(lastOrderId); });
    $('ffqTiles').addEventListener('click', e => {
      const dec = e.target.closest('[data-dec]');
      if (dec) { e.preventDefault(); e.stopPropagation(); changeQtyById(dec.dataset.dec, -1); return; }
      if (e.target.closest('[data-other]')) return openSearch();
      const add = e.target.closest('[data-add]');
      if (add) { addService(add.dataset.add); renderQuickNew(); }
    });
    $('ffqLines').addEventListener('click', e => {
      const dec = e.target.closest('[data-dec]');
      const inc = e.target.closest('[data-inc]');
      const remove = e.target.closest('[data-remove]');
      if (dec) changeQtyById(dec.dataset.dec, -1);
      if (inc) changeQtyById(inc.dataset.inc, 1);
      if (remove) { const i = cart.findIndex(x => x.id === remove.dataset.remove); if (i >= 0) { cart.splice(i, 1); renderCart(); renderQuickNew(); } }
    });
    $('ffqLines').addEventListener('change', e => {
      const input = e.target.closest('[data-qty]');
      if (input) setQtyById(input.dataset.qty, input.value);
    });
    $('ffqMatch').addEventListener('click', e => {
      const b = e.target.closest('[data-customer]');
      if (!b) return;
      const customer = (data.customers || []).find(c => c.id === b.dataset.customer);
      if (!customer) return;
      matchedId = customer.id;
      $('ffqName').value = customer.name || '';
      lastAutoName = $('ffqName').value;
      nameEdited = false;
      renderMatch([customer]);
      updateSave();
    });
    $('ffqReadySearch').addEventListener('input', renderReady);
    $('ffqCollectSearch').addEventListener('input', () => { collectQuery = $('ffqCollectSearch').value; renderCollect(); });
    $('ffqReadyList').addEventListener('click', onListClick);
    $('ffqCollectList').addEventListener('click', onListClick);
    $('ffqOwnerList').addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const [kind, arg] = b.dataset.action.split(':');
      if (b.dataset.action === 'pins') return openPins();
      if (b.dataset.action === 'diag') return openSystemCheck();
      if (kind === 'go') return window.go(arg);
      if (kind === 'v07' && typeof openV07 === 'function') return openV07(arg);
      if (kind === 'v07x' && typeof openV07Complete === 'function') return openV07Complete(arg);
      if (kind === 'v08' && typeof openV08 === 'function') return openV08(arg);
    });
    $('ffqSearchClose').addEventListener('click', () => $('ffqSearch').classList.add('hidden'));
    $('ffqSearch').addEventListener('click', e => { if (e.target === $('ffqSearch')) $('ffqSearch').classList.add('hidden'); });
    $('ffqSearchInput').addEventListener('input', renderSearch);
    $('ffqSearchResults').addEventListener('click', e => {
      const add = e.target.closest('[data-add]');
      if (!add) return;
      addService(add.dataset.add);
      renderQuickNew();
      toast('Added to the docket');
    });
    $('ffqPinsClose').addEventListener('click', () => $('ffqPins').classList.add('hidden'));
    $('ffqPins').addEventListener('click', e => { if (e.target === $('ffqPins')) $('ffqPins').classList.add('hidden'); });
    $('ffqDueMinus').addEventListener('click', () => setDueDays(dueDays() - 1));
    $('ffqDuePlus').addEventListener('click', () => setDueDays(dueDays() + 1));
    $('ffqPinsReset').addEventListener('click', () => {
      localStorage.removeItem(pinKey());
      refreshPinButtons();
      renderPins();
      renderQuickNew();
      toast('Suggested items are back on the counter');
    });
    $('ffqPinSearch').addEventListener('input', renderPins);
    $('ffqPins').addEventListener('click', e => {
      const pin = e.target.closest('[data-pin]');
      const unpin = e.target.closest('[data-unpin]');
      if (pin) togglePin(pin.dataset.pin);
      if (unpin) togglePin(unpin.dataset.unpin);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      $('ffqSearch').classList.add('hidden');
      $('ffqPins').classList.add('hidden');
    });
  }

  function onListClick(e) {
    const ready = e.target.closest('[data-ready]');
    const collect = e.target.closest('[data-collect]');
    const jump = e.target.closest('[data-jump]');
    const print = e.target.closest('[data-print]');
    const details = e.target.closest('[data-details]');
    if (ready && typeof updateStatus === 'function') return updateStatus(ready.dataset.ready, 'Ready');
    if (collect) return collectOrder(collect.dataset.collect, collect.dataset.method);
    if (jump) {
      collectQuery = String(jump.dataset.jump);
      const input = $('ffqCollectSearch');
      if (input) input.value = collectQuery;
      return window.go('ffqCollect');
    }
    if (print) return printOrder(print.dataset.print);
    if (details && typeof openOrder === 'function') return openOrder(details.dataset.details);
  }

  function applyRoleChrome() {
    const sync = document.querySelector('#pricebook button[onclick="installCatalog()"]');
    if (sync) sync.hidden = !admin();
    const ownerTab = document.querySelector('[data-ffq="owner"] span');
    if (ownerTab) ownerTab.textContent = admin() ? 'Owner' : 'More';
  }

  function showShopLine(screen) {
    const heading = $('pageTitle');
    const name = shopTitle();
    if (heading) {
      let line = $('ffqShopLine');
      if (!line) {
        line = document.createElement('div');
        line.id = 'ffqShopLine';
        line.className = 'ffq-shopline';
        heading.insertAdjacentElement('afterend', line);
      }
      line.textContent = name;
      line.hidden = !name;
    }
    if (name) document.title = screen ? (screen + ' · ' + name) : name;
  }

  function tuneCashup() {
    const btn = document.querySelector('#cashup button.primary');
    if (!btn) return;
    let note = $('ffqCashNote');
    if (admin()) {
      btn.disabled = false;
      btn.textContent = 'Close daily cash up';
      if (note) note.remove();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'The owner closes the till';
    if (!note) {
      note = document.createElement('p');
      note.id = 'ffqCashNote';
      note.className = 'ffq-hint';
      note.textContent = "Today's takings are on this screen. Ask the owner to close the till.";
      btn.insertAdjacentElement('beforebegin', note);
    }
  }

  function enterCounterChrome(id) {
    document.body.classList.add('ff-quick');
    document.body.classList.remove('ff-owner');
    const tab = { ffqNew: 'new', ffqReady: 'ready', ffqCollect: 'collect', ffqOwner: 'owner', cashup: 'cash' }[id];
    const titles = { ffqNew: 'New docket', ffqReady: 'Ready', ffqCollect: 'Collect', ffqOwner: admin() ? 'Owner' : 'More', cashup: 'Cash up' };
    const heading = $('pageTitle');
    if (heading && titles[id]) heading.textContent = titles[id];
    showShopLine(titles[id] || '');
    document.querySelectorAll('[data-ffq]').forEach(b => b.classList.toggle('active', b.dataset.ffq === tab));
    if (id === 'ffqNew') renderQuickNew();
    if (id === 'ffqReady') renderReady();
    if (id === 'ffqCollect') renderCollect();
    if (id === 'ffqOwner') renderOwner();
    if (id === 'cashup') tuneCashup();
    const app = $('app');
    if (app) app.classList.add('ff-booted');
  }

  function enterOwnerChrome(title) {
    document.body.classList.remove('ff-quick');
    document.body.classList.add('ff-owner');
    if (title) {
      const heading = $('pageTitle');
      if (heading) heading.textContent = title;
    }
    showShopLine(title || '');
    document.querySelectorAll('[data-ffq]').forEach(b => b.classList.remove('active'));
    const app = $('app');
    if (app) app.classList.add('ff-booted');
  }

  function refreshVisible() {
    applyRoleChrome();
    updateReadyBadge();
    const heading = $('pageTitle');
    if (heading && document.body.dataset.ffq) showShopLine(heading.textContent || '');
    if ($('ffqNew') && $('ffqNew').classList.contains('active')) renderQuickNew();
    if ($('ffqReady') && $('ffqReady').classList.contains('active')) renderReady();
    if ($('ffqCollect') && $('ffqCollect').classList.contains('active')) renderCollect();
    renderPins();
  }

  function afterData() {
    applyRoleChrome();
    if (!booted && typeof profile !== 'undefined' && profile && profile.id && dataReady) {
      booted = true;
      window.go('ffqNew');
    } else if (booted) refreshVisible();
  }

  function wrap(name, titleFor) {
    const prev = window[name];
    if (typeof prev !== 'function' || prev.__ffq) return;
    const wrapped = function () {
      const title = titleFor && titleFor(arguments[0]);
      enterOwnerChrome(title);
      return prev.apply(this, arguments);
    };
    wrapped.__ffq = true;
    window[name] = wrapped;
  }

  try {
  parkDiagnostics();
  buildShell();
  wire();

  const prevGo = window.go;
  window.go = function (id, btn) {
    document.querySelectorAll('main > section.view').forEach(s => s.classList.remove('hidden'));
    const out = prevGo.apply(this, arguments);
    if (['ffqNew', 'ffqReady', 'ffqCollect', 'ffqOwner', 'cashup'].includes(id)) enterCounterChrome(id);
    else if (['neworder', 'orders', 'customers', 'dashboard', 'pricebook'].includes(id)) enterOwnerChrome();
    return out;
  };

  wrap('openV07', view => ({ production: 'Production', notifications: 'Alerts', accounts: 'Accounts', reports: 'Reports' }[view] || 'Owner'));
  wrap('openV08', view => ({ business: 'Business', stock: 'Stock', staff: 'Staff', settings: 'Settings' }[view] || 'Owner'));
  wrap('openV07Complete', view => ({ quotes: 'Quotes', billing: 'Billing', messages: 'Messages' }[view] || 'Owner'));

  if (typeof window.renderPriceBook === 'function') {
    const prevBook = window.renderPriceBook;
    window.renderPriceBook = function () {
      const out = prevBook.apply(this, arguments);
      try { enhancePriceBook(); } catch (err) { console.error(err); }
      return out;
    };
  }

  if (typeof window.renderCashup === 'function') {
    const prevCash = window.renderCashup;
    window.renderCashup = function () {
      const out = prevCash.apply(this, arguments);
      try { if (document.body.classList.contains('ff-quick')) tuneCashup(); } catch (err) { console.error(err); }
      return out;
    };
  }

  const prevRefresh = window.refreshAll;
  window.refreshAll = async function () {
    try { return await prevRefresh.apply(this, arguments); }
    finally {
      dataReady = true;
      try { afterData(); } catch (err) {
        console.error(err);
        const app = $('app');
        if (app) app.classList.add('ff-booted');
      }
    }
  };

  if (typeof profile !== 'undefined' && profile && profile.id) {
    dataReady = Array.isArray(data.services);
    afterData();
  }
  const bootTimer = setInterval(() => {
    if (booted) { clearInterval(bootTimer); return; }
    if (typeof profile !== 'undefined' && profile && profile.id && (dataReady || (data.services || []).length)) {
      dataReady = true;
      afterData();
    }
  }, 150);
  setTimeout(() => {
    clearInterval(bootTimer);
    if (!booted && typeof profile !== 'undefined' && profile && profile.id) {
      dataReady = true;
      afterData();
    }
  }, 4000);
  } catch (err) {
    console.error('Quick Docket', err);
    const app = $('app');
    if (app) app.classList.add('ff-booted');
  }
})();
