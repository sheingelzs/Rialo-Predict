/* =====================================================================
   shared.js — RIALO · Global Shared Logic
   FIXES APPLIED:
   1. ecosystemState.energyLevel properly updated
   2. WebSocket duplikat connection guard improved
   3. applyPricesToDom defensive — skip missing elements gracefully
   4. scanCta redirect waits for sessionStorage write before redirect
   5. connAddr restored before buildIdentity() in initNav
   6. fmtP / fmtNum / fmtM exported globally
   7. updateEcosystemMood synced with energyLevel
   8. Gas oracle ID fix (gSlow/gStd/gFast/gRapid)
   9. Status bar show/hide consistent across all pages
   10. disconnect clears idLiveInterval if exists
   ===================================================================== */

/* ─── GLOBAL STATE ─────────────────────────────────────────────────── */
var connAddr   = null;
var connWallet = null;
var chainId    = 1;
var ethPrice   = 3482;
var gasPrice   = 14;
var scActive   = false;
var idLiveInterval = null;   // shared across pages

var tokenData = {
  ethereum:        { price: 3482,   chg: 2.34,  mcap: 418e9  },
  bitcoin:         { price: 104221, chg: 1.87,  mcap: 2050e9 },
  solana:          { price: 182.40, chg: 4.12,  mcap: 87e9   },
  'matic-network': { price: 0.892,  chg: -0.84, mcap: 8.2e9  },
  arbitrum:        { price: 1.24,   chg: 3.21,  mcap: 3.1e9  },
  'avalanche-2':   { price: 38.70,  chg: -1.22, mcap: 15e9   },
  chainlink:       { price: 18.34,  chg: 2.88,  mcap: 10.7e9 },
  uniswap:         { price: 10.62,  chg: 1.45,  mcap: 6.4e9  }
};

var priceHistory = { eth: [], btc: [], sol: [], matic: [], arb: [], link: [], uni: [] };
var MAX_HIST = 24;

/* FIX #1: ecosystemState includes energyLevel */
var ecosystemState = {
  energyLevel: 0,
  marketMood: 'neutral'
};

/* ─── FORMAT HELPERS (global) ──────────────────────────────────────── */
function fmtP(p) {
  if (!p) return '—';
  if (p >= 10000) return '$' + Math.round(p).toLocaleString();
  if (p >= 1)     return '$' + p.toFixed(2);
  return '$' + p.toFixed(4);
}
function fmtNum(n, d) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
}
function fmtM(p) {
  if (!p) return '—';
  if (p >= 1e12) return '$' + (p / 1e12).toFixed(1) + 'T';
  if (p >= 1e9)  return '$' + (p / 1e9).toFixed(1) + 'B';
  return '$' + (p / 1e6).toFixed(0) + 'M';
}

/* ─── CHAIN HELPERS ────────────────────────────────────────────────── */
function chainLabel(id) {
  var m = { 1: 'Ethereum Mainnet', 11155111: 'Sepolia Testnet', 137: 'Polygon Mainnet', 10: 'Optimism', 42161: 'Arbitrum One', 8453: 'Base', 56: 'BNB Chain' };
  return m[parseInt(id)] || 'Unknown Network';
}
function chainShort(id) {
  var m = { 1: 'ETH', 11155111: 'SEP', 137: 'POL', 10: 'OP', 42161: 'ARB', 8453: 'BASE', 56: 'BNB' };
  return m[parseInt(id)] || 'EVM';
}

/* ─── TOAST ────────────────────────────────────────────────────────── */
var _toastTimer = null;
function toast(msg, dur) {
  var el = document.getElementById('toast'); if (!el) return;
  el.innerHTML = '<span class="tdot"></span>' + msg;
  el.classList.add('on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.classList.remove('on'); }, dur || 2800);
}

/* ─── ECO ALERT ────────────────────────────────────────────────────── */
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
  _ecoTimer = setTimeout(function () { wrap.classList.remove('show'); }, dur || 4000);
}

/* ─── FLASH ────────────────────────────────────────────────────────── */
function triggerFlash(type) {
  var el = document.getElementById('flash'); if (!el) return;
  el.className = type ? type + ' go' : 'go';
  setTimeout(function () { el.className = ''; }, 160);
}

/* ─── PRICE SYSTEM ─────────────────────────────────────────────────── */
var _ws        = null;
var _wsReady   = false;
var _wsRetries = 0;
var _chgSnap   = {};

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

