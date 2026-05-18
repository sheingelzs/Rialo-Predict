/* =====================================================================
   shared.js — RIALO · Global Shared Logic v3.0
   FIXES:
   - Cursor fully rebuilt — smooth, no jitter, trail works
   - Wallet connect fixed — MetaMask, Demo, chain switching
   - WebSocket retry capped at 10
   - onMarketUpdate guarded with typeof
   - sessionStorage sanitized
   - initLoader() guarded
   - Scan overlay cancel button
   - Real-time price streaming via Binance WS + CoinGecko fallback
   ===================================================================== */

/* ─── GLOBAL STATE ─────────────────────────────────────────────────── */
var connAddr   = null;
var connWallet = null;
var chainId    = 1;
var ethPrice   = 3482;
var gasPrice   = 18;
var scActive   = false;

var tokenData = {
  ethereum:        { price: 3482,   chg: 0 },
  bitcoin:         { price: 104221, chg: 0 },
  solana:          { price: 182.40, chg: 0 },
  'matic-network': { price: 0.892,  chg: 0 },
  arbitrum:        { price: 1.24,   chg: 0 },
  'avalanche-2':   { price: 38.50,  chg: 0 },
  chainlink:       { price: 18.34,  chg: 0 },
  uniswap:         { price: 9.20,   chg: 0 }
};

var priceHistory = { eth: [], btc: [], sol: [], matic: [], arb: [], link: [] };
var ecosystemState = { energyLevel: 0, mood: 'neutral' };
var MAX_HIST = 30;

/* ─── LOADING SCREEN ────────────────────────────────────────────────── */
function initLoader() {
  if (window._loaderInit) return;
  window._loaderInit = true;

  var loader = document.getElementById('loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.id = 'loader';
    loader.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#020408;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;font-family:Orbitron,monospace;';
    loader.innerHTML =
      '<div class="loader-logo" style="font-size:28px;font-weight:900;color:#00d4e8;letter-spacing:.2em;text-shadow:0 0 30px rgba(0,212,232,.6)">RIALO</div>' +
      '<div class="loader-bar" style="width:260px;height:2px;background:rgba(0,212,232,.1);border-radius:2px;overflow:hidden">' +
        '<div class="loader-fill" id="loaderFill" style="height:100%;width:0%;background:linear-gradient(90deg,#00d4e8,#7c3aff);border-radius:2px;transition:width .1s"></div>' +
      '</div>' +
      '<div class="loader-txt" style="font-family:Space Mono,monospace;font-size:8px;letter-spacing:.15em;color:rgba(0,212,232,.5)">Initializing trust layer...</div>';
    document.body.appendChild(loader);
  }

  var fill = document.getElementById('loaderFill');
  var prog = 0;
  var msgs = ['Connecting to chains...','Loading identity layer...','Scanning protocol nodes...','Initializing trust engine...','Fetching live data...','Ready ✓'];
  var msgIdx = 0;
  var txtEl = loader.querySelector('.loader-txt');

  var interval = setInterval(function () {
    prog += Math.random() * 16 + 5;
    if (prog >= 100) { prog = 100; clearInterval(interval); }
    if (fill) fill.style.width = prog + '%';
    if (txtEl && msgIdx < msgs.length - 1 && prog > msgIdx * 18 + 15) {
      txtEl.textContent = msgs[Math.min(msgIdx, msgs.length - 1)];
      msgIdx++;
    }
    if (prog >= 100) {
      setTimeout(function () {
        loader.style.transition = 'opacity .6s';
        loader.style.opacity = '0';
        setTimeout(function () { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 650);
      }, 300);
    }
  }, 70);
}

/* ─── PRICE SYSTEM ──────────────────────────────────────────────────── */
var _ws = null, _wsReady = false, _wsRetries = 0, _WS_MAX = 10;
var _chgSnapshot = {};

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

var _HIST_MAP = {
  ethereum:        'eth',
  bitcoin:         'btc',
  solana:          'sol',
  'matic-network': 'matic',
  arbitrum:        'arb',
  chainlink:       'link'
};

function _pushPriceHistory() {
  Object.keys(_HIST_MAP).forEach(function (id) {
    var hk = _HIST_MAP[id];
    var d  = tokenData[id];
    if (!d || !d.price) return;
    if (!priceHistory[hk]) priceHistory[hk] = [];
    priceHistory[hk].push(d.price);
    if (priceHistory[hk].length > MAX_HIST) priceHistory[hk].shift();
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
  if (_wsRetries >= _WS_MAX) return;
  if (_ws) {
    var rs = _ws.readyState;
    if (rs === 0 || rs === 1 || rs === 2) return;
  }
  var streams = Object.keys(_BN_MAP).map(function (s) { return s + '@miniTicker'; }).join('/');
  try { _ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams); }
  catch (e) { _scheduleWsRetry(); return; }

  _ws.onopen    = function () { _wsReady = true; _wsRetries = 0; };
  _ws.onmessage = function (e) {
    try {
      var msg = JSON.parse(e.data);
      var d   = msg.data || msg;
      var sym = (d.s || '').toLowerCase();
      var id  = _BN_MAP[sym];
      if (!id || !d.c) return;
      var price   = parseFloat(d.c);
      var chg     = _chgSnapshot[id] || 0;
      var changed = !!(tokenData[id] && Math.abs(tokenData[id].price - price) > 0.001);
      tokenData[id] = { price: price, chg: chg };
      if (id === 'ethereum') { ethPrice = price; }
      _onPriceUpdate(changed);
    } catch (err) {}
  };
  _ws.onerror = function () { _wsReady = false; };
  _ws.onclose = function () { _wsReady = false; _scheduleWsRetry(); };
}

function _scheduleWsRetry() {
  if (_wsRetries >= _WS_MAX) return;
  _wsRetries++;
  var delay = Math.min(30000, 2000 * Math.pow(2, _wsRetries - 1));
  setTimeout(_startWebSocket, delay);
}

function _fetchBinanceSnapshot() {
  var symbols = ['ETHUSDT','BTCUSDT','SOLUSDT','MATICUSDT','ARBUSDT','AVAXUSDT','LINKUSDT','UNIUSDT'];
  var url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=[' +
    symbols.map(function (s) { return '%22' + s + '%22'; }).join(',') + ']';
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (arr) {
      var changed = false;
      arr.forEach(function (d) {
        var id  = _BN_MAP[(d.symbol || '').toLowerCase()];
        if (!id) return;
        var price = parseFloat(d.lastPrice);
        var chg   = parseFloat(d.priceChangePercent);
        _chgSnapshot[id] = chg;
        if (tokenData[id] && tokenData[id].price !== price) changed = true;
        tokenData[id] = { price: price, chg: chg };
        if (id === 'ethereum') { ethPrice = price; gasPrice = Math.floor(12 + Math.random() * 38); }
      });
      return changed;
    });
}

function _fetchCoinGecko() {
  var url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana,matic-network,arbitrum,avalanche-2,chainlink,uniswap&vs_currencies=usd&include_24hr_change=true';
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var changed = false;
      Object.keys(data).forEach(function (id) {
        var p = data[id].usd, c = data[id].usd_24h_change || 0;
        if (tokenData[id] && tokenData[id].price !== p) changed = true;
        tokenData[id] = { price: p, chg: c };
        if (id === 'ethereum') { ethPrice = p; gasPrice = Math.floor(12 + Math.random() * 38); }
      });
      return changed;
    });
}

