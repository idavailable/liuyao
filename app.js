/* 六爻排盘 UI (app.js) 依赖 core.js（浏览器中挂于 window.LY） */
(function () {
  const C = window.LY;

  const $ = function (s) { return document.querySelector(s); };

  const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const TOSS_MEAN = {
    1: { name: '单', sym: '━━━━━', desc: '少阳 · 静' },
    0: { name: '拆', sym: '━━　━━', desc: '少阴 · 静' },
    9: { name: '重', sym: '━━━━━ ○', desc: '老阳 · 发动' },
    6: { name: '交', sym: '━━　━━ ✕', desc: '老阴 · 发动' }
  };

  let selectedDate = new Date();
  let records = [];            // 已定之爻 {coins, backs, val}
  let curCoins = ['背', '背', '背'];
  let pan = null;
  let lastBullets = [];

  // ---------- 时间 ----------
  function fmtDT(dt) {
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()) +
      ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
  }
  function renderTime() {
    const pil = C.fourPillars(selectedDate);
    $('#timeInfo').innerHTML =
      '<div class="muted">公历 ' + fmtDT(selectedDate) + '</div>' +
      '<div class="gz">' + pil.yearGZ + '年 · ' + pil.monthGZ + '月 · <b>' + pil.dayGZ + '日</b> · ' + pil.hourGZ + '时</div>' +
      '<div class="muted">月建 <b class="kong">' + C.ZHI[pil.monthZhi] + '</b> ｜ 日辰 <b class="kong">' + C.ZHI[pil.dayZhi] + '</b> ｜ 旬空 <b class="kong">' + pil.kongStr + '</b></div>';
    const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    if (!$('#dtInput').value) {
      $('#dtInput').value = selectedDate.getFullYear() + '-' + p2(selectedDate.getMonth() + 1) + '-' + p2(selectedDate.getDate()) +
        'T' + p2(selectedDate.getHours()) + ':' + p2(selectedDate.getMinutes());
    }
  }

  // ---------- 起卦 ----------
  function renderCoins() {
    $('#coinRow').innerHTML = curCoins.map(function (c, i) {
      return '<button class="coin' + (c === '字' ? ' is-zhi' : '') + '" data-i="' + i + '">' + c + '</button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.coin'), function (btn) {
      btn.onclick = function () {
        curCoins[+btn.dataset.i] = curCoins[+btn.dataset.i] === '背' ? '字' : '背';
        renderCoins(); renderTossHint();
      };
    });
  }
  function backCount() { return curCoins.filter(function (c) { return c === '背'; }).length; }
  function tossValFromBacks(n) { return n === 1 ? 1 : n === 2 ? 0 : n === 3 ? 9 : 6; }

  function renderTossHint() {
    const n = backCount();
    const v = tossValFromBacks(n);
    const t = TOSS_MEAN[v];
    $('#tossHint').innerHTML = '<b>' + t.name + '</b>（' + n + ' 背 ' + (3 - n) + ' 字）→ ' + t.sym + ' 　' + t.desc;
  }
  function renderStack() {
    let html = '';
    for (let i = 5; i >= 0; i--) {
      const r = records[i];
      if (r) {
        const t = TOSS_MEAN[r.val];
        html += '<div class="yao-slot' + (r.val === 9 || r.val === 6 ? ' moving-y' : '') + '">' +
          '<span class="nm">' + LINE_NAMES[i] + '</span><span>' + t.sym + '</span></div>';
      } else if (i === records.length) {
        html += '<div class="yao-slot current"><span class="nm">' + LINE_NAMES[i] + '</span><span>？</span></div>';
      } else {
        html += '<div class="yao-slot"><span class="nm">' + LINE_NAMES[i] + '</span><span>—</span></div>';
      }
    }
    $('#yaoStack').innerHTML = html;
    $('#stepHint').textContent = records.length < 6 ?
      ('第 ' + (records.length + 1) + ' 次摇卦，装' + LINE_NAMES[records.length] + '。静心默念所测之事。') :
      '六爻已成。';
  }

  $('#btnRandom').onclick = function () {
    curCoins = curCoins.map(function () { return Math.random() < 0.5 ? '背' : '字'; });
    renderCoins(); renderTossHint();
  };
  $('#btnConfirm').onclick = function () {
    if (records.length >= 6) return;
    const n = backCount();
    records.push({ coins: curCoins.slice(), backs: n, val: tossValFromBacks(n) });
    curCoins = ['背', '背', '背'];
    renderCoins(); renderTossHint(); renderStack();
    if (records.length === 6) computePan();
  };
  $('#btnUndo').onclick = function () {
    if (!records.length) return;
    records.pop(); pan = null;
    $('#panCard').hidden = true; $('#analysisCard').hidden = true; $('#aiCard').hidden = true;
    renderStack();
  };
  $('#btnReset').onclick = function () {
    records = []; pan = null; curCoins = ['背', '背', '背'];
    $('#panCard').hidden = true; $('#analysisCard').hidden = true; $('#aiCard').hidden = true;
    $('#useSelect').value = ''; lastBullets = [];
    renderCoins(); renderTossHint(); renderStack();
  };
  $('#dtInput').onchange = function () {
    if (!this.value) return;
    selectedDate = new Date(this.value);
    renderTime();
    if (records.length === 6) computePan();
  };

  // ---------- 排盘 ----------
  function computePan() {
    pan = C.paipan(records.map(function (r) { return r.val; }), selectedDate);
    renderPan();
    resetAIState();
    $('#panCard').hidden = false;
    $('#analysisCard').hidden = false;
    $('#aiCard').hidden = false;
    renderAnalysis();
    $('#panCard').scrollIntoView({ behavior: 'smooth' });
  }

  function yaoSymHTML(yang, moving, old) {
    const base = yang ? '━━━━━━━' : '━━━　━━━';
    const mark = old === 9 ? ' ○' : old === 6 ? ' ✕' : '';
    return '<span class="yao-sym' + (moving ? ' moving' : '') + '">' + base + mark + '</span>';
  }

  function renderPan() {
    const pil = pan.pillars;
    const title = '<b>' + pan.benName + '</b>（' + pan.palace + '宫 · ' + pan.palaceWx + '）' +
      (pan.hasBian ? ' 之 <b>' + pan.bianName + '</b>（' + pan.bianPalace + '宫）' : '（静卦）');
    let rows = '';
    for (let i = 5; i >= 0; i--) {
      const L = pan.lines[i];
      const kongCls = pil.kong.indexOf(L.zhiIdx) >= 0 ? ' class="kong"' : '';
      rows += '<tr>' +
        '<td>' + L.beast + '</td>' +
        '<td class="fu-cell">' + (L.fu ? L.fu.lq + '<br>' + L.fu.zhi : '') + '</td>' +
        '<td>' + L.lq + ' ' + L.gan + L.zhi + '<br>' + yaoSymHTML(L.yang, L.moving, L.old) + '</td>' +
        '<td>' + (L.shi ? '<span class="badge-shi">世</span>' : L.ying ? '<span class="badge-ying">应</span>' : '') + '</td>' +
        '<td class="bian-cell">' + (L.moving && L.bian ? L.bian.lq + ' ' + L.bian.gan + L.bian.zhi : '') + '</td>' +
        '</tr>';
    }
    $('#panBody').innerHTML =
      '<div class="hex-title">' + title + '</div>' +
      '<div class="meta-line">占时 ' + fmtDT(selectedDate) + ' ｜ ' + pil.yearGZ + '年 ' + pil.monthGZ + '月 ' + pil.dayGZ + '日 ' + pil.hourGZ + '时 ｜ 旬空 <span class="kong">' + pil.kongStr + '</span></div>' +
      '<table class="pan"><thead><tr><th>六神</th><th>伏神</th><th>本卦</th><th>世应</th><th>变爻</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ---------- 断卦 ----------
  function renderAnalysis() {
    const target = $('#useSelect').value;
    const list = $('#conclList');
    const vBox = $('#verdictBox');
    if (!target) {
      list.innerHTML = '<li>选择所测之事，先观用神旺衰。通用次第：一观世爻旺衰，二观用神与世应，三审动爻生克，四定旬空月破与应期。</li>';
      vBox.hidden = true; lastBullets = [];
      return;
    }
    const res = C.analyze(pan, target);
    lastBullets = res.bullets;
    list.innerHTML = res.bullets.map(function (b) {
      return '<li' + (b.indexOf('⚠') >= 0 ? ' class="warn"' : '') + '>' + b + '</li>';
    }).join('');
    vBox.hidden = false;
    vBox.innerHTML = '<b>粗判</b>　' + res.verdict;
  }
  $('#useSelect').onchange = renderAnalysis;

  // ---------- 排盘文本（复制与 AI 共用） ----------
  function buildPanText(forAI) {
    const pil = pan.pillars;
    let txt = '【六爻排盘】\n';
    txt += '时间：' + fmtDT(selectedDate) + '（' + pil.yearGZ + '年 ' + pil.monthGZ + '月 ' + pil.dayGZ + '日 ' + pil.hourGZ + '时，旬空' + pil.kongStr + '）\n';
    const t = $('#useSelect').value;
    const useMap = { '妻财': '求财·买卖', '官鬼': '功名·官司·疾病', '父母': '考试·文书', '子孙': '子女·医药', '兄弟': '朋友·竞争', 'shi': '自身运势' };
    if (t) txt += '所测：' + (useMap[t] || t) + '\n';
    txt += '本卦：' + pan.benName + '（' + pan.palace + '宫·' + pan.palaceWx + '）' +
      (pan.hasBian ? ' 之 ' + pan.bianName + '（' + pan.bianPalace + '宫）' : '（静卦）') + '\n';
    txt += '六神　伏神　本卦　　　世应　变爻\n';
    for (let i = 5; i >= 0; i--) {
      const L = pan.lines[i];
      const sym = L.yang ? '━━━' : '─ ─';
      const mark = L.old === 9 ? '○' : L.old === 6 ? '✕' : ' ';
      txt += (L.beast + '　　').slice(0, 4) + ' ' +
        (L.fu ? L.fu.lq + L.fu.zhi : '　　') + '　' +
        L.lq + L.gan + L.zhi + sym + mark + '　' +
        (L.shi ? '世' : L.ying ? '应' : '　') + '　' +
        (L.moving && L.bian ? L.bian.lq + L.bian.gan + L.bian.zhi : '') + '\n';
    }
    if (lastBullets.length) {
      txt += '\n【旺衰粗判】\n';
      lastBullets.forEach(function (b) {
        txt += '- ' + b.replace(/<[^>]+>/g, '') + '\n';
      });
    }
    if (!forAI) txt += '\n请依京房纳甲六爻法通盘断卦：世应关系、动爻生克、用神取舍、应期推断，并给出白话结论。';
    return txt;
  }

  // ---------- 复制文本 ----------
  $('#btnCopy').onclick = function () {
    if (!pan) return;
    const txt = buildPanText(false);
    const done = function () {
      const btn = $('#btnCopy'); const old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(function () { fallbackCopy(txt); done(); });
    } else { fallbackCopy(txt); done(); }
  };
  function fallbackCopy(txt) {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }

  // ---------- AI 断卦 / 进阶探讨 / 卦例库 ----------
  let chatHistory = [];
  let castId = null;

  function resetAIState() {
    chatHistory = []; castId = null;
    const reply = $('#aiReply'); if (reply) reply.innerHTML = '';
    const list = $('#chatList'); if (list) list.innerHTML = '';
    const box = $('#chatBox'); if (box) box.hidden = true;
    const btn = $('#btnSave'); if (btn) btn.textContent = '存入卦例库';
    const btnAI = $('#btnAI'); if (btnAI) { btnAI.disabled = false; btnAI.textContent = '开始断卦'; }
  }

  function apiHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const code = localStorage.getItem('ly_access_code');
    if (code) h['X-Access-Code'] = code;
    return h;
  }

  async function apiFetch(path, opts) {
    let res = await fetch(path, Object.assign({ headers: apiHeaders() }, opts || {}));
    if (res.status === 401) {
      const code = prompt('此站点已启用访问口令，请输入：');
      if (code) {
        localStorage.setItem('ly_access_code', code);
        res = await fetch(path, Object.assign({ headers: apiHeaders() }, opts || {}));
      }
    }
    return res;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }
  function mdLite(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>')
      .replace(/\n/g, '<br>');
  }

  async function callInterpret() {
    const res = await apiFetch('/api/interpret', {
      method: 'POST',
      body: JSON.stringify({ panText: buildPanText(true), messages: chatHistory })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
    return data.reply;
  }

  $('#btnAI').onclick = async function () {
    if (!pan) return;
    const btn = $('#btnAI');
    btn.disabled = true; btn.textContent = '卦师推敲中…';
    $('#aiReply').innerHTML = '<div class="loading">正在将排盘呈予大模型通盘断卦…</div>';
    try {
      const reply = await callInterpret();
      chatHistory.push({ role: 'assistant', content: reply });
      $('#aiReply').innerHTML = '<div class="ai-block">' + mdLite(reply) + '</div>';
      $('#chatBox').hidden = false;
      renderChatList();
      autoSaveCast();
    } catch (e) {
      $('#aiReply').innerHTML = '<div class="ai-block warn">断卦失败：' + esc(e.message) +
        '（本地直接打开 index.html 时 /api 接口不存在，需部署到 Cloudflare Pages 后使用）</div>';
    } finally {
      btn.disabled = false; btn.textContent = '重新断卦';
    }
  };

  function renderChatList() {
    $('#chatList').innerHTML = chatHistory.slice(1).map(function (m) {
      return '<div class="msg ' + (m.role === 'user' ? 'user' : 'ai') + '"><b>' +
        (m.role === 'user' ? '问' : '断') + '：</b>' + mdLite(m.content) + '</div>';
    }).join('');
  }

  async function sendChat() {
    const input = $('#chatInput');
    const q = input.value.trim();
    if (!q) return;
    chatHistory.push({ role: 'user', content: q });
    input.value = '';
    renderChatList();
    $('#chatList').insertAdjacentHTML('beforeend', '<div class="msg ai" id="chatLoading"><span class="loading">卦师推敲中…</span></div>');
    try {
      const reply = await callInterpret();
      const el = document.getElementById('chatLoading'); if (el) el.remove();
      chatHistory.push({ role: 'assistant', content: reply });
      renderChatList();
      autoSaveCast();
    } catch (e) {
      const el = document.getElementById('chatLoading'); if (el) el.remove();
      $('#chatList').insertAdjacentHTML('beforeend', '<div class="msg ai" style="color:var(--cinnabar)">出错了：' + esc(e.message) + '</div>');
    }
  }
  $('#btnChat').onclick = sendChat;
  $('#chatInput').onkeydown = function (e) { if (e.key === 'Enter') sendChat(); };

  function recordPayload() {
    const pil = pan.pillars;
    return {
      id: castId,
      datetime: fmtDT(selectedDate),
      pillars: pil.yearGZ + '年 ' + pil.monthGZ + '月 ' + pil.dayGZ + '日 ' + pil.hourGZ + '时',
      question: $('#useSelect').value ? $('#useSelect option:checked').textContent : '',
      hex: pan.benName + (pan.hasBian ? ' 之 ' + pan.bianName : '（静卦）'),
      tosses: records,
      panText: buildPanText(true),
      messages: chatHistory
    };
  }

  async function autoSaveCast() {
    try {
      const res = await apiFetch('/api/records', { method: 'POST', body: JSON.stringify(recordPayload()) });
      const data = await res.json();
      if (res.ok && data.id) { castId = data.id; $('#btnSave').textContent = '已入卦例库 ✓'; }
    } catch (e) { /* 静默：数据库未绑定时不打扰断卦 */ }
  }

  $('#btnSave').onclick = async function () {
    if (!pan) return;
    const btn = $('#btnSave'); btn.disabled = true;
    try {
      const res = await apiFetch('/api/records', { method: 'POST', body: JSON.stringify(recordPayload()) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '保存失败');
      castId = data.id;
      btn.textContent = '已入卦例库 ✓';
    } catch (e) {
      alert('保存失败：' + e.message);
    } finally { btn.disabled = false; }
  };

  $('#btnLib').onclick = async function () {
    $('#libList').innerHTML = '<div class="muted">载入中…</div>';
    try {
      const res = await apiFetch('/api/records', {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '读取失败');
      if (!data.records.length) { $('#libList').innerHTML = '<div class="muted">尚无卦例。</div>'; return; }
      $('#libList').innerHTML = data.records.map(function (r) {
        return '<div class="lib-item" data-id="' + r.id + '"><span>' + esc(r.question || '（未注明所测）') + ' · ' + esc(r.hex) +
          '</span><span class="muted">' + esc((r.created_at || '').slice(0, 10)) + '</span></div>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('.lib-item'), function (el) {
        el.onclick = function () { loadCast(el.dataset.id); };
      });
    } catch (e) {
      $('#libList').innerHTML = '<div class="muted">读取失败：' + esc(e.message) + '</div>';
    }
  };

  async function loadCast(id) {
    const res = await apiFetch('/api/records?id=' + encodeURIComponent(id), {});
    const data = await res.json();
    if (!res.ok) { alert('读取失败：' + (data.message || '')); return; }
    const r = data.record;
    let msgs = []; try { msgs = JSON.parse(r.messages || '[]'); } catch (e) {}
    $('#libDetail').innerHTML = '<div class="ai-block"><b>' + esc(r.hex) + '</b>　<span class="muted">' +
      esc(r.datetime || '') + '　' + esc(r.pillars || '') + '</span>' +
      '<pre class="pan-text">' + esc(r.pan_text || '') + '</pre>' +
      msgs.map(function (m) {
        return '<div class="msg ' + (m.role === 'user' ? 'user' : 'ai') + '"><b>' +
          (m.role === 'user' ? '问' : '断') + '：</b>' + mdLite(m.content) + '</div>';
      }).join('') + '</div>';
    $('#libDetail').scrollIntoView({ behavior: 'smooth' });
  }

  // ---------- init ----------
  renderTime();
  renderCoins();
  renderTossHint();
  renderStack();
})();