/* ID_MAP — ticker element IDs per coin (defensive: skip missing) */
var ID_MAP = {
  ethereum:        { p: ['ep', 'ep2', 'hmp-eth'],  c: ['ec', 'ec2', 'hmc-eth']  },
  bitcoin:         { p: ['bp', 'bp2', 'hmp-btc'],  c: ['bc', 'bc2', 'hmc-btc']  },
  solana:          { p: ['sp', 'sp2', 'hmp-sol'],  c: ['sc', 'sc2', 'hmc-sol']  },
  'matic-network': { p: ['mp', 'mp2'],              c: ['mc', 'mc2']              },
  arbitrum:        { p: ['ap', 'ap2'],              c: ['ac', 'ac2']              },
  'avalanche-2':   { p: ['avp', 'avp2'],            c: ['avc', 'avc2']            },
  chainlink:       { p: ['lp', 'lp2'],              c: ['lc', 'lc2']              },
  uniswap:         { p: ['up', 'up2'],              c: ['uc', 'uc2']              }
};

function _pushHistory() {
  var map = { eth: 'ethereum', btc: 'bitcoin', sol: 'solana', matic: 'matic-network', arb: 'arbitrum', link: 'chainlink', uni: 'uniswap' };
  Object.keys(map).forEach(function (k) {
    var d = tokenData[map[k]];
    if (!priceHistory[k]) priceHistory[k] = [];
    priceHistory[k].push(d ? d.price : 0);
    if (priceHistory[k].length > MAX_HIST) priceHistory[k].shift();
  });
}

/* FIX #3: applyPricesToDom — skip missing elements gracefully */
function applyPricesToDom() {
  Object.keys(ID_MAP).forEach(function (id) {
    var d = tokenData[id]; if (!d) return;
    var up = (d.chg || 0) >= 0;
    ID_MAP[id].p.forEach(function (eid) {
      var el = document.getElementById(eid); if (!el) return;
      el.textContent = fmtP(d.price);
    });
    ID_MAP[id].c.forEach(function (eid) {
      var el = document.getElementById(eid); if (!el) return;
      el.textContent = (up ? '+' : '') + (d.chg || 0).toFixed(2) + '%';
      /* preserve existing class prefixes */
      if (el.className.indexOf('ti-') >= 0) {
        el.className = el.className.replace(/\bti-[ud]\b/g, '').trim() + ' ' + (up ? 'ti-u' : 'ti-d');
      } else {
        el.className = el.className.replace(/\b(up|dn)\b/g, '').trim() + ' ' + (up ? 'up' : 'dn');
      }
    });
  });
  /* gas ticker */
  ['gasp', 'gasp2'].forEach(function (gid) {
    var el = document.getElementById(gid);
    if (el && gasPrice) el.textContent = gasPrice;
  });
  updateStatusBarMarket();
  /* page-specific hooks */
  if (typeof onPricesUpdated === 'function') onPricesUpdated(tokenData);
}

/* FIX #1 + #7: updateEcosystemMood syncs energyLevel */
var _lastMood = null;
function updateEcosystemMood() {
  var eth = tokenData['ethereum']; if (!eth) return;
  var chg  = eth.chg || 0;
  var mood = chg > 1.5 ? 'bullish' : chg < -1.5 ? 'bearish' : 'neutral';
  var energy = Math.min(Math.abs(chg) * 12, 100);

  ecosystemState.marketMood  = mood;
  ecosystemState.energyLevel = energy;

  var nav    = document.getElementById('mainNav');
  var atmo   = document.getElementById('atmo');
  var nhBar  = document.getElementById('nhBar');
  var pulse  = document.getElementById('navPulse');

  if (nav) nav.className = 'energized' + (mood !== 'neutral' ? ' ' + mood : '');
  if (atmo) { atmo.className = mood !== 'neutral' ? 'energized ' + mood : 'energized'; }
  if (nhBar) {
    nhBar.className = 'nh-bar ' + (mood === 'bullish' ? 'nh-bullish' : mood === 'bearish' ? 'nh-alert' : 'nh-neutral');
    nhBar.style.width = (40 + energy * 0.6) + '%';
  }
  if (pulse) pulse.className = 'npulse' + (mood === 'bullish' ? ' green' : mood === 'bearish' ? ' red' : '');

  if (mood !== _lastMood) {
    _lastMood = mood;
    var msg = mood === 'bullish'
      ? 'ETH +' + chg.toFixed(2) + '% — Ecosystem energized ↑'
      : mood === 'bearish'
      ? 'ETH ' + chg.toFixed(2) + '% — Monitoring correction ↓'
      : 'Ecosystem intelligence online';
    triggerEcoAlert(msg, mood === 'bullish' ? 'bullish' : mood === 'bearish' ? 'alert' : 'info', 4000);
  }

  if (typeof onMarketUpdate === 'function') onMarketUpdate(tokenData, mood);
}

function _onPriceUpdate() {
  _pushHistory();
  applyPricesToDom();
  updateEcosystemMood();
}

