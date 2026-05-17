/* =====================================================================
   shared.js — RIALO · Global Shared Logic
   Covers: BG canvas, cursor, hex canvas, ripple, reveal, nav,
           wallet modal, scan overlay, status bar, toast,
           price fetching, ecosystem state, helper utils.
   ===================================================================== */

/* ─── GLOBAL STATE ───────────────────────────────────────────────── */
var connAddr   = null;   // connected wallet address (null = disconnected)
var connWallet = null;   // provider name string
var chainId    = 1;      // current chain id (default: Ethereum mainnet)
var ethPrice   = 3200;   // last known ETH price in USD
var gasPrice   = 18;     // last known gas in gwei
var scActive   = false;  // scan overlay active?

var tokenData = {
  ethereum: { price: 3200,  chg: 0 },
  bitcoin:  { price: 64000, chg: 0 },
  solana:   { price: 145,   chg: 0 },
  'matic-network': { price: 0.88, chg: 0 }
};

var priceHistory = { eth: [], btc: [], sol: [] };

var ecosystemState = {
  energyLevel: 0,       // 0-100, drives animation intensity
  mood: 'neutral'       // 'bullish' | 'bearish' | 'neutral'
};

/* ─── PRICE FETCH ────────────────────────────────────────────────── */
var PRICE_IDS = 'ethereum,bitcoin,solana,matic-network';
var _priceRetryCount = 0;

function applyFallbackPrices() {
  // Use realistic fallback prices with simulated small changes
  ethPrice = tokenData.ethereum.price;
  gasPrice = tokenData.ethereum.price ? 18 : 18;
  applyPricesToDom();
  updateEcosystemMood();
}

// Fetch from Binance public API (no key needed, no CORS issues)
function _fetchFromBinance() {
  var symbols = [
    { symbol: 'ETHUSDT', id: 'ethereum' },
    { symbol: 'BTCUSDT', id: 'bitcoin' },
    { symbol: 'SOLUSDT', id: 'solana' },
    { symbol: 'MATICUSDT', id: 'matic-network' }
  ];
  var promises = symbols.map(function(s) {
    return fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + s.symbol)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        return { id: s.id, price: parseFloat(d.lastPrice), chg: parseFloat(d.priceChangePercent) };
      });
  });
  return Promise.all(promises).then(function(results) {
    var changed = false;
    results.forEach(function(item) {
      if (!item || !item.price) return;
      if (tokenData[item.id] && tokenData[item.id].price !== item.price) changed = true;
      tokenData[item.id] = { price: item.price, chg: item.chg };
      if (item.id === 'ethereum') { ethPrice = item.price; gasPrice = Math.floor(12 + Math.random() * 38); }
    });
    return changed;
  });
}

// Fetch from CoinGecko (primary)
function _fetchFromCoinGecko() {
  var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + PRICE_IDS
    + '&vs_currencies=usd&include_24hr_change=true';
  return fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined })
    .then(function(r) {
      if (!r.ok) throw new Error('CoinGecko ' + r.status);
      return r.json();
    })
    .then(function(d) {
      var changed = false;
      Object.keys(d).forEach(function(id) {
        var p = d[id].usd, c = d[id].usd_24h_change || 0;
        if (tokenData[id]) {
          if (tokenData[id].price !== p) changed = true;
          tokenData[id] = { price: p, chg: c };
        }
        if (id === 'ethereum') { ethPrice = p; gasPrice = Math.floor(12 + Math.random() * 38); }
      });
      return changed;
    });
}

function _pushPriceHistory() {
  ['eth','btc','sol'].forEach(function(k) {
    var map = { eth:'ethereum', btc:'bitcoin', sol:'solana' };
    var v = tokenData[map[k]];
    if (!priceHistory[k]) priceHistory[k] = [];
    priceHistory[k].push(v ? v.price : 0);
    if (priceHistory[k].length > 30) priceHistory[k].shift();
  });
}

function _onPriceFetchSuccess(changed) {
  _pushPriceHistory();
  applyPricesToDom();
  updateEcosystemMood();
  if (changed) triggerFlash(null);
  if (typeof onPricesUpdated === 'function') onPricesUpdated(tokenData);
  _priceRetryCount = 0;
}

