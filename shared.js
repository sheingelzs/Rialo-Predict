/* =====================================================================
   shared.js — RIALO · Global Shared Logic v2.0
   Upgrades:
   - Cinematic loading screen
   - Multi-point cursor trail
   - Better ecosystem state management
   - Magnetic button effect
   - Parallax tilt on cards
   ===================================================================== */

/* ─── GLOBAL STATE ── */
var connAddr   = null;
var connWallet = null;
var chainId    = 1;
var ethPrice   = 3200;
var gasPrice   = 18;
var scActive   = false;

var tokenData = {
  ethereum:        { price: 3200,  chg: 0 },
  bitcoin:         { price: 64000, chg: 0 },
  solana:          { price: 145,   chg: 0 },
  'matic-network': { price: 0.88,  chg: 0 },
  arbitrum:        { price: 1.10,  chg: 0 },
  'avalanche-2':   { price: 38,    chg: 0 },
  chainlink:       { price: 14,    chg: 0 },
  uniswap:         { price: 9,     chg: 0 }
};

var priceHistory = { eth: [], btc: [], sol: [] };

var ecosystemState = {
  energyLevel: 0,
  mood: 'neutral'
};

/* ─── LOADING SCREEN ── */
function initLoader() {
  var loader = document.getElementById('loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loader';
    loader.innerHTML = '<div class="loader-logo">RIALO</div><div class="loader-bar"><div class="loader-fill" id="loaderFill"></div></div><div class="loader-txt">Initializing trust layer...</div>';
    document.body.appendChild(loader);
  }
  var fill = document.getElementById('loaderFill');
  var prog = 0;
  var msgs = ['Connecting to chains...','Loading identity layer...','Scanning protocol nodes...','Initializing trust engine...','Ready'];
  var msgIdx = 0;
  var txtEl = loader.querySelector('.loader-txt');
  var interval = setInterval(function() {
    prog += Math.random() * 18 + 6;
    if (prog >= 100) { prog = 100; clearInterval(interval); }
    if (fill) fill.style.width = prog + '%';
    if (txtEl && msgIdx < msgs.length - 1 && prog > msgIdx * 22 + 20) {
      txtEl.textContent = msgs[msgIdx];
      msgIdx++;
    }
    if (prog >= 100) {
      setTimeout(function() {
        loader.classList.add('out');
        setTimeout(function() { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 700);
      }, 280);
    }
  }, 80);
}

/* ─── PRICE SYSTEM ── */
var _ws            = null;
var _wsReady       = false;
var _wsRetries     = 0;
var _chgSnapshot   = {};

var _BN_MAP = {
  ethusdt:   'ethereum',
  btcusdt:   'bitcoin',
  solusdt:   'solana',
  maticusdt: 'matic-network',
  arbusdt:   'arbitrum',
  avaxusdt:  'avalanche-2',
  linkusdt:  'chainlink',
  uniusdt:   'uniswap'
};

function _pushPriceHistory() {
  var map = { eth:'ethereum', btc:'bitcoin', sol:'solana' };
  ['eth','btc','sol'].forEach(function(k) {
    var v = tokenData[map[k]];
    if (!priceHistory[k]) priceHistory[k] = [];
    priceHistory[k].push(v ? v.price : 0);
    if (priceHistory[k].length > 30) priceHistory[k].shift();
  });
}

function _onPriceUpdate(changed) {
  _pushPriceHistory();
  applyPricesToDom();
  updateEcosystemMood();
  if (changed) triggerFlash(null);
  if (typeof onPricesUpdated === 'function') onPricesUpdated(tokenData);
}

function _startWebSocket() {
  if (_ws) {
    var rs = _ws.readyState;
    if (rs === WebSocket.CONNECTING || rs === WebSocket.OPEN || rs === WebSocket.CLOSING) return;
  }
  var streams = Object.keys(_BN_MAP).map(function(s){ return s + '@miniTicker'; }).join('/');
  var url = 'wss://stream.binance.com:9443/stream?streams=' + streams;
  try { _ws = new WebSocket(url); } catch(e) { _scheduleWsRetry(); return; }
  _ws.onopen = function() { _wsReady = true; _wsRetries = 0; };
  _ws.onmessage = function(e) {
    try {
      var msg = JSON.parse(e.data);
      var d = msg.data || msg;
      var sym = (d.s || '').toLowerCase();
      var id  = _BN_MAP[sym];
      if (!id || !d.c) return;
      var price = parseFloat(d.c);
      var chg   = _chgSnapshot[id] || 0;
      var changed = tokenData[id] && Math.abs(tokenData[id].price - price) > 0.0001;
      tokenData[id] = { price: price, chg: chg };
      if (id === 'ethereum') ethPrice = price;
      _onPriceUpdate(!!changed);
    } catch(err) {}
  };
  _ws.onerror = function() { _wsReady = false; };
  _ws.onclose = function() { _wsReady = false; _scheduleWsRetry(); };
}

function _scheduleWsRetry() {
  _wsRetries++;
  var delay = Math.min(30000, 2000 * Math.pow(2, _wsRetries - 1));
  setTimeout(_startWebSocket, delay);
}

function _fetchBinanceSnapshot() {
  var symbols = ['ETHUSDT','BTCUSDT','SOLUSDT','MATICUSDT','ARBUSDT','AVAXUSDT','LINKUSDT','UNIUSDT'];
  var url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=['
    + symbols.map(function(s){ return '%22' + s + '%22'; }).join(',') + ']';
  return fetch(url)
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(arr) {
      var changed = false;
      arr.forEach(function(d) {
        var id = _BN_MAP[(d.symbol || '').toLowerCase()];
        if (!id) return;
        var price = parseFloat(d.lastPrice);
        var chg   = parseFloat(d.priceChangePercent);
        _chgSnapshot[id] = chg;
        if (tokenData[id] && tokenData[id].price !== price) changed = true;
        tokenData[id] = { price: price, chg: chg };
        if (id === 'ethereum') { ethPrice = price; gasPrice = Math.floor(12 + Math.random()*38); }
      });
      return changed;
    });
}

function _fetchCoinGecko() {
  var url = 'https://api.coingecko.com/api/v3/simple/price'
    + '?ids=ethereum,bitcoin,solana,matic-network,arbitrum,avalanche-2,chainlink,uniswap'
    + '&vs_currencies=usd&include_24hr_change=true';
  return fetch(url)
    .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(data) {
      var changed = false;
      Object.keys(data).forEach(function(id) {
        var p = data[id].usd, c = data[id].usd_24h_change || 0;
        if (tokenData[id] && tokenData[id].price !== p) changed = true;
        tokenData[id] = { price: p, chg: c };
        if (id === 'ethereum') { ethPrice = p; gasPrice = Math.floor(12 + Math.random()*38); }
      });
      return changed;
    });
}