/* ── Binance WebSocket (FIX #2: proper CLOSING state guard) ── */
function _startWebSocket() {
  if (_ws) {
    var s = _ws.readyState;
    if (s === WebSocket.CONNECTING || s === WebSocket.OPEN) return;
  }
  var streams = Object.keys(_BN_MAP).map(function (s) { return s + '@miniTicker'; }).join('/');
  try { _ws = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams); }
  catch (e) { _scheduleWsRetry(); return; }

  _ws.onopen = function () { _wsReady = true; _wsRetries = 0; };
  _ws.onmessage = function (e) {
    try {
      var msg = JSON.parse(e.data);
      var d = msg.data || msg;
      var id = _BN_MAP[(d.s || '').toLowerCase()];
      if (!id || !d.c) return;
      var price = parseFloat(d.c);
      tokenData[id] = { price: price, chg: _chgSnap[id] || (tokenData[id] ? tokenData[id].chg : 0), mcap: tokenData[id] ? tokenData[id].mcap : 0 };
      if (id === 'ethereum') ethPrice = price;
      _onPriceUpdate();
    } catch (err) {}
  };
  _ws.onerror = function () { _wsReady = false; };
  _ws.onclose = function () { _wsReady = false; _scheduleWsRetry(); };
}

function _scheduleWsRetry() {
  _wsRetries++;
  setTimeout(_startWebSocket, Math.min(30000, 2000 * Math.pow(2, _wsRetries - 1)));
}

/* ── Binance REST 24hr snapshot ── */
function _fetchBinanceSnapshot() {
  var syms = ['ETHUSDT','BTCUSDT','SOLUSDT','MATICUSDT','ARBUSDT','AVAXUSDT','LINKUSDT','UNIUSDT'];
  var url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=[' + syms.map(function (s) { return '%22' + s + '%22'; }).join(',') + ']';
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (arr) {
      arr.forEach(function (d) {
        var id = _BN_MAP[(d.symbol || '').toLowerCase()]; if (!id) return;
        var price = parseFloat(d.lastPrice), chg = parseFloat(d.priceChangePercent);
        _chgSnap[id] = chg;
        tokenData[id] = { price: price, chg: chg, mcap: tokenData[id] ? tokenData[id].mcap : 0 };
        if (id === 'ethereum') { ethPrice = price; gasPrice = Math.floor(12 + Math.random() * 38); }
      });
    });
}

/* ── CoinGecko fallback ── */
function _fetchCoinGecko() {
  var url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=ethereum,bitcoin,solana,matic-network,arbitrum,avalanche-2,chainlink,uniswap&order=market_cap_desc&sparkline=false&price_change_percentage=24h';
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (arr) {
      arr.forEach(function (c) {
        var p = c.current_price, chg = c.price_change_percentage_24h || 0;
        _chgSnap[c.id] = chg;
        tokenData[c.id] = { price: p, chg: chg, mcap: c.market_cap || 0 };
        if (c.id === 'ethereum') { ethPrice = p; gasPrice = Math.floor(12 + Math.random() * 38); }
      });
    });
}

/* ── Simulated drift (last resort) ── */
function _applyDrift() {
  Object.keys(tokenData).forEach(function (id) {
    var d = tokenData[id]; if (!d || !d.price) return;
    tokenData[id] = { price: d.price * (1 + (Math.random() - 0.499) * 0.003), chg: +(d.chg + (Math.random() - 0.5) * 0.04).toFixed(3), mcap: d.mcap };
  });
  if (tokenData.ethereum) ethPrice = tokenData.ethereum.price;
}

/* ── Gas via Cloudflare ETH RPC ── */
function _fetchGas() {
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
        applyPricesToDom();
        if (typeof updateGasOracle === 'function') updateGasOracle(gasPrice);
      }
    }
  })
  .catch(function () {});
}

/* ── Public fetch entry ── */
function fetchPrices() {
  _fetchBinanceSnapshot()
    .then(function () {
      _onPriceUpdate();
      if (!_wsReady) _startWebSocket();
    })
    .catch(function () {
      _fetchCoinGecko()
        .then(function () {
          _onPriceUpdate();
          if (!_wsReady) _startWebSocket();
        })
        .catch(function () {
          _applyDrift();
          _onPriceUpdate();
        });
    });
}

function applyFallbackPrices() {
  /* Slight random drift on fallback values */
  Object.keys(tokenData).forEach(function (id) {
    var d = tokenData[id]; if (!d) return;
    tokenData[id] = { price: d.price * (1 + (Math.random() - 0.5) * 0.002), chg: d.chg, mcap: d.mcap };
  });
  if (tokenData.ethereum) ethPrice = tokenData.ethereum.price;
  _onPriceUpdate();
}