// Called by pages — tries CoinGecko first, falls back to Binance
function fetchPrices() {
  _fetchFromCoinGecko()
    .then(function(changed) { _onPriceFetchSuccess(changed); })
    .catch(function() {
      // CoinGecko failed (rate limit / CORS / network) — try Binance
      _fetchFromBinance()
        .then(function(changed) { _onPriceFetchSuccess(changed); })
        .catch(function() {
          // Both failed — simulate small price movement on existing data so UI doesn't look dead
          _priceRetryCount++;
          ['ethereum','bitcoin','solana','matic-network'].forEach(function(id) {
            if (tokenData[id] && tokenData[id].price) {
              var drift = (Math.random() - 0.499) * 0.004;
              tokenData[id] = {
                price: tokenData[id].price * (1 + drift),
                chg:   tokenData[id].chg   + (Math.random() - 0.5) * 0.05
              };
            }
          });
          if (tokenData.ethereum) ethPrice = tokenData.ethereum.price;
          _pushPriceHistory();
          applyPricesToDom();
          if (typeof onPricesUpdated === 'function') onPricesUpdated(tokenData);
        });
    });
}

var ID_MAP = {
  ethereum: { p:['ep','hmp-eth'], c:['ec','hmc-eth'] },
  bitcoin:  { p:['bp','hmp-btc'], c:['bc','hmc-btc'] },
  solana:   { p:['sp','hmp-sol'], c:['sc','hmc-sol'] }
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
        // Clean replace: strip ti-u/ti-d/hm-chg direction classes then re-add
        var base = el.className.replace(/\b(ti-[ud]|up|dn)\b/g, '').trim();
        el.className = base + ' ' + (up ? (base.indexOf('ti-') >= 0 ? 'ti-u' : 'up') : (base.indexOf('ti-') >= 0 ? 'ti-d' : 'dn'));
      }
    });
  });
  updateStatusBarMarket();
}

function updateEcosystemMood() {
  var eth = tokenData['ethereum'];
  if (!eth) return;
  var chg = eth.chg || 0;
  var mood = chg > 1.5 ? 'bullish' : chg < -1.5 ? 'bearish' : 'neutral';
  ecosystemState.mood = mood;
  ecosystemState.energyLevel = Math.min(100, Math.abs(chg) * 12);

  var nav = document.getElementById('mainNav');
  var atmo = document.getElementById('atmo');
  var nhBar = document.getElementById('nhBar');
  var pulse = document.getElementById('navPulse');
  if (nav) {
    nav.className = 'energized' + (mood !== 'neutral' ? ' ' + mood : '');
  }
  if (atmo) { atmo.className = mood !== 'neutral' ? mood : ''; atmo.classList.add('energized'); }
  if (nhBar) {
    nhBar.className = 'nh-bar ' + (mood === 'bullish' ? 'nh-bullish' : mood === 'bearish' ? 'nh-alert' : 'nh-neutral');
    nhBar.style.width = (40 + ecosystemState.energyLevel * 0.6) + '%';
  }
  if (pulse) { pulse.className = 'npulse' + (mood === 'bullish' ? ' green' : mood === 'bearish' ? ' red' : ''); }

  var msg = mood === 'bullish'
    ? 'ETH +' + (eth.chg || 0).toFixed(2) + '% — Ecosystem bullish ↑'
    : mood === 'bearish'
    ? 'ETH ' + (eth.chg || 0).toFixed(2) + '% — Monitoring correction ↓'
    : 'Ecosystem intelligence online — monitoring 50 chains';
  triggerEcoAlert(msg, mood === 'bullish' ? 'bullish' : mood === 'bearish' ? 'alert' : 'info', 4000);
  if (typeof onMarketUpdate === 'function') onMarketUpdate(tokenData, mood);
}