function _applyDrift() {
  ['ethereum','bitcoin','solana','matic-network','arbitrum','avalanche-2','chainlink','uniswap'].forEach(function(id) {
    if (!tokenData[id] || !tokenData[id].price) return;
    var drift = (Math.random() - 0.499) * 0.003;
    tokenData[id] = {
      price: tokenData[id].price * (1 + drift),
      chg:   +(tokenData[id].chg + (Math.random()-0.5)*0.04).toFixed(3)
    };
  });
  if (tokenData.ethereum) ethPrice = tokenData.ethereum.price;
  _pushPriceHistory();
  applyPricesToDom();
  if (typeof onPricesUpdated === 'function') onPricesUpdated(tokenData);
}

function _fetchGasPrice() {
  fetch('https://cloudflare-eth.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_gasPrice', params:[], id:1 })
  })
  .then(function(r){ return r.json(); })
  .then(function(d){
    if (d.result) {
      var gwei = Math.round(parseInt(d.result, 16) / 1e9);
      if (gwei > 0 && gwei < 50000) {
        gasPrice = gwei;
        if (typeof onGasDrift === 'function') onGasDrift(gasPrice);
      }
      ['sw-fee','sw-gas-gwei','gasp','gasp2','gasMain'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.textContent = gasPrice + (id === 'gasMain' ? '' : ' gwei');
      });
    }
  })
  .catch(function(){});
}

var _livePricesLoaded = false;
function applyFallbackPrices() {
  if (_livePricesLoaded) return;
  ethPrice = tokenData.ethereum ? tokenData.ethereum.price : 3200;
  applyPricesToDom();
}

function fetchPrices() {
  _fetchBinanceSnapshot()
    .then(function(changed) {
      _livePricesLoaded = true;
      _onPriceUpdate(changed);
      if (!_wsReady) _startWebSocket();
    })
    .catch(function() {
      _fetchCoinGecko()
        .then(function(changed) {
          _livePricesLoaded = true;
          _onPriceUpdate(changed);
          if (!_wsReady) _startWebSocket();
        })
        .catch(function() {
          if (!_wsReady) _applyDrift();
        });
    });
}