function initPriceStreams() {
  _startWebSocket();
  _fetchGas();
  setInterval(_fetchGas, 15000);
}

/* ─── GAS ORACLE (FIX #8: correct IDs gSlow/gStd/gFast/gRapid) ────── */
function updateGasOracle(gwei) {
  if (!gwei) return;
  var sl = Math.max(gwei - 8, 1), st = gwei, fa = gwei + 12, ra = gwei + 28;
  var el = document.getElementById('gasMain');
  if (el) {
    el.textContent = gwei;
    el.className = 'gas-val';
    if (gwei > 60) el.classList.add('high');
    else if (gwei < 15) el.classList.add('low');
  }
  var pu = document.getElementById('gasUsd');
  if (pu && ethPrice) pu.textContent = '~$' + ((gwei * 21000 / 1e9) * ethPrice).toFixed(3) + '/tx';

  [['gSlow', sl], ['gStd', st], ['gFast', fa], ['gRapid', ra]].forEach(function (pair) {
    var e = document.getElementById(pair[0]); if (e) e.textContent = pair[1];
  });

  var bar = document.getElementById('gasBarEl');
  if (bar) bar.style.width = Math.min(Math.round(gwei / 120 * 100), 100) + '%';

  /* Eco intel gas card */
  var gc = document.getElementById('ei-gas'), gv = document.getElementById('ei-gval'), gs = document.getElementById('ei-gsub'), gb = document.getElementById('ei-gbar');
  if (gc) {
    var gp = gwei > 80 ? 'CRIT' : gwei > 40 ? 'HIGH' : gwei > 20 ? 'MED' : 'LOW';
    var gcl = gwei > 40 ? 'alert' : gwei > 20 ? 'active' : 'bullish';
    gc.className = 'ei-card ' + gcl;
    if (gv) gv.textContent = gp;
    if (gs) gs.textContent = gwei + ' gwei';
    if (gb) gb.style.width = Math.min(Math.round(gwei / 120 * 100), 100) + '%';
  }
}

/* ─── NETWORK ACTIVITY ─────────────────────────────────────────────── */
function updateNetworkActivity() {
  var w = document.getElementById('nrWallets'), t = document.getElementById('nrTps'), b = document.getElementById('nrBlock');
  if (w) w.textContent = Math.floor(140000 + Math.random() * 8000).toLocaleString();
  if (t) t.textContent = (Math.random() * 8 + 12).toFixed(1);
  if (b) b.textContent = (11.8 + Math.random() * 0.8).toFixed(1) + 's';
}

/* ─── STATUS BAR ───────────────────────────────────────────────────── */
function showStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  var addr = document.getElementById('sbAddr'), chain = document.getElementById('sbChain'), bal = document.getElementById('sbBal');
  if (addr)  addr.textContent  = connAddr ? (connAddr.slice(0, 6) + '...' + connAddr.slice(-4)) : '0x0000...0000';
  if (chain) chain.textContent = chainLabel(chainId);
  if (bal)   bal.textContent   = connWallet === 'Demo Mode' ? '3.2841 ETH' : '— ETH';
  sb.classList.add('on');
  document.body.classList.add('has-sbar');
  updateStatusBarMarket();
}

function hideStatusBar() {
  var sb = document.getElementById('sbar'); if (!sb) return;
  sb.classList.remove('on');
  document.body.classList.remove('has-sbar');
}

function updateStatusBarMarket() {
  var el = document.getElementById('sbMarket'); if (!el) return;
  var coins = [{ k: 'ethereum', sym: 'ETH' }, { k: 'bitcoin', sym: 'BTC' }];
  el.innerHTML = coins.map(function (it) {
    var d = tokenData[it.k] || {}, up = (d.chg || 0) >= 0;
    return '<span class="sb-mkt-item"><span style="color:var(--txt2)">' + it.sym + '</span><span style="color:' + (up ? 'var(--green)' : '#ff5555') + '">' + fmtP(d.price) + '</span></span>';
  }).join('');
}