function _applyDrift() {
  Object.keys(tokenData).forEach(function (id) {
    if (!tokenData[id] || !tokenData[id].price) return;
    var drift = (Math.random() - 0.499) * 0.0025;
    tokenData[id] = {
      price: tokenData[id].price * (1 + drift),
      chg:   +(tokenData[id].chg + (Math.random() - 0.5) * 0.05).toFixed(3)
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
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.result) {
      var gwei = Math.round(parseInt(d.result, 16) / 1e9);
      if (gwei > 0 && gwei < 50000) {
        gasPrice = gwei;
        if (typeof onGasDrift === 'function') onGasDrift(gasPrice);
        ['sw-fee','sw-gas-gwei','gasp','gasp2','gasMain'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.textContent = gasPrice + (id === 'gasMain' ? '' : ' gwei');
        });
      }
    }
  }).catch(function () {});
}

var _livePricesLoaded = false;
function applyFallbackPrices() {
  if (_livePricesLoaded) return;
  ethPrice = tokenData.ethereum ? tokenData.ethereum.price : 3482;
  applyPricesToDom();
}

function fetchPrices() {
  _fetchBinanceSnapshot()
    .then(function (changed) {
      _livePricesLoaded = true;
      _onPriceUpdate(changed);
      if (!_wsReady) _startWebSocket();
    })
    .catch(function () {
      _fetchCoinGecko()
        .then(function (changed) {
          _livePricesLoaded = true;
          _onPriceUpdate(changed);
          if (!_wsReady) _startWebSocket();
        })
        .catch(function () {
          if (!_wsReady) _applyDrift();
          setInterval(_applyDrift, 8000);
        });
    });
}