function initPriceStreams() {
  _startWebSocket();
  _fetchGasPrice();
  setInterval(_fetchGasPrice, 15000);
}

/* ─── DOM PRICE ID MAP ── */
var ID_MAP = {
  ethereum:        { p:['ep','ep2','hmp-eth'],    c:['ec','ec2','hmc-eth'] },
  bitcoin:         { p:['bp','bp2','hmp-btc'],    c:['bc','bc2','hmc-btc'] },
  solana:          { p:['sp','sp2','hmp-sol'],    c:['sc','sc2','hmc-sol'] },
  'matic-network': { p:['mp','mp2'],              c:['mc','mc2'] },
  arbitrum:        { p:['ap','ap2'],              c:['ac','ac2'] },
  'avalanche-2':   { p:['avp','avp2'],            c:['avc','avc2'] },
  chainlink:       { p:['lp','lp2'],              c:['lc','lc2'] },
  uniswap:         { p:['up','up2'],              c:['uc','uc2'] }
};

function fmtP(n) {
  if (!n) return '—';
  if (n >= 1000) return '$' + Math.round(n).toLocaleString();
  if (n >= 1)    return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}
function fmtNum(n, d) { return n.toFixed(d !== undefined ? d : 2); }

function applyPricesToDom() {
  Object.keys(ID_MAP).forEach(function(id){
    var d = tokenData[id]; if (!d) return;
    var up = d.chg >= 0;
    ID_MAP[id].p.forEach(function(eid){
      var el = document.getElementById(eid);
      if (el) el.textContent = fmtP(d.price);
    });
    ID_MAP[id].c.forEach(function(eid){
      var el = document.getElementById(eid);
      if (el) {
        el.textContent = (up ? '+' : '') + (d.chg || 0).toFixed(2) + '%';
        var base = el.className.replace(/\b(ti-[ud]|up|dn)\b/g, '').trim();
        el.className = base + ' ' + (up ? (base.indexOf('ti-') >= 0 ? 'ti-u' : 'up') : (base.indexOf('ti-') >= 0 ? 'ti-d' : 'dn'));
      }
    });
  });
  ['gasp','gasp2'].forEach(function(gid){
    var gasEl = document.getElementById(gid);
    if (gasEl && gasPrice) gasEl.textContent = gasPrice;
  });
  updateStatusBarMarket();
}

/* ─── ECOSYSTEM MOOD ── */
var _lastEcoMood = null;
function updateEcosystemMood() {
  var eth = tokenData['ethereum'];
  if (!eth) return;
  var chg = eth.chg || 0;
  var mood = chg > 1.5 ? 'bullish' : chg < -1.5 ? 'bearish' : 'neutral';
  ecosystemState.mood = mood;
  ecosystemState.energyLevel = Math.min(100, Math.abs(chg) * 12);

  var nav    = document.getElementById('mainNav');
  var atmo   = document.getElementById('atmo');
  var nhBar  = document.getElementById('nhBar');
  var pulse  = document.getElementById('navPulse');

  if (nav)  nav.className  = 'energized' + (mood !== 'neutral' ? ' ' + mood : '');
  if (atmo) { atmo.className = mood !== 'neutral' ? mood : ''; atmo.classList.add('energized'); }
  if (nhBar) {
    nhBar.className = 'nh-bar ' + (mood === 'bullish' ? 'nh-bullish' : mood === 'bearish' ? 'nh-alert' : 'nh-neutral');
    nhBar.style.width = (40 + ecosystemState.energyLevel * 0.6) + '%';
  }
  if (pulse) pulse.className = 'npulse' + (mood === 'bullish' ? ' green' : mood === 'bearish' ? ' red' : '');

  if (mood !== _lastEcoMood) {
    _lastEcoMood = mood;
    var msg = mood === 'bullish'
      ? 'ETH +' + (eth.chg || 0).toFixed(2) + '% — Ecosystem bullish ↑'
      : mood === 'bearish'
      ? 'ETH ' + (eth.chg || 0).toFixed(2) + '% — Monitoring correction ↓'
      : 'Ecosystem intelligence online — monitoring 50 chains';
    triggerEcoAlert(msg, mood === 'bullish' ? 'bullish' : mood === 'bearish' ? 'alert' : 'info', 4000);
  }

  if (typeof onMarketUpdate === 'function') onMarketUpdate(tokenData, mood);
}