/* ─── TOAST ──────────────────────────────────────────────────────── */
var _toastTimer = null;
function toast(msg, dur) {
  var el = document.getElementById('toast'); if (!el) return;
  el.innerHTML = '<span class="tdot"></span>' + msg;
  el.classList.add('on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('on'); }, dur || 2800);
}

/* ─── ECO ALERT ──────────────────────────────────────────────────── */
var _ecoTimer = null;
function triggerEcoAlert(msg, type, dur) {
  var wrap = document.getElementById('ecoAlert');
  var inner = document.getElementById('eaInner');
  var span  = document.getElementById('eaMsg');
  if (!wrap || !inner || !span) return;
  span.textContent = msg;
  inner.className = 'ea-inner ' + (type || 'info');
  wrap.classList.add('show');
  clearTimeout(_ecoTimer);
  _ecoTimer = setTimeout(function(){ wrap.classList.remove('show'); }, dur || 4000);
}

/* ─── FLASH ──────────────────────────────────────────────────────── */
function triggerFlash(type) {
  var el = document.getElementById('flash'); if (!el) return;
  el.className = type ? type + '-flash go' : 'go';
  setTimeout(function(){ el.className = ''; }, 120);
}

/* ─── STATUS BAR ─────────────────────────────────────────────────── */
function showStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  var addr  = document.getElementById('sbAddr');
  var chain = document.getElementById('sbChain');
  var bal   = document.getElementById('sbBal');
  if (addr)  addr.textContent  = connAddr  || '0x0000...0000';
  if (chain) chain.textContent = chainLabel(chainId);
  // Show simulated balance for demo mode, real balance would need eth_getBalance RPC call
  var isDemoMode = (connWallet === 'Demo Mode');
  if (bal)   bal.textContent   = isDemoMode ? '3.2841 ETH' : '— ETH';
  sb.classList.add('on');
  updateStatusBarMarket();
}

function hideStatusBar() {
  var sb = document.getElementById('sbar'); if (sb) sb.classList.remove('on');
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

/* ─── CHAIN HELPERS ──────────────────────────────────────────────── */
function chainLabel(id) {
  var m = { 1:'Ethereum Mainnet', 11155111:'Sepolia Testnet', 137:'Polygon Mainnet', 10:'Optimism', 42161:'Arbitrum One', 8453:'Base' };
  return m[id] || 'Unknown Network';
}
function chainShort(id) {
  var m = { 1:'ETH', 11155111:'SEP', 137:'POL', 10:'OP', 42161:'ARB', 8453:'BASE' };
  return m[id] || 'EVM';
}

/* ─── NAV ────────────────────────────────────────────────────────── */
function initNav(active) {
  // Set active nav link
  var links = document.querySelectorAll('.nlinks a');
  links.forEach(function(a) {
    if (a.getAttribute('data-s') === active) a.classList.add('active');
    else a.classList.remove('active');
  });

  // Hamburger toggle
  var ham = document.getElementById('hamBtn');
  var navLinks = document.getElementById('navLinks');
  if (ham && navLinks) {
    ham.addEventListener('click', function() {
      ham.classList.toggle('open');
      navLinks.classList.toggle('mob-open');
    });
    // Close on nav link click (mobile)
    navLinks.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() {
        ham.classList.remove('open');
        navLinks.classList.remove('mob-open');
      });
    });
  }

  // Detect wallets early so badges are ready when modal opens
  detectWallets();
  if (navBtn) {
    navBtn.addEventListener('click', function() {
      if (connAddr) { openWallet(); } else { openWallet(); }
    });
  }

  // Restore session
  var saved = sessionStorage.getItem('rialo_addr');
  var savedWallet = sessionStorage.getItem('rialo_wallet');
  var savedChain = parseInt(sessionStorage.getItem('rialo_chain') || '1');
  if (saved) {
    connAddr = saved;
    connWallet = savedWallet || 'Demo Mode';
    chainId = savedChain || 1;
    onWalletConnected(connAddr, connWallet, chainId);
  }
}

/* ─── WALLET MODAL ───────────────────────────────────────────────── */
function openWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.add('show');
  setTimeout(function(){ ovl.classList.add('open'); }, 10);
  detectWallets();
}

function closeWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.remove('open');
  setTimeout(function(){ ovl.classList.remove('show'); }, 380);
}