/* ─── NAV ──────────────────────────────────────────────────────────── */
function initNav(active) {
  /* Mark active link */
  document.querySelectorAll('.nlinks a').forEach(function (a) {
    a.classList.toggle('active', a.getAttribute('data-s') === active);
  });

  /* Hamburger */
  var ham = document.getElementById('hamBtn'), navLinks = document.getElementById('navLinks');
  if (ham && navLinks) {
    ham.addEventListener('click', function () {
      ham.classList.toggle('open');
      navLinks.classList.toggle('mob-open');
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        ham.classList.remove('open');
        navLinks.classList.remove('mob-open');
      });
    });
  }

  /* FIX #5: restore wallet state BEFORE calling buildIdentity */
  var saved       = sessionStorage.getItem('rialo_addr');
  var savedWallet = sessionStorage.getItem('rialo_wallet');
  var savedChain  = parseInt(sessionStorage.getItem('rialo_chain') || '1');
  if (saved) {
    connAddr   = saved;
    connWallet = savedWallet || 'Demo Mode';
    chainId    = savedChain  || 1;
    /* Update nav UI */
    var navBtn = document.getElementById('navBtn'), navLbl = document.getElementById('navLbl');
    var nchain = document.getElementById('nchain'), nchainlbl = document.getElementById('nchainlbl');
    if (navBtn) navBtn.classList.add('connected');
    if (navLbl) navLbl.textContent = connAddr.slice(0, 6) + '...' + connAddr.slice(-4);
    if (nchain) nchain.classList.add('on');
    if (nchainlbl) nchainlbl.textContent = chainShort(chainId);
    showStatusBar();
  }

  /* navBtn click */
  var navBtn2 = document.getElementById('navBtn');
  if (navBtn2) navBtn2.addEventListener('click', openWallet);

  detectWallets();
}

/* ─── WALLET DETECTION ─────────────────────────────────────────────── */
function detectWallets() {
  setTimeout(function () {
    function setBadge(id, text, ok) {
      var el = document.getElementById(id); if (!el) return;
      el.textContent = text;
      el.className = 'wo-badge ' + (ok ? 'ok' : 'ok-install');
    }
    setBadge('mm-st',    window.ethereum && !window.ethereum.isRabby ? 'Detected' : 'Install',    !!(window.ethereum && !window.ethereum.isRabby));
    setBadge('rabby-st', window.ethereum && window.ethereum.isRabby  ? 'Detected' : 'Install',    !!(window.ethereum && window.ethereum.isRabby));
    setBadge('okx-st',   window.okxwallet                            ? 'Detected' : 'Install',    !!window.okxwallet);
    setBadge('ph-st',    window.phantom && window.phantom.ethereum   ? 'Detected' : 'Install',    !!(window.phantom && window.phantom.ethereum));
  }, 500);
}

/* ─── WALLET MODAL ─────────────────────────────────────────────────── */
function openWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.add('show');
  requestAnimationFrame(function () { requestAnimationFrame(function () { ovl.classList.add('open'); }); });
  detectWallets();
}

function closeWallet() {
  var ovl = document.getElementById('wovl'); if (!ovl) return;
  ovl.classList.remove('open');
  setTimeout(function () { ovl.classList.remove('show'); }, 420);
  /* reset loading */
  document.querySelectorAll('.wo').forEach(function (el) {
    el.classList.remove('disabled');
    var sp = el.querySelector('.wo-spin'); if (sp) sp.remove();
    var arr = el.querySelector('.wo-arr'); if (arr) arr.style.display = '';
  });
}

function bindWalletModal() {
  var wmClose = document.getElementById('wmClose');
  if (wmClose) wmClose.addEventListener('click', closeWallet);

  var wovl = document.getElementById('wovl');
  if (wovl) wovl.addEventListener('click', function (e) { if (e.target === wovl) closeWallet(); });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeWallet(); });

  function setLoading(id) {
    var el = document.getElementById(id); if (!el) return;
    var arr = el.querySelector('.wo-arr'); if (arr) arr.style.display = 'none';
    var sp = document.createElement('div'); sp.className = 'wo-spin'; el.appendChild(sp);
    document.querySelectorAll('.wo').forEach(function (w) { w.classList.add('disabled'); });
    el.classList.remove('disabled');
  }

  function connectEVM(provider, name) {
    provider.request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        if (!accounts || !accounts[0]) { toast('No account returned'); closeWallet(); return; }
        var addr = accounts[0];
        provider.request({ method: 'eth_chainId' })
          .then(function (cid) { closeWallet(); startScan(addr, name, parseInt(cid, 16)); })
          .catch(function () { closeWallet(); startScan(addr, name, 1); });
      })
      .catch(function (err) {
        closeWallet();
        if (err.code === 4001) toast('Connection cancelled');
        else toast('Could not connect — try again');
      });
  }

  var optMM = document.getElementById('opt-mm');
  if (optMM) optMM.addEventListener('click', function () {
    if (window.ethereum && !window.ethereum.isRabby) { setLoading('opt-mm'); connectEVM(window.ethereum, 'MetaMask'); }
    else { toast('MetaMask not detected'); }
  });

  var optRabby = document.getElementById('opt-rabby');
  if (optRabby) optRabby.addEventListener('click', function () {
    if (window.ethereum && window.ethereum.isRabby) { setLoading('opt-rabby'); connectEVM(window.ethereum, 'Rabby'); }
    else { toast('Rabby not detected'); }
  });

  var optOKX = document.getElementById('opt-okx');
  if (optOKX) optOKX.addEventListener('click', function () {
    if (window.okxwallet) { setLoading('opt-okx'); connectEVM(window.okxwallet, 'OKX Wallet'); }
    else { toast('OKX Wallet not detected'); }
  });

  var optPH = document.getElementById('opt-ph');
  if (optPH) optPH.addEventListener('click', function () {
    if (window.phantom && window.phantom.ethereum) { setLoading('opt-ph'); connectEVM(window.phantom.ethereum, 'Phantom'); }
    else { toast('Phantom not detected'); }
  });

  var optDemo = document.getElementById('opt-demo');
  if (optDemo) optDemo.addEventListener('click', function () {
    closeWallet();
    var demoAddrs = ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'];
    startScan(demoAddrs[Math.floor(Math.random() * demoAddrs.length)], 'Demo Mode', 1);
  });
}