function initPriceStreams() {
  fetchPrices();
  _fetchGasPrice();
  setInterval(_fetchGasPrice, 15000);
  setInterval(fetchPrices, 30000);
  setInterval(function () {
    if (!_wsReady) _applyDrift();
  }, 6000);
}

/* ─── DOM PRICE MAP ─────────────────────────────────────────────────── */
var ID_MAP = {
  ethereum:        { p: ['ep','ep2','hmp-eth'],    c: ['ec','ec2','hmc-eth'] },
  bitcoin:         { p: ['bp','bp2','hmp-btc'],    c: ['bc','bc2','hmc-btc'] },
  solana:          { p: ['sp','sp2','hmp-sol'],    c: ['sc','sc2','hmc-sol'] },
  'matic-network': { p: ['mp','mp2'],              c: ['mc','mc2'] },
  arbitrum:        { p: ['ap','ap2'],              c: ['ac','ac2'] },
  'avalanche-2':   { p: ['avp','avp2'],            c: ['avc','avc2'] },
  chainlink:       { p: ['lp','lp2'],              c: ['lc','lc2'] },
  uniswap:         { p: ['up','up2'],              c: ['uc','uc2'] }
};

function fmtP(n) {
  if (!n || isNaN(n)) return '$—';
  if (n >= 1000) return '$' + Math.round(n).toLocaleString();
  if (n >= 1)    return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}
function fmtNum(n, d) { return (n || 0).toFixed(d !== undefined ? d : 2); }

function applyPricesToDom() {
  Object.keys(ID_MAP).forEach(function (id) {
    var d = tokenData[id]; if (!d) return;
    var up = (d.chg || 0) >= 0;
    ID_MAP[id].p.forEach(function (eid) {
      var el = document.getElementById(eid);
      if (el) el.textContent = fmtP(d.price);
    });
    ID_MAP[id].c.forEach(function (eid) {
      var el = document.getElementById(eid);
      if (!el) return;
      el.textContent = (up ? '+' : '') + (d.chg || 0).toFixed(2) + '%';
      el.className = el.className.replace(/\b(up|dn|ti-u|ti-d)\b/g, '').trim();
      el.className += ' ' + (el.className.indexOf('ti-') >= 0 ? (up ? 'ti-u' : 'ti-d') : (up ? 'up' : 'dn'));
    });
  });
  ['gasp','gasp2'].forEach(function (gid) {
    var el = document.getElementById(gid);
    if (el && gasPrice) el.textContent = gasPrice;
  });
  updateStatusBarMarket();
}

/* ─── ECOSYSTEM MOOD ────────────────────────────────────────────────── */
var _lastEcoMood = null;
function updateEcosystemMood() {
  var eth = tokenData['ethereum']; if (!eth) return;
  var chg  = eth.chg || 0;
  var mood = chg > 1.5 ? 'bullish' : chg < -1.5 ? 'bearish' : 'neutral';
  ecosystemState.mood = mood;
  ecosystemState.energyLevel = Math.min(100, Math.abs(chg) * 12);
  if (mood !== _lastEcoMood) {
    _lastEcoMood = mood;
    var msg = mood === 'bullish'
      ? 'ETH +' + chg.toFixed(2) + '% — Ecosystem bullish ↑'
      : mood === 'bearish'
      ? 'ETH ' + chg.toFixed(2) + '% — Monitoring correction ↓'
      : 'Ecosystem intelligence online — monitoring all chains';
    triggerEcoAlert(msg, mood === 'bullish' ? 'bullish' : mood === 'bearish' ? 'alert' : 'info', 4000);
  }
  if (typeof onMarketUpdate === 'function') onMarketUpdate(tokenData, mood);
}