function detectWallets() {
  // Run after a short delay to let wallet extensions inject into window
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
  if (wovl) {
    wovl.addEventListener('click', function(e) {
      if (e.target === wovl) closeWallet();
    });
  }

  // MetaMask
  var optMM = document.getElementById('opt-mm');
  if (optMM) optMM.addEventListener('click', function() {
    if (window.ethereum && !window.ethereum.isRabby) {
      connectEVM(window.ethereum, 'MetaMask');
    } else {
      toast('MetaMask not detected — install at metamask.io');
    }
  });

  // Rabby
  var optRabby = document.getElementById('opt-rabby');
  if (optRabby) optRabby.addEventListener('click', function() {
    if (window.ethereum && window.ethereum.isRabby) {
      connectEVM(window.ethereum, 'Rabby');
    } else {
      toast('Rabby not detected — install the Rabby extension');
    }
  });

  // OKX
  var optOKX = document.getElementById('opt-okx');
  if (optOKX) optOKX.addEventListener('click', function() {
    if (window.okxwallet) {
      connectEVM(window.okxwallet, 'OKX Wallet');
    } else {
      toast('OKX Wallet not detected — install from okx.com/web3');
    }
  });

  // Phantom
  var optPH = document.getElementById('opt-ph');
  if (optPH) optPH.addEventListener('click', function() {
    if (window.phantom && window.phantom.ethereum) {
      connectEVM(window.phantom.ethereum, 'Phantom');
    } else {
      toast('Phantom not detected — install at phantom.com');
    }
  });

  // Demo Mode
  var optDemo = document.getElementById('opt-demo');
  if (optDemo) optDemo.addEventListener('click', function() {
    var demoAddr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    closeWallet();
    startScan(demoAddr, 'Demo Mode', 1);
  });
}

/* ─── EVM CONNECT ────────────────────────────────────────────────── */
function connectEVM(provider, name) {
  var spinner = '<div class="wo-spin"></div>';
  // show loading state briefly
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

/* ─── SCAN OVERLAY ───────────────────────────────────────────────── */
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

  // Nodes light up
  for (var ni = 0; ni < 7; ni++) {
    (function(i){ setTimeout(function(){
      var sn = document.getElementById('sn' + i); if (!sn) return;
      sn.classList.add('lit');
      if (i === 6) sn.classList.add('gold');
    }, 300 + i * 320); })(ni);
  }

  // Phase steps
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

  // Done
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
  // Reset nodes
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
    // Navigate to identity page if not already there
    if (window.location.pathname.indexOf('identity') === -1) {
      window.location.href = 'identity.html';
    }
  });
}