/* ─── SCAN OVERLAY ─────────────────────────────────────────────────── */
var _scanPhases = [
  'Resolving ENS identity...',
  'Fetching onchain history...',
  'Calculating trust score...',
  'Analysing governance activity...',
  'Cross-referencing reputation layer...',
  'Building identity constellation...',
  'Trust layer sealed ✓'
];

function startScan(addr, wallet, cid) {
  var sovl = document.getElementById('sovl'); if (!sovl) return;
  var title = document.getElementById('scanTitle');
  var phase = document.getElementById('scanPhase');
  var sadr  = document.getElementById('scanAddr');
  var fill  = document.getElementById('spFill');
  var pct   = document.getElementById('spPct');
  var cta   = document.getElementById('scanCta');

  scActive = true;
  sovl.classList.add('show');
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      sovl.classList.add('open');
      if (title) { title.textContent = 'Identity Analysis'; title.classList.add('in'); }
    });
  });

  if (sadr)  { sadr.textContent = addr.slice(0, 8) + '...' + addr.slice(-6); setTimeout(function () { sadr.classList.add('in'); }, 400); }
  if (fill)  fill.style.width = '0%';
  if (pct)   pct.textContent  = '0%';
  if (cta)   cta.classList.remove('in');

  /* Light up scan nodes */
  for (var ni = 0; ni < 7; ni++) {
    (function (i) {
      setTimeout(function () {
        var sn = document.getElementById('sn' + i); if (!sn) return;
        sn.classList.add('lit');
        if (i === 6) sn.classList.add('gold');
      }, 300 + i * 320);
    })(ni);
  }

  /* Phase progression */
  var phIdx = 0;
  function nextPhase() {
    if (phIdx >= _scanPhases.length) return;
    if (phase) phase.textContent = _scanPhases[phIdx];
    var p = Math.round((phIdx + 1) / _scanPhases.length * 100);
    if (fill) fill.style.width = p + '%';
    if (pct)  pct.textContent  = p + '%';
    phIdx++;
    if (phIdx < _scanPhases.length) setTimeout(nextPhase, 440);
  }
  setTimeout(nextPhase, 500);

  /* FIX #4: save to sessionStorage before redirect, then show CTA */
  var totalDur = _scanPhases.length * 440 + 600;
  setTimeout(function () {
    connAddr   = addr;
    connWallet = wallet;
    chainId    = cid || 1;
    sessionStorage.setItem('rialo_addr',   connAddr);
    sessionStorage.setItem('rialo_wallet', connWallet);
    sessionStorage.setItem('rialo_chain',  chainId);

    /* Update nav */
    var navBtn = document.getElementById('navBtn'), navLbl = document.getElementById('navLbl');
    var nchain = document.getElementById('nchain'), nchainlbl = document.getElementById('nchainlbl');
    if (navBtn) navBtn.classList.add('connected');
    if (navLbl) navLbl.textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
    if (nchain) nchain.classList.add('on');
    if (nchainlbl) nchainlbl.textContent = chainShort(chainId);

    if (cta) cta.classList.add('in');
  }, totalDur);

  /* CTA button */
  if (cta) {
    cta.onclick = function () {
      closeScan();
      /* If not already on identity page, redirect */
      if (window.location.pathname.indexOf('identity') === -1) {
        window.location.href = 'identity.html';
      } else {
        showStatusBar();
        if (typeof buildIdentity === 'function') buildIdentity();
      }
    };
  }
}

function closeScan() {
  var sovl = document.getElementById('sovl'); if (!sovl) return;
  scActive = false;
  sovl.classList.remove('open');
  setTimeout(function () { sovl.classList.remove('show'); }, 500);
  for (var i = 0; i < 7; i++) {
    var sn = document.getElementById('sn' + i);
    if (sn) sn.className = 'sn';
  }
  var title = document.getElementById('scanTitle'), sadr = document.getElementById('scanAddr'), cta = document.getElementById('scanCta');
  if (title) title.classList.remove('in');
  if (sadr)  sadr.classList.remove('in');
  if (cta)   cta.classList.remove('in');
}