/* ─── TOAST ── */
var _toastTimer = null;
function toast(msg, dur) {
  var el = document.getElementById('toast'); if (!el) return;
  el.innerHTML = '<span class="tdot"></span>' + msg;
  el.classList.add('on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('on'); }, dur || 2800);
}

/* ─── ECO ALERT ── */
var _ecoTimer = null;
function triggerEcoAlert(msg, type, dur) {
  var wrap  = document.getElementById('ecoAlert');
  var inner = document.getElementById('eaInner');
  var span  = document.getElementById('eaMsg');
  if (!wrap || !inner || !span) return;
  span.textContent = msg;
  inner.className = 'ea-inner ' + (type || 'info');
  wrap.classList.add('show');
  clearTimeout(_ecoTimer);
  _ecoTimer = setTimeout(function(){ wrap.classList.remove('show'); }, dur || 4000);
}

/* ─── FLASH ── */
function triggerFlash(type) {
  var el = document.getElementById('flash'); if (!el) return;
  el.className = type ? type + '-flash go' : 'go';
  setTimeout(function(){ el.className = ''; }, 130);
}

/* ─── STATUS BAR ── */
function showStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  var addr  = document.getElementById('sbAddr');
  var chain = document.getElementById('sbChain');
  var bal   = document.getElementById('sbBal');
  if (addr)  addr.textContent  = connAddr  || '0x0000...0000';
  if (chain) chain.textContent = chainLabel(chainId);
  var isDemoMode = (connWallet === 'Demo Mode');
  if (bal)   bal.textContent   = isDemoMode ? '3.2841 ETH' : '— ETH';
  sb.classList.add('on');
  document.body.classList.add('has-sbar');
  updateStatusBarMarket();
}

function hideStatusBar() {
  var sb = document.getElementById('sbar');
  if (sb) sb.classList.remove('on');
  document.body.classList.remove('has-sbar');
}

function updateStatusBarMarket() {
  var el = document.getElementById('sbMarket'); if (!el) return;
  var items = [
    { k: 'ethereum', sym: 'ETH' },
    { k: 'bitcoin',  sym: 'BTC' }
  ];
  el.innerHTML = items.map(function(it){
    var d = tokenData[it.k] || {}; var up = (d.chg || 0) >= 0;
    return '<span class="sb-mkt-item"><span style="color:var(--txt2)">'
      + it.sym + '</span>'
      + '<span style="color:' + (up ? 'var(--green)' : '#ff5555') + '">'
      + fmtP(d.price) + '</span></span>';
  }).join('');
}

/* ─── CHAIN HELPERS ── */
function chainLabel(id) {
  var m = { 1:'Ethereum Mainnet', 11155111:'Sepolia Testnet', 137:'Polygon Mainnet', 10:'Optimism', 42161:'Arbitrum One', 8453:'Base' };
  return m[id] || 'Unknown Network';
}
function chainShort(id) {
  var m = { 1:'ETH', 11155111:'SEP', 137:'POL', 10:'OP', 42161:'ARB', 8453:'BASE' };
  return m[id] || 'EVM';
}

/* ─── NAV ── */
function initNav(active) {
  var links = document.querySelectorAll('.nlinks a');
  links.forEach(function(a) {
    if (a.getAttribute('data-s') === active) a.classList.add('active');
    else a.classList.remove('active');
  });

  var ham = document.getElementById('hamBtn');
  var navLinks = document.getElementById('navLinks');
  if (ham && navLinks) {
    ham.addEventListener('click', function() {
      ham.classList.toggle('open');
      navLinks.classList.toggle('mob-open');
    });
    navLinks.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        ham.classList.remove('open');
        navLinks.classList.remove('mob-open');
      });
    });
  }

  detectWallets();

  var navBtn = document.getElementById('navBtn');
  if (navBtn) navBtn.addEventListener('click', function() { openWallet(); });

  var saved       = sessionStorage.getItem('rialo_addr');
  var savedWallet = sessionStorage.getItem('rialo_wallet');
  var savedChain  = parseInt(sessionStorage.getItem('rialo_chain') || '1');
  if (saved) {
    connAddr   = saved;
    connWallet = savedWallet || 'Demo Mode';
    chainId    = savedChain  || 1;
    onWalletConnected(connAddr, connWallet, chainId);
  }
}

/* ─── WALLET MODAL ── */
function openWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.add('show');
  setTimeout(function(){ ovl.classList.add('open'); }, 10);
  detectWallets();
}

function closeWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.remove('open');
  setTimeout(function(){ ovl.classList.remove('show'); }, 400);
}