/* ─── TOAST ─────────────────────────────────────────────────────────── */
var _toastTimer = null;
function toast(msg, dur) {
  var el = document.getElementById('toast'); if (!el) return;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:8px"><span style="width:5px;height:5px;border-radius:50%;background:var(--c,#00d4e8);animation:pulse 1.5s infinite;flex-shrink:0"></span>' + msg + '</div>';
  el.classList.add('on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.classList.remove('on'); }, dur || 2800);
}

/* ─── ECO ALERT ─────────────────────────────────────────────────────── */
var _ecoTimer = null;
function triggerEcoAlert(msg, type, dur) {
  var wrap  = document.getElementById('ecoAlert');
  var inner = document.getElementById('eaInner');
  var span  = document.getElementById('eaMsg');
  if (!wrap || !inner || !span) return;
  span.textContent = msg;
  inner.className  = 'ea-inner ' + (type || 'info');
  wrap.classList.add('show');
  clearTimeout(_ecoTimer);
  _ecoTimer = setTimeout(function () { wrap.classList.remove('show'); }, dur || 4000);
}

/* ─── FLASH ─────────────────────────────────────────────────────────── */
function triggerFlash(type) {
  var el = document.getElementById('flash'); if (!el) return;
  el.className = (type || '') + ' go';
  setTimeout(function () { el.className = ''; }, 130);
}

/* ─── STATUS BAR ────────────────────────────────────────────────────── */
function showStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  var addr  = document.getElementById('sbAddr');
  var chain = document.getElementById('sbChain');
  var bal   = document.getElementById('sbBal');
  if (addr)  addr.textContent  = connAddr ? (connAddr.slice(0, 6) + '...' + connAddr.slice(-4)) : '0x0000...0000';
  if (chain) chain.textContent = chainLabel(chainId);
  if (bal)   bal.textContent   = connWallet === 'Demo Mode' ? '3.2841 ETH' : '— ETH';
  updateStatusBarMarket();
}

function hideStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  var addr  = document.getElementById('sbAddr');
  var chain = document.getElementById('sbChain');
  if (addr)  addr.textContent  = '0x0000...0000';
  if (chain) chain.textContent = 'Ethereum Mainnet';
}

function updateStatusBarMarket() {
  var el = document.getElementById('sbMarket'); if (!el) return;
  var items = [{ k: 'ethereum', sym: 'ETH' }, { k: 'bitcoin', sym: 'BTC' }];
  el.innerHTML = items.map(function (it) {
    var d  = tokenData[it.k] || {};
    var up = (d.chg || 0) >= 0;
    return '<span style="display:flex;align-items:center;gap:5px;margin-right:12px">' +
      '<span style="color:var(--txt2,rgba(255,255,255,.4))">' + it.sym + '</span>' +
      '<span style="color:' + (up ? '#10b981' : '#ef4444') + '">' + fmtP(d.price) + '</span>' +
      '<span style="font-size:7px;color:' + (up ? '#10b981' : '#ef4444') + '">' + (up ? '+' : '') + (d.chg || 0).toFixed(2) + '%</span>' +
    '</span>';
  }).join('');
}

/* ─── CHAIN HELPERS ─────────────────────────────────────────────────── */
function chainLabel(id) {
  var m = { 1:'Ethereum Mainnet', 11155111:'Sepolia Testnet', 137:'Polygon Mainnet', 10:'Optimism', 42161:'Arbitrum One', 8453:'Base' };
  return m[parseInt(id)] || m[id] || 'Ethereum Mainnet';
}
function chainShort(id) {
  var m = { 1:'ETH', 11155111:'SEP', 137:'POL', 10:'OP', 42161:'ARB', 8453:'BASE' };
  return m[parseInt(id)] || m[id] || 'ETH';
}

/* ─── NAV ───────────────────────────────────────────────────────────── */
function initNav(active) {
  document.querySelectorAll('.nlinks a, .nav-links a').forEach(function (a) {
    var ds = a.getAttribute('data-s') || '';
    var hr = a.getAttribute('href') || '';
    var isActive = ds === active || hr.indexOf(active + '.html') !== -1;
    if (isActive) a.classList.add('active');
    else a.classList.remove('active');
  });

  var ham = document.getElementById('hamBtn');
  var navLinks = document.getElementById('navLinks') || document.querySelector('.nav-links');
  if (ham && navLinks) {
    ham.addEventListener('click', function () {
      ham.classList.toggle('open');
      navLinks.classList.toggle('mob-open');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('nav')) {
        ham.classList.remove('open');
        navLinks.classList.remove('mob-open');
      }
    });
  }

  bindWalletModal();
  detectWallets();

  var navBtn = document.getElementById('navBtn');
  if (navBtn) {
    navBtn.addEventListener('click', function () { openWallet(); });
  }

  /* Restore session */
  var saved  = sessionStorage.getItem('rialo_addr');
  var savedW = sessionStorage.getItem('rialo_wallet');
  var savedC = parseInt(sessionStorage.getItem('rialo_chain') || '1');
  if (saved) {
    var cleanAddr = (saved || '').replace(/[^0-9a-fA-Fx.]/g, '').slice(0, 42);
    if (cleanAddr.length >= 10) {
      connAddr   = cleanAddr;
      connWallet = savedW || 'Demo Mode';
      chainId    = savedC || 1;
      onWalletConnected(connAddr, connWallet, chainId);
    }
  }
}