/* ─── DISCONNECT (FIX #10: clears idLiveInterval) ─────────────────── */
function bindDiscButton() {
  var disc = document.getElementById('discBtn');
  if (disc) disc.addEventListener('click', disconnect);
}

function disconnect() {
  if (idLiveInterval) { clearInterval(idLiveInterval); idLiveInterval = null; }

  connAddr = null; connWallet = null;
  sessionStorage.removeItem('rialo_addr');
  sessionStorage.removeItem('rialo_wallet');
  sessionStorage.removeItem('rialo_chain');

  var navBtn = document.getElementById('navBtn'), navLbl = document.getElementById('navLbl');
  var nchain = document.getElementById('nchain');
  if (navBtn) navBtn.classList.remove('connected');
  if (navLbl) navLbl.textContent = 'Connect Wallet';
  if (nchain) nchain.classList.remove('on');

  hideStatusBar();
  toast('Disconnected');
  triggerEcoAlert('Wallet disconnected — identity session ended', 'info', 3000);

  if (typeof buildIdentity === 'function') buildIdentity();
  if (window.location.pathname.indexOf('identity') >= 0) {
    /* stay on page, buildIdentity will show empty state */
  }
}

/* ─── WALLET CONNECTED ─────────────────────────────────────────────── */
function onWalletConnected(addr, wallet, cid) {
  showStatusBar();
  triggerEcoAlert('Identity verified ✓ — ' + (wallet || 'Wallet') + ' connected', 'bullish', 3500);
  triggerFlash('green-flash');
  toast('Connected — ' + addr.slice(0, 6) + '...' + addr.slice(-4));
  if (typeof buildIdentity === 'function') buildIdentity();
}

/* ─── BG CANVAS ────────────────────────────────────────────────────── */
var _bgC = null, _bgX = null, _bgNodes = [];