function detectWallets() {
  setTimeout(function() {
    var mm    = !!(window.ethereum && !window.ethereum.isRabby && !window.ethereum.isPhantom);
    var rabby = !!(window.ethereum && window.ethereum.isRabby);
    var okx   = !!window.okxwallet;
    var ph    = !!(window.phantom && window.phantom.ethereum);
    setBadge('mm-st',    mm     ? 'Detected' : 'Not installed', mm);
    setBadge('rabby-st', rabby  ? 'Detected' : 'Not installed', rabby);
    setBadge('okx-st',   okx    ? 'Detected' : 'Not installed', okx);
    setBadge('ph-st',    ph     ? 'Detected' : 'Not installed', ph);
  }, 600);
}

function setBadge(id, text, ok) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = text;
  el.className = 'wo-badge ' + (ok ? 'ok' : 'ok-install');
}

function bindWalletModal() {
  var wmClose = document.getElementById('wmClose');
  if (wmClose) wmClose.addEventListener('click', closeWallet);

  var wovl = document.getElementById('wovl');
  if (wovl) wovl.addEventListener('click', function(e) { if (e.target === wovl) closeWallet(); });

  var optMM = document.getElementById('opt-mm');
  if (optMM) optMM.addEventListener('click', function() {
    if (window.ethereum && !window.ethereum.isRabby) connectEVM(window.ethereum, 'MetaMask');
    else toast('MetaMask not detected — install at metamask.io');
  });

  var optRabby = document.getElementById('opt-rabby');
  if (optRabby) optRabby.addEventListener('click', function() {
    if (window.ethereum && window.ethereum.isRabby) connectEVM(window.ethereum, 'Rabby');
    else toast('Rabby not detected — install the Rabby extension');
  });

  var optOKX = document.getElementById('opt-okx');
  if (optOKX) optOKX.addEventListener('click', function() {
    if (window.okxwallet) connectEVM(window.okxwallet, 'OKX Wallet');
    else toast('OKX Wallet not detected — install from okx.com/web3');
  });

  var optPH = document.getElementById('opt-ph');
  if (optPH) optPH.addEventListener('click', function() {
    if (window.phantom && window.phantom.ethereum) connectEVM(window.phantom.ethereum, 'Phantom');
    else toast('Phantom not detected — install at phantom.com');
  });

  var optDemo = document.getElementById('opt-demo');
  if (optDemo) optDemo.addEventListener('click', function() {
    closeWallet();
    startScan('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'Demo Mode', 1);
  });
}

/* ─── EVM CONNECT ── */
function connectEVM(provider, name) {
  provider.request({ method: 'eth_requestAccounts' }).then(function(accounts) {
    if (!accounts || !accounts[0]) { toast('No account returned'); return; }
    var addr = accounts[0];
    provider.request({ method: 'eth_chainId' }).then(function(cid) {
      closeWallet();
      startScan(addr, name, parseInt(cid, 16));
    }).catch(function() {
      closeWallet();
      startScan(addr, name, 1);
    });
  }).catch(function(err) {
    if (err.code === 4001) toast('Connection cancelled by user');
    else toast('Could not connect — try again');
  });
}

/* ─── SCAN OVERLAY ── */
var _scanPhases = [
  'Resolving ENS identity...',
  'Fetching onchain history...',
  'Calculating trust score...',
  'Analysing governance participation...',
  'Cross-referencing reputation layer...',
  'Building identity constellation...',
  'Trust layer sealed ✓'
];

function startScan(addr, wallet, cid) {
  var sovl  = document.getElementById('sovl');   if (!sovl)  return;
  var title = document.getElementById('scanTitle');
  var phase = document.getElementById('scanPhase');
  var sadr  = document.getElementById('scanAddr');
  var fill  = document.getElementById('spFill');
  var pct   = document.getElementById('spPct');
  var cta   = document.getElementById('scanCta');

  scActive = true;
  sovl.classList.add('show');
  setTimeout(function(){ sovl.classList.add('open'); }, 10);
  if (title) { title.textContent = 'Identity Analysis'; setTimeout(function(){ title.classList.add('in'); }, 200); }
  if (sadr)  { sadr.textContent  = addr; setTimeout(function(){ sadr.classList.add('in'); }, 400); }
  if (cta)   { cta.classList.remove('in'); }

  for (var ni = 0; ni < 7; ni++) {
    (function(i){ setTimeout(function(){
      var sn = document.getElementById('sn' + i); if (!sn) return;
      sn.classList.add('lit');
      if (i === 6) sn.classList.add('gold');
    }, 300 + i * 320); })(ni);
  }

  var phaseIdx = 0;
  function nextPhase() {
    if (phaseIdx >= _scanPhases.length) return;
    if (phase) phase.textContent = _scanPhases[phaseIdx];
    var p = Math.round((phaseIdx + 1) / _scanPhases.length * 100);
    if (fill) fill.style.width = p + '%';
    if (pct)  pct.textContent  = p + '%';
    phaseIdx++;
    if (phaseIdx < _scanPhases.length) setTimeout(nextPhase, 420);
  }
  setTimeout(nextPhase, 500);

  setTimeout(function() {
    connAddr   = addr;
    connWallet = wallet;
    chainId    = cid || 1;
    sessionStorage.setItem('rialo_addr',   connAddr);
    sessionStorage.setItem('rialo_wallet', connWallet);
    sessionStorage.setItem('rialo_chain',  chainId);
    onWalletConnected(addr, wallet, cid);
    if (cta) cta.classList.add('in');
  }, _scanPhases.length * 420 + 600);
}

function closeScan() {
  var sovl = document.getElementById('sovl'); if (!sovl) return;
  scActive = false;
  sovl.classList.remove('open');
  setTimeout(function(){ sovl.classList.remove('show'); }, 500);
  for (var i = 0; i < 7; i++) {
    var sn = document.getElementById('sn' + i);
    if (sn) sn.classList.remove('lit', 'gold');
  }
  var title = document.getElementById('scanTitle');
  var sadr  = document.getElementById('scanAddr');
  var cta   = document.getElementById('scanCta');
  if (title) title.classList.remove('in');
  if (sadr)  sadr.classList.remove('in');
  if (cta)   cta.classList.remove('in');
}

function bindDiscButton() {
  var disc = document.getElementById('discBtn');
  if (disc) disc.addEventListener('click', disconnect);

  var scanCta = document.getElementById('scanCta');
  if (scanCta) scanCta.addEventListener('click', function() {
    closeScan();
    if (window.location.pathname.indexOf('identity') === -1) {
      window.location.href = 'identity.html';
    }
  });
}

/* ─── WALLET CONNECTED ── */
function onWalletConnected(addr, wallet, cid) {
  var navBtn   = document.getElementById('navBtn');
  var navLbl   = document.getElementById('navLbl');
  if (navBtn) navBtn.classList.add('connected');
  if (navLbl) navLbl.textContent = addr.slice(0,6) + '…' + addr.slice(-4);

  var nchain    = document.getElementById('nchain');
  var nchainlbl = document.getElementById('nchainlbl');
  if (nchain)    nchain.classList.add('on');
  if (nchainlbl) nchainlbl.textContent = chainShort(cid);

  showStatusBar();
  triggerEcoAlert('Identity verified ✓ — ' + (wallet || 'Wallet') + ' connected', 'bullish', 3500);
  triggerFlash('green-flash');
  toast('Connected — ' + addr.slice(0,6) + '…' + addr.slice(-4));

  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── DISCONNECT ── */
function disconnect() {
  connAddr   = null;
  connWallet = null;
  sessionStorage.removeItem('rialo_addr');
  sessionStorage.removeItem('rialo_wallet');
  sessionStorage.removeItem('rialo_chain');

  var navBtn = document.getElementById('navBtn');
  var navLbl = document.getElementById('navLbl');
  var nchain = document.getElementById('nchain');
  if (navBtn) navBtn.classList.remove('connected');
  if (navLbl) navLbl.textContent = 'Connect Wallet';
  if (nchain) nchain.classList.remove('on');

  hideStatusBar();
  toast('Disconnected');
  triggerEcoAlert('Wallet disconnected — identity session ended', 'info', 3000);
  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── BG CANVAS ── */
var _bgC = null, _bgX = null, _bgNodes = [];
function initBgCanvas() {
  _bgC = document.getElementById('BG'); if (!_bgC) return;
  _bgX = _bgC.getContext('2d');
  _rBg();
  window.addEventListener('resize', _rBg);
  for (var i = 0; i < 32; i++) {
    _bgNodes.push({
      x: Math.random() * (window.innerWidth  || 1400),
      y: Math.random() * (window.innerHeight || 800),
      vx: (Math.random() - 0.5) * 0.10,
      vy: (Math.random() - 0.5) * 0.10,
      r:  Math.random() * 2 + 0.5,
      p:  Math.random() * Math.PI * 2,
      gold: Math.random() < 0.08
    });
  }
}
function _rBg() {
  if (!_bgC) return;
  _bgC.width  = window.innerWidth;
  _bgC.height = window.innerHeight;
}
function drawBg() {
  if (!_bgC || !_bgX) return;
  var W = _bgC.width, H = _bgC.height;
  _bgX.clearRect(0, 0, W, H);
  var em = 1 + ecosystemState.energyLevel / 500;
  _bgNodes.forEach(function(n) {
    n.p += 0.005; n.x += n.vx * em; n.y += n.vy * em;
    if (n.x < 0) n.x = W; if (n.x > W) n.x = 0;
    if (n.y < 0) n.y = H; if (n.y > H) n.y = 0;
    var a = (Math.sin(n.p) * 0.5 + 0.5) * 0.20 + 0.04;
    _bgX.beginPath();
    _bgX.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    _bgX.fillStyle = n.gold ? 'rgba(212,168,50,' + a + ')' : 'rgba(0,212,232,' + a + ')';
    _bgX.fill();
  });
  for (var i = 0; i < _bgNodes.length; i++) {
    for (var j = i + 1; j < _bgNodes.length; j++) {
      var dx = _bgNodes[i].x - _bgNodes[j].x;
      var dy = _bgNodes[i].y - _bgNodes[j].y;
      var d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 200) {
        _bgX.beginPath();
        _bgX.strokeStyle = 'rgba(0,212,232,' + (1 - d / 200) * 0.048 + ')';
        _bgX.lineWidth = 0.4;
        _bgX.moveTo(_bgNodes[i].x, _bgNodes[i].y);
        _bgX.lineTo(_bgNodes[j].x, _bgNodes[j].y);
        _bgX.stroke();
      }
    }
  }
}

/* ─── HEX CANVAS ── */
var _hexC = null, _hexX = null;
function initHexCanvas() {
  _hexC = document.getElementById('hexC'); if (!_hexC) return;
  _hexX = _hexC.getContext('2d');
}
function drawHex(t) {
  if (!_hexC || !_hexX) return;
  var W = _hexC.width, H = _hexC.height;
  _hexX.clearRect(0, 0, W, H);
  var cx = W / 2, cy = H / 2, r = 62;
  var sides = 6, a0 = t * 0.0006;
  [1.0, 0.72, 0.44].forEach(function(scale, ki) {
    _hexX.beginPath();
    for (var s = 0; s <= sides; s++) {
      var angle = (s / sides) * Math.PI * 2 + a0 * (ki % 2 === 0 ? 1 : -1);
      var px = cx + Math.cos(angle) * r * scale;
      var py = cy + Math.sin(angle) * r * scale;
      s === 0 ? _hexX.moveTo(px, py) : _hexX.lineTo(px, py);
    }
    _hexX.strokeStyle = 'rgba(0,212,232,' + (0.24 - ki * 0.07) + ')';
    _hexX.lineWidth = 0.9;
    _hexX.stroke();
  });
  var ga = Math.sin(t * 0.002) * 0.5 + 0.5;
  _hexX.beginPath();
  _hexX.arc(cx, cy, 8 + ga * 3.5, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(0,212,232,' + (0.62 + ga * 0.36) + ')';
  _hexX.shadowBlur = 20;
  _hexX.shadowColor = 'rgba(0,212,232,0.8)';
  _hexX.fill();
  _hexX.shadowBlur = 0;
  var oa = t * 0.0018;
  var ox = cx + Math.cos(oa) * 44;
  var oy = cy + Math.sin(oa) * 44;
  _hexX.beginPath();
  _hexX.arc(ox, oy, 3, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(212,168,50,0.95)';
  _hexX.shadowBlur = 10;
  _hexX.shadowColor = 'rgba(212,168,50,0.8)';
  _hexX.fill();
  _hexX.shadowBlur = 0;
}

/* ─── CURSOR ── */
var _cur = null, _cur2 = null, _mx = 0, _my = 0, _tx = 0, _ty = 0;
var _trailDots = [];
var _trailMax = 6;

function _bindHoverEl(el) {
  if (el._rialoCurBound) return;
  el._rialoCurBound = true;
  el.addEventListener('mouseenter', function() {
    document.body.classList.add('chl');
    /* Magnetic effect on buttons */
    if (el.matches('.btn,.btn-ghost')) {
      el._magBound = true;
    }
  });
  el.addEventListener('mouseleave', function() {
    document.body.classList.remove('chl');
    if (el._magBound) {
      el.style.transform = '';
      el._magBound = false;
    }
  });
  if (el.matches('.btn,.btn-ghost')) {
    el.addEventListener('mousemove', function(e) {
      var rect = el.getBoundingClientRect();
      var dx = e.clientX - (rect.left + rect.width/2);
      var dy = e.clientY - (rect.top + rect.height/2);
      el.style.transform = 'translate(' + dx*0.12 + 'px,' + dy*0.14 + 'px)';
    });
  }
}

function initCursor() {
  _cur  = document.getElementById('CUR');
  _cur2 = document.getElementById('CUR2');
  if (!_cur || !_cur2) return;

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer:coarse)').matches) return;

  /* Create trail dots */
  for (var ti = 0; ti < _trailMax; ti++) {
    var dot = document.createElement('div');
    dot.className = 'cur-trail';
    var sz = 5 - ti * 0.6;
    dot.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;opacity:' + (0.5 - ti * 0.07);
    document.body.appendChild(dot);
    _trailDots.push({ el: dot, x: 0, y: 0, tx: 0, ty: 0, delay: ti * 0.06 + 0.04 });
  }

  document.addEventListener('mousemove', function(e) {
    _mx = e.clientX; _my = e.clientY;
    _cur.style.left = _mx + 'px';
    _cur.style.top  = _my + 'px';
  });
  document.addEventListener('mousedown', function() { document.body.classList.add('cclick'); });
  document.addEventListener('mouseup',   function() { document.body.classList.remove('cclick'); });

  document.querySelectorAll('a,button,.wo,[onclick]').forEach(_bindHoverEl);

  var _mo = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('a,button,.wo,[onclick]')) _bindHoverEl(node);
        if (node.querySelectorAll) {
          node.querySelectorAll('a,button,.wo,[onclick]').forEach(_bindHoverEl);
        }
      });
    });
  });
  _mo.observe(document.body, { childList: true, subtree: true });

  /* Lagged trailing cursor + trail animation */
  (function animCur() {
    _tx += (_mx - _tx) * 0.13;
    _ty += (_my - _ty) * 0.13;
    _cur2.style.left = _tx + 'px';
    _cur2.style.top  = _ty + 'px';

    /* Trail dots */
    var px = _mx, py = _my;
    _trailDots.forEach(function(td, i) {
      td.tx += (px - td.tx) * (0.22 - i * 0.025);
      td.ty += (py - td.ty) * (0.22 - i * 0.025);
      td.el.style.left = td.tx + 'px';
      td.el.style.top  = td.ty + 'px';
      px = td.tx; py = td.ty;
    });

    requestAnimationFrame(animCur);
  })();
}