/* ─── WALLET MODAL ──────────────────────────────────────────────────── */
function openWallet() {
  var ovl = document.getElementById('wovl');
  if (!ovl) { startDemoMode(); return; }
  ovl.style.display = 'flex';
  setTimeout(function () { ovl.classList.add('open'); }, 10);
  detectWallets();
}

function closeWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.remove('open');
  setTimeout(function () { ovl.style.display = 'none'; }, 400);
}

function startDemoMode() {
  startScan('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 'Demo Mode', 1);
}

function detectWallets() {
  setTimeout(function () {
    var mm    = !!(window.ethereum && !window.ethereum.isRabby && !window.ethereum.isPhantom);
    var rabby = !!(window.ethereum && window.ethereum.isRabby);
    var okx   = !!window.okxwallet;
    var ph    = !!(window.phantom && window.phantom.ethereum);
    setBadge('mm-st',    mm    ? 'Detected' : 'Install', mm);
    setBadge('rabby-st', rabby ? 'Detected' : 'Install', rabby);
    setBadge('okx-st',   okx   ? 'Detected' : 'Install', okx);
    setBadge('ph-st',    ph    ? 'Detected' : 'Install', ph);
  }, 400);
}

function setBadge(id, text, ok) {
  var el = document.getElementById(id); if (!el) return;
  el.textContent = text;
  el.style.color  = ok ? '#10b981' : 'rgba(255,255,255,.35)';
}

function bindWalletModal() {
  var wmClose = document.getElementById('wmClose');
  if (wmClose) wmClose.addEventListener('click', closeWallet);

  var wovl = document.getElementById('wovl');
  if (wovl) wovl.addEventListener('click', function (e) { if (e.target === wovl) closeWallet(); });

  function tryConnect(id, provFn, name) {
    var btn = document.getElementById(id); if (!btn) return;
    btn.addEventListener('click', function () {
      var prov = provFn();
      if (prov) connectEVM(prov, name);
      else { toast(name + ' not detected'); closeWallet(); startDemoMode(); }
    });
  }

  tryConnect('opt-mm',    function () { return window.ethereum && !window.ethereum.isRabby ? window.ethereum : null; }, 'MetaMask');
  tryConnect('opt-rabby', function () { return window.ethereum && window.ethereum.isRabby ? window.ethereum : null; },  'Rabby');
  tryConnect('opt-okx',   function () { return window.okxwallet || null; },                                             'OKX');
  tryConnect('opt-ph',    function () { return window.phantom && window.phantom.ethereum ? window.phantom.ethereum : null; }, 'Phantom');

  var optDemo = document.getElementById('opt-demo');
  if (optDemo) optDemo.addEventListener('click', function () { closeWallet(); startDemoMode(); });

  var discBtn = document.getElementById('discBtn');
  if (discBtn) discBtn.addEventListener('click', disconnect);

  var scanCta = document.getElementById('scanCta');
  if (scanCta) scanCta.addEventListener('click', function () {
    closeScan();
    if (window.location.pathname.indexOf('identity') === -1) window.location.href = 'identity.html';
  });
}

/* ─── EVM CONNECT ───────────────────────────────────────────────────── */
function connectEVM(provider, name) {
  provider.request({ method: 'eth_requestAccounts' })
    .then(function (accounts) {
      if (!accounts || !accounts[0]) { toast('No account returned'); return; }
      var addr = accounts[0];
      provider.request({ method: 'eth_chainId' })
        .then(function (cid) { closeWallet(); startScan(addr, name, parseInt(cid, 16)); })
        .catch(function ()   { closeWallet(); startScan(addr, name, 1); });
    })
    .catch(function (err) {
      if (err.code === 4001) toast('Connection cancelled');
      else { toast('Could not connect — using Demo Mode'); closeWallet(); startDemoMode(); }
    });

  /* Chain change listener */
  if (provider.on) {
    provider.on('chainChanged', function (cid) {
      chainId = parseInt(cid, 16);
      var nchain = document.getElementById('nchainlbl');
      if (nchain) nchain.textContent = chainShort(chainId);
      showStatusBar();
      toast('Switched to ' + chainLabel(chainId));
    });
    provider.on('accountsChanged', function (accs) {
      if (!accs || !accs[0]) { disconnect(); return; }
      connAddr = accs[0];
      showStatusBar();
      toast('Account changed to ' + connAddr.slice(0, 6) + '...' + connAddr.slice(-4));
      if (typeof buildIdentity === 'function') buildIdentity();
    });
  }
}

/* ─── SCAN OVERLAY ──────────────────────────────────────────────────── */
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
  var sovl  = document.getElementById('sovl');
  var title = document.getElementById('scanTitle');
  var phase = document.getElementById('scanPhase');
  var sadr  = document.getElementById('scanAddr');
  var fill  = document.getElementById('spFill');
  var pct   = document.getElementById('spPct');
  var cta   = document.getElementById('scanCta');

  /* If no scan overlay, connect directly */
  if (!sovl) {
    connAddr   = addr;
    connWallet = wallet;
    chainId    = cid || 1;
    sessionStorage.setItem('rialo_addr',   connAddr);
    sessionStorage.setItem('rialo_wallet', connWallet);
    sessionStorage.setItem('rialo_chain',  chainId);
    onWalletConnected(addr, wallet, cid);
    return;
  }

  /* Cancel button */
  if (!document.getElementById('scanCancelBtn')) {
    var cancelBtn = document.createElement('button');
    cancelBtn.id = 'scanCancelBtn';
    cancelBtn.textContent = '✕ Cancel';
    cancelBtn.style.cssText = 'position:absolute;top:20px;right:20px;background:none;border:1px solid rgba(0,212,232,.2);color:rgba(0,212,232,.5);font-family:Space Mono,monospace;font-size:7.5px;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;border-radius:4px;cursor:pointer;z-index:2;transition:all .2s';
    cancelBtn.onmouseenter = function () { this.style.borderColor = 'rgba(239,68,68,.4)'; this.style.color = 'rgba(239,68,68,.8)'; };
    cancelBtn.onmouseleave = function () { this.style.borderColor = 'rgba(0,212,232,.2)'; this.style.color = 'rgba(0,212,232,.5)'; };
    cancelBtn.onclick = function () { closeScan(); connAddr = null; connWallet = null; toast('Scan cancelled'); };
    var si = sovl.querySelector('.scan-inner') || sovl;
    si.style.position = 'relative';
    si.appendChild(cancelBtn);
  }

  scActive = true;
  sovl.style.display = 'flex';
  setTimeout(function () { sovl.classList.add('open'); }, 10);
  if (title) { title.textContent = 'Identity Analysis'; setTimeout(function () { title.classList.add('in'); }, 200); }
  if (sadr)  { sadr.textContent  = addr.slice(0, 6) + '...' + addr.slice(-4); setTimeout(function () { sadr.classList.add('in'); }, 400); }
  if (cta)   cta.classList.remove('in');
  if (fill)  fill.style.width = '0%';
  if (pct)   pct.textContent  = '0%';

  for (var ni = 0; ni < 7; ni++) {
    (function (i) {
      setTimeout(function () {
        var sn = document.getElementById('sn' + i); if (!sn) return;
        sn.classList.add('lit');
        if (i === 6) sn.classList.add('gold');
      }, 300 + i * 320);
    })(ni);
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

  setTimeout(function () {
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
  setTimeout(function () { sovl.style.display = 'none'; }, 500);
  for (var i = 0; i < 7; i++) {
    var sn = document.getElementById('sn' + i);
    if (sn) sn.classList.remove('lit', 'gold');
  }
  ['scanTitle','scanAddr','scanCta'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('in');
  });
  var fill = document.getElementById('spFill'); if (fill) fill.style.width = '0%';
  var pct  = document.getElementById('spPct');  if (pct)  pct.textContent  = '0%';
}

/* ─── WALLET CONNECTED ──────────────────────────────────────────────── */
function onWalletConnected(addr, wallet, cid) {
  var navBtn    = document.getElementById('navBtn');
  var navLbl    = document.getElementById('navLbl');
  var nchainlbl = document.getElementById('nchainlbl');
  var chainDot  = document.querySelector('.chain-dot');

  if (navBtn) navBtn.classList.add('connected');
  if (navLbl) navLbl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
  if (nchainlbl) nchainlbl.textContent = chainShort(cid || chainId);
  if (chainDot) chainDot.style.background = '#10b981';

  showStatusBar();
  triggerEcoAlert('Identity verified ✓ — ' + (wallet || 'Wallet') + ' connected', 'bullish', 3500);
  triggerFlash('green-flash');
  toast('Connected: ' + addr.slice(0, 6) + '...' + addr.slice(-4));

  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── DISCONNECT ────────────────────────────────────────────────────── */
function disconnect() {
  connAddr   = null;
  connWallet = null;
  sessionStorage.removeItem('rialo_addr');
  sessionStorage.removeItem('rialo_wallet');
  sessionStorage.removeItem('rialo_chain');

  var navBtn    = document.getElementById('navBtn');
  var navLbl    = document.getElementById('navLbl');
  var nchainlbl = document.getElementById('nchainlbl');
  if (navBtn)    navBtn.classList.remove('connected');
  if (navLbl)    navLbl.textContent = 'Connect Wallet';
  if (nchainlbl) nchainlbl.textContent = 'Ethereum';

  hideStatusBar();
  toast('Disconnected');
  triggerEcoAlert('Wallet disconnected — identity session ended', 'info', 3000);
  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── CURSOR (FULLY REBUILT) ────────────────────────────────────────── */
function initCursor() {
  /* Skip on touch devices */
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

  /* Remove old cursor elements if exist */
  ['CUR','CUR2'].forEach(function (id) {
    var old = document.getElementById(id); if (old) old.remove();
  });

  /* Inject styles */
  if (!document.getElementById('_cur_styles')) {
    var st = document.createElement('style');
    st.id = '_cur_styles';
    st.textContent = [
      '*, *::before, *::after { cursor: none !important; }',
      '#_cur_dot {',
      '  position: fixed; width: 8px; height: 8px; border-radius: 50%;',
      '  background: #00d4e8; pointer-events: none; z-index: 99999;',
      '  transform: translate(-50%, -50%);',
      '  box-shadow: 0 0 12px #00d4e8, 0 0 24px rgba(0,212,232,.4);',
      '  transition: transform .15s, background .2s, box-shadow .2s;',
      '  will-change: left, top;',
      '}',
      '#_cur_ring {',
      '  position: fixed; width: 32px; height: 32px; border-radius: 50%;',
      '  border: 1.5px solid rgba(0,212,232,.5); pointer-events: none;',
      '  z-index: 99998; transform: translate(-50%, -50%);',
      '  transition: width .2s, height .2s, border-color .2s, opacity .2s;',
      '  will-change: left, top;',
      '}',
      '.cur-trail {',
      '  position: fixed; border-radius: 50%; pointer-events: none;',
      '  z-index: 99997; transform: translate(-50%, -50%);',
      '  background: rgba(0,212,232,.35);',
      '  will-change: left, top;',
      '}',
      'body.chl #_cur_dot { transform: translate(-50%,-50%) scale(1.8); background: #7c3aff; box-shadow: 0 0 16px #7c3aff; }',
      'body.chl #_cur_ring { width: 44px; height: 44px; border-color: rgba(124,58,255,.4); }',
      'body.cclick #_cur_dot { transform: translate(-50%,-50%) scale(.6); }',
      'body.cclick #_cur_ring { width: 20px; height: 20px; opacity: .6; }'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* Create elements */
  var dot  = document.createElement('div'); dot.id  = '_cur_dot';  document.body.appendChild(dot);
  var ring = document.createElement('div'); ring.id = '_cur_ring'; document.body.appendChild(ring);

  /* Trail dots */
  var TRAIL_N = 5;
  var trails  = [];
  for (var i = 0; i < TRAIL_N; i++) {
    var td = document.createElement('div');
    td.className = 'cur-trail';
    var sz = 6 - i * 0.9;
    td.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;opacity:' + (0.4 - i * 0.07).toFixed(2);
    document.body.appendChild(td);
    trails.push({ el: td, x: -100, y: -100 });
  }

  var mx = -100, my = -100;
  var rx = -100, ry = -100;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  }, { passive: true });

  document.addEventListener('mousedown', function () { document.body.classList.add('cclick'); });
  document.addEventListener('mouseup',   function () { document.body.classList.remove('cclick'); });

  /* Hover detection */
  var HOVER_SEL = 'a,button,input,select,textarea,[onclick],[role=button],.itab,.eco-fbtn,.token-row,.validator-item,.chain-pill,.swap-btn,.btn-connect';
  function onEnter() { document.body.classList.add('chl'); }
  function onLeave() { document.body.classList.remove('chl'); }

  function bindHover(el) {
    if (el._rCurBound) return;
    el._rCurBound = true;
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
  }

  document.querySelectorAll(HOVER_SEL).forEach(bindHover);
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(HOVER_SEL)) bindHover(node);
        if (node.querySelectorAll) node.querySelectorAll(HOVER_SEL).forEach(bindHover);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  /* Animation loop */
  var RING_EASE = 0.12;
  var TRAIL_EASE = [0.20, 0.16, 0.13, 0.10, 0.08];
  var prevX = -100, prevY = -100;

  (function loop() {
    /* Ring follows with easing */
    rx += (mx - rx) * RING_EASE;
    ry += (my - ry) * RING_EASE;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';

    /* Trails follow cursor with increasing lag */
    var px = mx, py = my;
    trails.forEach(function (t, i) {
      t.x += (px - t.x) * TRAIL_EASE[i];
      t.y += (py - t.y) * TRAIL_EASE[i];
      t.el.style.left = t.x + 'px';
      t.el.style.top  = t.y + 'px';
      px = t.x; py = t.y;
    });

    prevX = mx; prevY = my;
    requestAnimationFrame(loop);
  })();
}

/* ─── RIPPLE ────────────────────────────────────────────────────────── */
function initRipple() {
  document.querySelectorAll('.btn,.btn-ghost,.swap-btn,.btn-connect').forEach(function (btn) {
    if (btn._rippleBound) return;
    btn._rippleBound = true;
    btn.style.position = 'relative';
    btn.style.overflow  = 'hidden';
    btn.addEventListener('click', function (e) {
      var r  = btn.getBoundingClientRect();
      var x  = e.clientX - r.left, y = e.clientY - r.top;
      var sz = Math.max(r.width, r.height) * 2;
      var rp = document.createElement('div');
      rp.style.cssText = 'position:absolute;width:' + sz + 'px;height:' + sz + 'px;' +
        'left:' + (x - sz/2) + 'px;top:' + (y - sz/2) + 'px;' +
        'background:rgba(255,255,255,.2);border-radius:50%;' +
        'transform:scale(0);animation:ripple_kf .6s ease-out forwards;pointer-events:none;z-index:10';
      btn.appendChild(rp);
      setTimeout(function () { rp.remove(); }, 650);
    });
  });
  if (!document.getElementById('_ripple_kf')) {
    var s = document.createElement('style');
    s.id = '_ripple_kf';
    s.textContent = '@keyframes ripple_kf { to { transform: scale(1); opacity: 0; } }';
    document.head.appendChild(s);
  }
}

/* ─── REVEAL ────────────────────────────────────────────────────────── */
function initReveal() {
  var els = document.querySelectorAll('.rv');
  if (!els.length) return;
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var delay = 0;
        var siblings = e.target.parentElement ? e.target.parentElement.querySelectorAll('.rv:not(.in)') : [];
        siblings.forEach(function (sib, i) { if (sib === e.target) delay = i * 55; });
        setTimeout(function () { e.target.classList.add('in'); }, delay);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.08 });
    els.forEach(function (el) { obs.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }
}

/* ─── BG CANVAS ─────────────────────────────────────────────────────── */
var _bgC = null, _bgX = null, _bgNodes = [];
function initBgCanvas() {
  _bgC = document.getElementById('BG'); if (!_bgC) return;
  _bgX = _bgC.getContext('2d');
  function resize() { _bgC.width = window.innerWidth; _bgC.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
  for (var i = 0; i < 32; i++) {
    _bgNodes.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.10,
      vy: (Math.random() - 0.5) * 0.10,
      r:  Math.random() * 2 + 0.5,
      p:  Math.random() * Math.PI * 2,
      gold: Math.random() < 0.08
    });
  }
}

function drawBg() {
  if (!_bgC || !_bgX) return;
  var W = _bgC.width, H = _bgC.height;
  _bgX.clearRect(0, 0, W, H);
  var em = 1 + ecosystemState.energyLevel / 500;
  _bgNodes.forEach(function (n) {
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
      var dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 180) {
        _bgX.beginPath();
        _bgX.strokeStyle = 'rgba(0,212,232,' + (1 - dd / 180) * 0.045 + ')';
        _bgX.lineWidth = 0.4;
        _bgX.moveTo(_bgNodes[i].x, _bgNodes[i].y);
        _bgX.lineTo(_bgNodes[j].x, _bgNodes[j].y);
        _bgX.stroke();
      }
    }
  }
}

/* ─── CARD TILT ─────────────────────────────────────────────────────── */
function initCardTilt() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  document.querySelectorAll('.wcard,.dev-card,.fc,.mc,.id-live-card,.feature-card,.metric-card').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var r  = card.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width/2))  / r.width;
      var dy = (e.clientY - (r.top  + r.height/2)) / r.height;
      card.style.transform = 'translateY(-3px) perspective(800px) rotateX(' + (-dy * 5) + 'deg) rotateY(' + (dx * 5) + 'deg)';
    });
    card.addEventListener('mouseleave', function () { card.style.transform = ''; });
  });
}

/* ─── INIT ALL ──────────────────────────────────────────────────────── */
function initShared(activePage) {
  initLoader();
  initNav(activePage || '');
  initPriceStreams();
  initCursor();
  initRipple();
  initReveal();
  initBgCanvas();
  initCardTilt();
  bindWalletModal();
}