function initBgCanvas() {
  _bgC = document.getElementById('BG'); if (!_bgC) return;
  _bgX = _bgC.getContext('2d');
  function resize() { _bgC.width = window.innerWidth; _bgC.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  for (var i = 0; i < 32; i++) {
    _bgNodes.push({
      x: Math.random() * (window.innerWidth || 1400),
      y: Math.random() * (window.innerHeight || 800),
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.8 + 0.4,
      p: Math.random() * Math.PI * 2
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
    var a = (Math.sin(n.p) * 0.5 + 0.5) * 0.18 + 0.04;
    _bgX.beginPath(); _bgX.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    _bgX.fillStyle = 'rgba(0,200,224,' + a + ')'; _bgX.fill();
  });
  for (var i = 0; i < _bgNodes.length; i++) {
    for (var j = i + 1; j < _bgNodes.length; j++) {
      var dx = _bgNodes[i].x - _bgNodes[j].x, dy = _bgNodes[i].y - _bgNodes[j].y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 180) {
        _bgX.beginPath(); _bgX.strokeStyle = 'rgba(0,200,224,' + (1 - d / 180) * 0.055 + ')';
        _bgX.lineWidth = 0.4; _bgX.moveTo(_bgNodes[i].x, _bgNodes[i].y); _bgX.lineTo(_bgNodes[j].x, _bgNodes[j].y); _bgX.stroke();
      }
    }
  }
}

/* ─── HEX CANVAS ───────────────────────────────────────────────────── */
var _hexC = null, _hexX = null;

function initHexCanvas() {
  _hexC = document.getElementById('hexC'); if (!_hexC) return;
  _hexX = _hexC.getContext('2d');
}

function drawHex(t) {
  if (!_hexC || !_hexX) return;
  var W = _hexC.width, H = _hexC.height;
  _hexX.clearRect(0, 0, W, H);
  var cx = W / 2, cy = H / 2, r = 62, sides = 6, a0 = t * 0.0006;
  [1.0, 0.72, 0.44].forEach(function (scale, ki) {
    _hexX.beginPath();
    for (var s = 0; s <= sides; s++) {
      var angle = (s / sides) * Math.PI * 2 + a0 * (ki % 2 === 0 ? 1 : -1);
      var px = cx + Math.cos(angle) * r * scale, py = cy + Math.sin(angle) * r * scale;
      s === 0 ? _hexX.moveTo(px, py) : _hexX.lineTo(px, py);
    }
    _hexX.strokeStyle = 'rgba(0,200,224,' + (0.22 - ki * 0.065) + ')'; _hexX.lineWidth = 0.8; _hexX.stroke();
  });
  var ga = Math.sin(t * 0.002) * 0.5 + 0.5;
  _hexX.beginPath(); _hexX.arc(cx, cy, 7 + ga * 3, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(0,200,224,' + (0.6 + ga * 0.35) + ')'; _hexX.fill();
  var oa = t * 0.0018, ox = cx + Math.cos(oa) * 44, oy = cy + Math.sin(oa) * 44;
  _hexX.beginPath(); _hexX.arc(ox, oy, 2.5, 0, Math.PI * 2);
  _hexX.fillStyle = 'rgba(196,154,42,0.9)'; _hexX.fill();
}

/* ─── CURSOR ───────────────────────────────────────────────────────── */
var _cur = null, _cur2 = null, _mx = 0, _my = 0, _tx = 0, _ty = 0;

function initCursor() {
  _cur  = document.getElementById('CUR');
  _cur2 = document.getElementById('CUR2');
  if (!_cur || !_cur2) return;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

  document.addEventListener('mousemove', function (e) {
    _mx = e.clientX; _my = e.clientY;
    _cur.style.left = _mx + 'px'; _cur.style.top = _my + 'px';
  });
  document.addEventListener('mousedown', function () { document.body.classList.add('cclick'); });
  document.addEventListener('mouseup',   function () { document.body.classList.remove('cclick'); });

  (function animCur() {
    _tx += (_mx - _tx) * 0.12; _ty += (_my - _ty) * 0.12;
    _cur2.style.left = _tx + 'px'; _cur2.style.top = _ty + 'px';
    requestAnimationFrame(animCur);
  })();

  hookCursor();
  setInterval(hookCursor, 1500);
}

function hookCursor() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
  var sel = 'a,button,.wo,.fc,.mc,.wcard,.dev-card,.abar,.cpill,.rep-item,.validator-item,.swap-token-row,.bc-chain,.itab,.eco-fbtn,.tr-item,.gas-tier';
  document.querySelectorAll(sel).forEach(function (el) {
    if (el._ch) return; el._ch = 1;
    el.addEventListener('mouseenter', function () { document.body.classList.add('chl'); });
    el.addEventListener('mouseleave', function () { document.body.classList.remove('chl'); });
  });
}

/* ─── RIPPLE ───────────────────────────────────────────────────────── */
function initRipple() {
  function addRipple(btn) {
    if (btn._rh) return; btn._rh = true;
    btn.addEventListener('click', function (e) {
      var rect = btn.getBoundingClientRect();
      var sz = Math.max(rect.width, rect.height) * 1.8;
      var rp = document.createElement('div');
      rp.className = 'btn-ripple';
      rp.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;left:' + (e.clientX - rect.left - sz / 2) + 'px;top:' + (e.clientY - rect.top - sz / 2) + 'px';
      btn.querySelectorAll('.btn-ripple').forEach(function (r) { r.remove(); });
      btn.appendChild(rp);
      setTimeout(function () { rp.remove(); }, 600);
    });
  }
  document.querySelectorAll('.btn,.btn-ghost').forEach(addRipple);
  /* watch for dynamically added buttons */
  setInterval(function () { document.querySelectorAll('.btn,.btn-ghost').forEach(addRipple); }, 1500);
}

/* ─── SCROLL REVEAL ────────────────────────────────────────────────── */
function initReveal() {
  var els = document.querySelectorAll('.rv'); if (!els.length) return;
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    els.forEach(function (el) { obs.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }
}

/* ─── ETHEREUM EVENTS ──────────────────────────────────────────────── */
if (window.ethereum) {
  window.ethereum.on('accountsChanged', function (accs) {
    if (!accs.length) { disconnect(); }
    else if (connAddr && accs[0].toLowerCase() !== connAddr.toLowerCase()) {
      connAddr = accs[0];
      sessionStorage.setItem('rialo_addr', connAddr);
      var navLbl = document.getElementById('navLbl'), sbAddr = document.getElementById('sbAddr');
      var short = connAddr.slice(0, 6) + '...' + connAddr.slice(-4);
      if (navLbl) navLbl.textContent = short;
      if (sbAddr) sbAddr.textContent = short;
      toast('Account changed: ' + short);
      if (typeof buildIdentity === 'function') buildIdentity();
    }
  });
  window.ethereum.on('chainChanged', function (cid) {
    chainId = parseInt(cid, 16);
    sessionStorage.setItem('rialo_chain', chainId);
    var sbChain = document.getElementById('sbChain'), nchainlbl = document.getElementById('nchainlbl');
    if (sbChain)    sbChain.textContent    = chainLabel(chainId);
    if (nchainlbl)  nchainlbl.textContent  = chainShort(chainId);
    toast('Network: ' + chainLabel(chainId));
  });
}