/* ─── RIPPLE ── */
function initRipple() {
  document.querySelectorAll('.btn,.btn-ghost').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var r = btn.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var sz = Math.max(r.width, r.height) * 2;
      var rp = document.createElement('div');
      rp.className = 'btn-ripple';
      rp.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (x - sz/2) + 'px;top:' + (y - sz/2) + 'px';
      btn.querySelectorAll('.btn-ripple').forEach(function(old){ old.remove(); });
      btn.appendChild(rp);
      setTimeout(function(){ rp.remove(); }, 650);
    });
  });
}

/* ─── SCROLL REVEAL ── */
function initReveal() {
  var els = document.querySelectorAll('.rv');
  if (!els.length) return;
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e, idx) {
        if (e.isIntersecting) {
          /* stagger siblings */
          var delay = 0;
          var siblings = e.target.parentElement ? e.target.parentElement.querySelectorAll('.rv:not(.in)') : [];
          siblings.forEach(function(sib, i) { if (sib === e.target) delay = i * 60; });
          setTimeout(function() { e.target.classList.add('in'); }, delay);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.10 });
    els.forEach(function(el) { obs.observe(el); });
  } else {
    els.forEach(function(el) { el.classList.add('in'); });
  }
}

/* ─── CARD TILT ── */
function initCardTilt() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  document.querySelectorAll('.wcard,.dev-card,.fc,.mc,.id-live-card').forEach(function(card) {
    card.addEventListener('mousemove', function(e) {
      var r = card.getBoundingClientRect();
      var cx = r.left + r.width/2, cy = r.top + r.height/2;
      var dx = (e.clientX - cx) / r.width;
      var dy = (e.clientY - cy) / r.height;
      card.style.transform = 'translateY(-3px) perspective(800px) rotateX(' + (-dy * 4) + 'deg) rotateY(' + (dx * 4) + 'deg)';
    });
    card.addEventListener('mouseleave', function() {
      card.style.transform = '';
    });
  });
}

/* ─── GRID PATTERN ── */
function initGridPattern() {
  var el = document.createElement('div');
  el.id = 'gridPat';
  document.body.insertBefore(el, document.body.firstChild);
}