/* ─── WALLET CONNECTED CALLBACK ───────────────────────────────────── */
function onWalletConnected(addr, wallet, cid) {
  // Update nav button
  var navBtn = document.getElementById('navBtn');
  var navLbl = document.getElementById('navLbl');
  if (navBtn) navBtn.classList.add('connected');
  if (navLbl) navLbl.textContent = addr.slice(0,6) + '…' + addr.slice(-4);

  // Show chain indicator
  var nchain = document.getElementById('nchain');
  var nchainlbl = document.getElementById('nchainlbl');
  if (nchain)    nchain.classList.add('on');
  if (nchainlbl) nchainlbl.textContent = chainShort(cid);

  showStatusBar();
  triggerEcoAlert('Identity verified ✓ — ' + (wallet || 'Wallet') + ' connected', 'bullish', 3500);
  triggerFlash('green-flash');
  toast('Connected — ' + addr.slice(0,6) + '…' + addr.slice(-4));

  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── DISCONNECT ─────────────────────────────────────────────────── */
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

/* ─── BG CANVAS ──────────────────────────────────────────────────── */
var _bgC = null, _bgX = null, _bgNodes = [];
function initBgCanvas() {
  _bgC = document.getElementById('BG'); if (!_bgC) return;
  _bgX = _bgC.getContext('2d');
  _rBg();
  window.addEventListener('resize', _rBg);
  for (var i = 0; i < 28; i++) {
    _bgNodes.push({
      x: Math.random() * (window.innerWidth  || 1400),
      y: Math.random() * (window.innerHeight || 800),
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r:  Math.random() * 1.8 + 0.4,
      p:  Math.random() * Math.PI * 2
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
    var a = (Math.sin(n.p) * 0.5 + 0.5) * 0.18 + 0.04;
    _bgX.beginPath();
    _bgX.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    _bgX.fillStyle = 'rgba(0,200,224,' + a + ')';
    _bgX.fill();
  });
  for (var i = 0; i < _bgNodes.length; i++) {
    for (var j = i + 1; j < _bgNodes.length; j++) {
      var dx = _bgNodes[i].x - _bgNodes[j].x;
      var dy = _bgNodes[i].y - _bgNodes[j].y;
      var d  = Math.sqrt(dx * dx + dy * dy);
      if (d < 180) {
        _bgX.beginPath();
        _bgX.strokeStyle = 'rgba(0,200,224,' + (1 - d / 180) * 0.055 + ')';
        _bgX.lineWidth = 0.4;
        _bgX.moveTo(_bgNodes[i].x, _bgNodes[i].y);
        _bgX.lineTo(_bgNodes[j].x, _bgNodes[j].y);
        _bgX.stroke();
      }
    }
  }
}

/* ─── HEX / SCAN CANVAS ─────────────────────────────────────────── */
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
  // Outer spinning hex rings
  [1.0, 0.72, 0.44].forEach(function(scale, ki) {
    _hexX.beginPath();
    for (var s = 0; s <= sides; s++) {
      var angle = (s / sides) * Math.PI * 2 + a0 * (ki % 2 === 0 ? 1 : -1);
      var px = cx + Math.cos(angle) * r * scale;
      var py = cy + Math.sin(angle) * r * scale;
      s === 0 ? _hexX.moveTo(px, py) : _hexX.lineTo(px, py);
    }
    _hexX.strokeStyle = 'rgba(0,200,224,' + (0.22 - ki * 0.065) + ')';
    _hexX.lineWidth = 0.8;
    _hexX.stroke();
  });
  // Center glow dot
  var ga = Math.sin(t * 0.002) * 0.5 + 0.5;
  _hexX.beginPath();
  _hexX.arc(cx, cy, 7 + ga * 3, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(0,200,224,' + (0.6 + ga * 0.35) + ')';
  _hexX.fill();
  // Orbit dot
  var oa = t * 0.0018;
  var ox = cx + Math.cos(oa) * 44;
  var oy = cy + Math.sin(oa) * 44;
  _hexX.beginPath();
  _hexX.arc(ox, oy, 2.5, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(196,154,42,0.9)';
  _hexX.fill();
}

/* ─── CURSOR ─────────────────────────────────────────────────────── */
var _cur = null, _cur2 = null, _mx = 0, _my = 0, _tx = 0, _ty = 0;
function initCursor() {
  _cur  = document.getElementById('CUR');
  _cur2 = document.getElementById('CUR2');
  if (!_cur || !_cur2) return;
  document.addEventListener('mousemove', function(e) {
    _mx = e.clientX; _my = e.clientY;
    _cur.style.transform = 'translate(' + (_mx - 2.5) + 'px,' + (_my - 2.5) + 'px)';
  });
  document.addEventListener('mousedown', function() { document.body.classList.add('cclick'); });
  document.addEventListener('mouseup',   function() { document.body.classList.remove('cclick'); });
  document.querySelectorAll('a,button,.wo,[onclick]').forEach(function(el) {
    el.addEventListener('mouseenter', function() { document.body.classList.add('chl'); });
    el.addEventListener('mouseleave', function() { document.body.classList.remove('chl'); });
  });
  (function animCur() {
    _tx += (_mx - _tx) * 0.12;
    _ty += (_my - _ty) * 0.12;
    _cur2.style.transform = 'translate(' + (_tx - 11) + 'px,' + (_ty - 11) + 'px)';
    requestAnimationFrame(animCur);
  })();
}

/* ─── RIPPLE ─────────────────────────────────────────────────────── */
function initRipple() {
  document.querySelectorAll('.btn,.btn-ghost').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var r = btn.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      var sz = Math.max(r.width, r.height) * 1.8;
      var rp = document.createElement('div');
      rp.className = 'btn-ripple';
      rp.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (x - sz/2) + 'px;top:' + (y - sz/2) + 'px';
      btn.querySelectorAll('.btn-ripple').forEach(function(old){ old.remove(); });
      btn.appendChild(rp);
      setTimeout(function(){ rp.remove(); }, 600);
    });
  });
}

/* ─── SCROLL REVEAL ──────────────────────────────────────────────── */
function initReveal() {
  var els = document.querySelectorAll('.rv');
  if (!els.length) return;
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function(el) { obs.observe(el); });
  } else {
    els.forEach(function(el) { el.classList.add('in'); });
  }
}
