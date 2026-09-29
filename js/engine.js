// サウンドノベル・エンジン
(function () {
  'use strict';
  const { ENDINGS, START } = window.GAMEDATA;
  const KEY = 'dtnoyoru_';
  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), bg: $('bg'), snow: $('snow'), charas: $('charas'), tint: $('tint'), flash: $('flash'),
    layer: $('textlayer'), text: $('text'), choices: $('choices'), cursor: $('cursor'), titlecard: $('titlecard'),
    title: $('title'), titleMenu: $('title-menu'), titleInfo: $('title-info'),
    panel: $('panel'), panelTitle: $('panel-title'), panelBody: $('panel-body'), panelClose: $('panel-close'),
    ending: $('ending')
  };

  // ---------- 保存 ----------
  function load(k, def) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function store(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境でも遊べる */ } }
  const G = load('global', {});
  G.endings = G.endings || {};
  G.read = G.read || {};
  G.chosen = G.chosen || {};
  G.settings = Object.assign({ speed: 70, bgm: 0.6, se: 0.8, auto: 50 }, G.settings || {});
  const readSets = {};
  Object.keys(G.read).forEach(k => { readSets[k] = new Set(G.read[k]); });
  let globalDirty = false;
  function saveGlobal() {
    Object.keys(readSets).forEach(k => { G.read[k] = Array.from(readSets[k]); });
    store('global', G); globalDirty = false;
  }
  setInterval(() => { if (globalDirty) saveGlobal(); }, 3000);
  window.addEventListener('pagehide', saveGlobal);
  SOUND.setVolume('bgm', G.settings.bgm); SOUND.setVolume('se', G.settings.se);

  // ---------- シナリオ ----------
  const parsed = DSL.parse(window.SCN_SOURCES || []);
  if (parsed.errors.length) console.warn('シナリオのエラー:\n' + parsed.errors.join('\n'));
  const SCENES = parsed.scenes;

  // ---------- 状態 ----------
  let S = null;             // 現在のプレイ状態
  let page = null;          // 現在ページの開始地点（セーブ用）
  let waiting = null;       // 'text' | 'choice' | 'title' | 'wait' | 'ending' | null
  let typing = null;        // タイプ中の情報
  let skip = false, ctrlSkip = false, auto = false, autoTimer = null;
  let log = [];
  let busy = false;

  function newState() {
    return { scene: START, ip: 0, vars: {}, bg: 'black', bgm: 'stop', chara: [], tint: 'normal', snow: false };
  }
  function snapshot() {
    return { scene: S.scene, ip: S.ip, vars: JSON.parse(JSON.stringify(S.vars)), bg: S.bg, bgm: S.bgm, chara: S.chara.slice(), tint: S.tint, snow: S.snow };
  }

  // ---------- 式 ----------
  function scope(writable) {
    const extra = { gold: G.gold ? 1 : 0 };
    ENDINGS.forEach(e => { extra['seen_' + e.id] = G.endings[e.id] ? 1 : 0; });
    return new Proxy(S.vars, {
      has: () => true,
      get: (t, k) => {
        if (k === Symbol.unscopables) return undefined;
        if (k in t) return t[k];
        if (k in extra) return extra[k];
        return 0;
      },
      set: (t, k, v) => { if (writable) t[k] = v; return true; }
    });
  }
  function evalCond(expr) {
    try { return !!new Function('v', 'with(v){return (' + expr + ')}')(scope(false)); }
    catch (e) { console.warn('条件式エラー', expr, e); return false; }
  }
  function execSet(expr) {
    expr.split(',').forEach(p => {
      try { new Function('v', 'with(v){' + p + '}')(scope(true)); } catch (e) { console.warn('@set エラー', p, e); }
    });
  }

  // ---------- 表示 ----------
  function setBG(id, instant) {
    S.bg = id;
    el.bg.style.backgroundImage = 'url(' + ART.drawBG(id) + ')';
    if (!instant) { el.bg.classList.remove('fade'); void el.bg.offsetWidth; el.bg.classList.add('fade'); }
  }
  function setChara(ids) {
    S.chara = ids.slice();
    const old = Array.from(el.charas.children);
    const keep = {};
    old.forEach(d => { if (ids.indexOf(d.dataset.id) >= 0) keep[d.dataset.id] = d; else { d.classList.remove('on'); setTimeout(() => d.remove(), 500); } });
    ids.forEach((id, i) => {
      let d = keep[id];
      if (!d) {
        d = document.createElement('div');
        d.className = 'sil'; d.dataset.id = id;
        d.innerHTML = ART.silhouetteSVG(id);
        const s = ART.SIL[id];
        d.style.height = ((s ? s.h : 1) * 100) + '%';
        el.charas.appendChild(d);
        requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('on')));
      }
      d.style.order = i;
    });
  }
  function setTint(t) {
    S.tint = t;
    el.tint.className = (t === 'red' || t === 'blue') ? t : '';
  }
  function setSnow(on) { S.snow = on; snowOn = on; }
  function doFx(name) {
    switch (name) {
      case 'shake': el.stage.classList.remove('shake'); void el.stage.offsetWidth; el.stage.classList.add('shake'); break;
      case 'flash': el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go'); break;
      case 'red': case 'blue': case 'normal': setTint(name); break;
      case 'snow': setSnow(true); break;
      case 'nosnow': setSnow(false); break;
    }
  }
  function clearText() {
    el.text.innerHTML = ''; el.choices.innerHTML = '';
  }
  function restoreVisuals(st) {
    setBG(st.bg, true); setChara(st.chara || []); setTint(st.tint || 'normal'); setSnow(!!st.snow);
    S.bgm = st.bgm || 'stop'; SOUND.bgm(S.bgm);
  }

  // ---------- 雪 ----------
  let snowOn = false;
  const flakes = [];
  const sctx = el.snow.getContext('2d');
  function resizeSnow() { el.snow.width = el.stage.clientWidth; el.snow.height = el.stage.clientHeight; }
  window.addEventListener('resize', resizeSnow); resizeSnow();
  for (let i = 0; i < 140; i++) flakes.push({ x: Math.random(), y: Math.random(), r: Math.random() * 2.6 + 0.8, s: Math.random() * 0.0012 + 0.0006, d: Math.random() * 6 });
  (function frame(t) {
    const w = el.snow.width, h = el.snow.height;
    sctx.clearRect(0, 0, w, h);
    const show = snowOn || el.title.classList.contains('on');
    if (show) {
      sctx.fillStyle = 'rgba(255,255,255,0.85)';
      flakes.forEach(f => {
        f.y += f.s; if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
        const x = (f.x + Math.sin(t / 1600 + f.d) * 0.01) * w;
        sctx.beginPath(); sctx.arc(x, f.y * h, f.r, 0, 7); sctx.fill();
      });
    }
    requestAnimationFrame(frame);
  })(0);

  // ---------- 実行 ----------
  function scene() { return SCENES[S.scene]; }
  function jump(id) {
    if (!SCENES[id]) { missing(id); return false; }
    S.scene = id; S.ip = 0; return true;
  }
  function missing(id) {
    waiting = 'wait';
    addLine('（このシナリオ「' + id + '」はまだ準備中です。タイトルに戻ります）', 'em', true);
    setTimeout(toTitle, 2500);
  }
  function markPage() {
    page = snapshot();
    store('save_auto', Object.assign({ time: Date.now(), preview: '' }, page));
  }

  function run() {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        const sc = scene();
        if (!sc) { missing(S.scene); return; }
        if (S.ip >= sc.ops.length) { missing('（' + S.scene + ' の続き）'); return; }
        const op = sc.ops[S.ip];
        const here = S.ip;
        S.ip++;
        switch (op.t) {
          case 'text':
            showText(op, here);
            return;
          case 'page':
            clearText(); markPage(); break;
          case 'bg': setBG(op.arg); break;
          case 'bgm': S.bgm = op.arg; SOUND.bgm(op.arg); break;
          case 'se': if (!skipping()) SOUND.se(op.arg); break;
          case 'chara': setChara(op.args); break;
          case 'fx': if (!skipping() || ['red', 'blue', 'normal', 'snow', 'nosnow'].includes(op.arg)) doFx(op.arg); break;
          case 'set': execSet(op.arg); break;
          case 'if': if (evalCond(op.cond)) { if (!jump(op.to)) return; } break;
          case 'goto': if (!jump(op.arg)) return; break;
          case 'wait':
            if (skipping()) break;
            waiting = 'wait';
            setTimeout(() => { if (waiting === 'wait') { waiting = null; run(); } }, parseInt(op.arg, 10) || 500);
            return;
          case 'title':
            showTitleCard(op.arg); return;
          case 'choice':
            showChoice(op, here); return;
          case 'ending':
            showEnding(op.arg); return;
        }
      }
    } finally { busy = false; }
  }

  function skipping() { return skip || ctrlSkip; }
  function isRead(sceneId, ip) { const s = readSets[sceneId]; return !!(s && s.has(ip)); }
  function markRead(sceneId, ip) { (readSets[sceneId] = readSets[sceneId] || new Set()).add(ip); globalDirty = true; }

  function addLine(s, style) {
    const p = document.createElement('p');
    if (style && style !== 'normal') p.className = style;
    el.text.appendChild(p);
    // はみ出しそうなら、前の行を消す
    const avail = el.layer.clientHeight * 0.8;
    while (el.text.scrollHeight > avail && el.text.children.length > 1) el.text.removeChild(el.text.firstChild);
    p.textContent = s;
    return p;
  }

  function showText(op, ip) {
    const read = isRead(S.scene, ip);
    if (skipping() && !read) { stopSkip(); }
    markRead(S.scene, ip);
    log.push({ s: op.s, style: op.style }); if (log.length > 400) log.shift();
    const p = addLine('', op.style);
    waiting = 'text';
    el.cursor.classList.remove('on');
    const full = op.s;
    if (skipping() || G.settings.speed >= 100) {
      p.textContent = full; typing = null; afterText(full);
      return;
    }
    const cps = 12 + G.settings.speed * 1.2; // 1秒あたりの文字数
    const start = performance.now();
    typing = { p: p, full: full, done: false };
    const tk = typing;
    (function step(now) {
      if (tk.done) return;
      const n = Math.floor((now - start) / 1000 * cps) + 1;
      if (n >= full.length) { tk.done = true; p.textContent = full; typing = null; afterText(full); return; }
      p.textContent = full.slice(0, n);
      requestAnimationFrame(step);
    })(start);
  }
  function finishTyping() {
    if (!typing) return false;
    typing.done = true; typing.p.textContent = typing.full;
    const f = typing.full; typing = null; afterText(f); return true;
  }
  function afterText(full) {
    el.cursor.classList.add('on');
    clearTimeout(autoTimer);
    if (skipping()) { autoTimer = setTimeout(() => advance(), 25); return; }
    if (auto) autoTimer = setTimeout(() => advance(), 900 + full.length * (120 - G.settings.auto));
  }
  function advance() {
    if (waiting === 'title') { endTitleCard(); return; }
    if (waiting !== 'text') return;
    if (finishTyping()) return;
    clearTimeout(autoTimer);
    waiting = null; el.cursor.classList.remove('on');
    SOUND.init();
    run();
  }

  function showChoice(op, ip) {
    stopSkip();
    waiting = 'choice';
    el.cursor.classList.remove('on');
    el.choices.innerHTML = '';
    if (S.scene === 'c3_06') { G.branchSave = Object.assign({ time: Date.now() }, page); globalDirty = true; }
    const opts = op.opts.filter(o => !o.cond || evalCond(o.cond));
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      const key = S.scene + ':' + ip + ':' + o.to;
      if (G.chosen[key]) b.classList.add('seen');
      if (o.cond && /\bgold\b/.test(o.cond)) b.classList.add('gold');
      b.innerHTML = '<span class="num">' + (i + 1) + '.</span>';
      b.appendChild(document.createTextNode(o.text));
      b.addEventListener('click', e => { e.stopPropagation(); choose(o, key); });
      el.choices.appendChild(b);
    });
    // 選択肢が画面からはみ出す場合は本文を詰める
    const avail = el.layer.clientHeight * 0.85;
    while (el.text.scrollHeight + el.choices.scrollHeight > avail && el.text.children.length > 1) el.text.removeChild(el.text.firstChild);
  }
  function choose(o, key) {
    if (waiting !== 'choice') return;
    SOUND.init(); SOUND.se('select');
    G.chosen[key] = 1; globalDirty = true;
    log.push({ s: '▶ ' + o.text, style: 'choice' }, { hr: true });
    waiting = null;
    clearText();
    if (!jump(o.to)) return;
    markPage();
    run();
  }

  let titleTimer = null;
  function showTitleCard(text) {
    waiting = 'title';
    clearText();
    el.titlecard.textContent = text;
    el.titlecard.classList.add('on');
    log.push({ s: '■ ' + text, style: 'em' });
    clearTimeout(titleTimer);
    titleTimer = setTimeout(endTitleCard, skipping() ? 300 : 2200);
  }
  function endTitleCard() {
    if (waiting !== 'title') return;
    clearTimeout(titleTimer);
    el.titlecard.classList.remove('on');
    waiting = null;
    markPage();
    setTimeout(run, 300);
  }

  function showEnding(id) {
    stopSkip(); auto = false; updateHud();
    waiting = 'ending';
    const e = ENDINGS.find(x => x.id === id) || { id: id, title: '???', type: 'NORMAL' };
    const first = !G.endings[id];
    G.endings[id] = Date.now();
    let extra = '';
    if (id === 'E15' && !G.gold) {
      G.gold = 1;
      extra = '✦ 金のしおりを手に入れた ✦<br>分岐点に、新しい選択肢が現れる……';
    }
    const cnt = ENDINGS.filter(x => G.endings[x.id]).length;
    if (cnt === ENDINGS.length && first) extra += (extra ? '<br><br>' : '') + '全エンディング達成！<br>ここまで遊んでくれて、ありがとう。';
    saveGlobal();
    try { localStorage.removeItem(KEY + 'save_auto'); } catch (err) { /* noop */ }
    SOUND.bgm('ending');
    const idx = ENDINGS.indexOf(e);
    $('ending-no').textContent = 'ENDING No.' + String(idx + 1).padStart(2, '0') + (first ? '　NEW' : '');
    $('ending-title').textContent = '「' + e.title + '」';
    const ty = $('ending-type'); ty.textContent = e.type; ty.className = 'ty ' + e.type;
    $('ending-count').textContent = '見たエンディング　' + cnt + ' / ' + ENDINGS.length;
    $('ending-extra').innerHTML = extra;
    setTimeout(() => { el.ending.classList.add('on'); }, 600);
  }
  el.ending.addEventListener('click', () => { if (el.ending.classList.contains('on')) { el.ending.classList.remove('on'); toTitle(); } });

  // ---------- 開始・セーブ・ロード ----------
  function startFrom(st) {
    S = newState();
    Object.assign(S, JSON.parse(JSON.stringify(st)));
    S.vars = S.vars || {};
    log = [];
    el.title.classList.remove('on'); el.stage.classList.remove('intitle');
    closePanel();
    clearText();
    restoreVisuals(S);
    page = snapshot();
    waiting = null;
    setTimeout(run, 200);
  }
  function newGame() { SOUND.init(); startFrom(newState()); }
  const SLOTS = [1, 2, 3, 4, 5, 6];
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
  }
  function saveSlot(n) {
    if (!page) return;
    const first = el.text.firstChild ? el.text.firstChild.textContent : '';
    store('save_' + n, Object.assign({ time: Date.now(), preview: first }, page));
  }
  function fmtTime(t) { const d = new Date(t); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function sceneLabel(id) {
    const p = id.split('_')[0];
    return { pr: 'プロローグ', c1: '第一章', c2: '第二章', c3: '第三章', mt: 'モテ期編', yk: '殺人予告編', sg: '詐欺師編', yu: '雪女編', ms: 'ミステリー編', tr: '真相編' }[p] || id;
  }

  // ---------- タイトル ----------
  function toTitle() {
    waiting = null; stopSkip(); auto = false; updateHud();
    clearTimeout(autoTimer);
    closePanel();
    S = newState();
    el.ending.classList.remove('on');
    el.titlecard.classList.remove('on');
    clearText();
    setChara([]); setTint('normal'); setSnow(false);
    el.bg.style.backgroundImage = 'url(' + ART.drawBG('pension') + ')';
    el.stage.classList.add('intitle');
    el.title.classList.add('on');
    SOUND.bgm('title');
    buildTitleMenu();
  }
  function buildTitleMenu() {
    el.titleMenu.innerHTML = '';
    const add = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', () => { SOUND.init(); SOUND.se('select'); fn(); }); el.titleMenu.appendChild(b); };
    add('はじめから', newGame);
    const auto = load('save_auto', null);
    if (auto) add('つづきから', () => startFrom(auto));
    if (SLOTS.some(k => load('save_' + k, null))) add('ロード', () => openLoad());
    if (G.branchSave) add('分岐点から', () => startFrom(G.branchSave), G.gold ? 'gold' : '');
    add('エンディング一覧', openEndings);
    add('設定', openSettings);
    add('遊び方', openHelp);
    const cnt = ENDINGS.filter(x => G.endings[x.id]).length;
    el.titleInfo.innerHTML = 'エンディング ' + cnt + ' / ' + ENDINGS.length + (G.gold ? '　<span style="color:var(--accent)">✦ 金のしおり</span>' : '');
  }

  // ---------- パネル ----------
  let panelOpen = false;
  function openPanel(title, html) {
    el.panelTitle.textContent = title;
    el.panelBody.innerHTML = '';
    if (typeof html === 'string') el.panelBody.innerHTML = html; else el.panelBody.appendChild(html);
    el.panel.classList.add('on'); panelOpen = true;
    el.panelBody.scrollTop = 0;
  }
  function closePanel() { el.panel.classList.remove('on'); panelOpen = false; }
  el.panelClose.addEventListener('click', closePanel);
  el.panel.addEventListener('click', e => { if (e.target === el.panel) closePanel(); });

  function openEndings() {
    const box = document.createElement('div');
    ENDINGS.forEach((e, i) => {
      const seen = G.endings[e.id];
      const r = document.createElement('div');
      r.className = 'row' + (seen ? '' : ' locked');
      r.innerHTML = '<span class="no">' + String(i + 1).padStart(2, '0') + '</span><span class="tt"></span><span class="ty ' + e.type + '">' + e.type + '</span>';
      r.querySelector('.tt').textContent = seen ? e.title + '（' + e.route + '）' : '？？？？？　（' + e.route + '）';
      box.appendChild(r);
    });
    const cnt = ENDINGS.filter(x => G.endings[x.id]).length;
    const p = document.createElement('p');
    p.style.color = 'var(--ink-dim)';
    p.textContent = '見たエンディング ' + cnt + ' / ' + ENDINGS.length + (G.gold ? '　✦ 金のしおり所持' : '　（ミステリー編のあるエンディングで、金のしおりが手に入る）');
    box.appendChild(p);
    openPanel('エンディング一覧', box);
  }
  function slotList(mode) {
    const box = document.createElement('div');
    const keys = mode === 'save' ? SLOTS : ['auto'].concat(SLOTS);
    keys.forEach(k => {
      const d = load('save_' + k, null);
      const b = document.createElement('button');
      b.className = 'slot';
      const name = k === 'auto' ? 'オートセーブ' : 'しおり ' + k;
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = name + (d ? '　' + sceneLabel(d.scene) : '　（空き）');
      b.querySelector('small').textContent = d ? fmtTime(d.time) + (d.preview ? '　' + d.preview.slice(0, 30) : '') : '';
      if (mode === 'load' && !d) b.disabled = true;
      b.addEventListener('click', () => {
        if (mode === 'save') {
          if (d && !confirm('しおり ' + k + ' に上書きしますか？')) return;
          saveSlot(k); SOUND.se('chime'); closePanel(); toast('しおり ' + k + ' にセーブしました');
        }
        else startFrom(d);
      });
      box.appendChild(b);
    });
    return box;
  }
  function openLoad() { openPanel('ロード', slotList('load')); }
  function openSave() {
    const box = slotList('save');
    const p = document.createElement('p'); p.style.cssText = 'color:var(--ink-dim);font-size:13px;margin:4px 0 0';
    p.textContent = '※ いま読んでいるページの頭から再開します。読んだ場所は自動でも記録され、タイトルの「つづきから」で再開できます。';
    box.appendChild(p); openPanel('セーブ', box);
  }
  function openSettings() {
    const box = document.createElement('div');
    const mk = (label, key, min, max, step, fn) => {
      const r = document.createElement('div'); r.className = 'setting';
      r.innerHTML = '<label></label><input type="range">';
      r.querySelector('label').textContent = label;
      const inp = r.querySelector('input'); inp.min = min; inp.max = max; inp.step = step; inp.value = G.settings[key];
      inp.addEventListener('input', () => { G.settings[key] = parseFloat(inp.value); if (fn) fn(G.settings[key]); globalDirty = true; });
      box.appendChild(r);
    };
    mk('文字の速さ', 'speed', 0, 100, 1);
    mk('オートの速さ', 'auto', 0, 100, 1);
    mk('BGM音量', 'bgm', 0, 1, 0.05, v => SOUND.setVolume('bgm', v));
    mk('効果音音量', 'se', 0, 1, 0.05, v => { SOUND.setVolume('se', v); SOUND.se('click'); });
    const reset = document.createElement('button');
    reset.className = 'slot'; reset.style.marginTop = '20px';
    reset.textContent = '記録をすべて消す（エンディング・既読・しおり）';
    reset.addEventListener('click', () => {
      if (!confirm('本当に消しますか？（元に戻せません）')) return;
      try { Object.keys(localStorage).filter(k => k.startsWith(KEY)).forEach(k => localStorage.removeItem(k)); } catch (e) { /* noop */ }
      location.reload();
    });
    box.appendChild(reset);
    openPanel('設定', box);
  }
  function openHelp() {
    openPanel('遊び方', '<div class="help">' +
      '<p>雪山のペンションで開かれる、一泊二日の婚活ツアー。34歳・彼女いない歴＝年齢の「僕」の目を通して、今夜の出来事を読み進めるサウンドノベルです。</p>' +
      '<p>ときどき選択肢が出ます。選んだ行動によって物語が分かれ、エンディングは全部で18種類。1周はおよそ45分〜1時間です。</p>' +
      '<p>ミステリー編の、あるエンディングを見ると「金のしおり」が手に入り、物語の核心に触れる道が開きます。</p>' +
      '<p><b>操作</b><br>クリック／タップ・<kbd>Enter</kbd>・<kbd>Space</kbd>：読み進める<br>' +
      '<kbd>1</kbd>〜<kbd>6</kbd>：選択肢を選ぶ<br><kbd>Ctrl</kbd>（押している間）：既読スキップ<br>' +
      '<kbd>S</kbd>：セーブ　<kbd>A</kbd>：オート　<kbd>L</kbd> またはホイール上：ログ　<kbd>H</kbd>：文字を隠す　<kbd>Esc</kbd>：メニュー</p>' +
      '<p>スキップは一度読んだ文章だけを飛ばします。2周目以降は「分岐点から」を使うと、第三章の終わりから始められます。</p>' +
      '<p><b>セーブ</b><br>画面右上の「セーブ」で、しおり（6か所）に保存できます。読んだ場所は自動でも記録されるので、タイトルの「つづきから」でいつでも続きから再開できます。記録はこのブラウザに保存されます。</p></div>');
  }
  function openLog() {
    const box = document.createElement('div'); box.className = 'log';
    log.slice(-200).forEach(l => {
      if (l.hr) { box.appendChild(document.createElement('hr')); return; }
      const p = document.createElement('p'); if (l.style && l.style !== 'normal') p.className = l.style; p.textContent = l.s; box.appendChild(p);
    });
    openPanel('ログ', box);
    requestAnimationFrame(() => { el.panelBody.scrollTop = el.panelBody.scrollHeight; });
  }
  function openMenu() {
    const box = document.createElement('div'); box.className = 'menu-list';
    [['セーブ', openSave], ['ロード', openLoad], ['ログ', openLog], ['設定', openSettings], ['エンディング一覧', openEndings],
      ['タイトルへ戻る', () => { if (confirm('タイトルに戻りますか？（オートセーブから再開できます）')) toTitle(); }]]
      .forEach(([t, fn]) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', fn); box.appendChild(b); });
    openPanel('メニュー', box);
  }

  // ---------- HUD・入力 ----------
  function updateHud() {
    $('btn-skip').classList.toggle('active', skip || ctrlSkip);
    $('btn-auto').classList.toggle('active', auto);
  }
  function stopSkip() { skip = false; ctrlSkip = false; updateHud(); }
  function toggleSkip() {
    skip = !skip; if (skip) auto = false; updateHud();
    if (skip && waiting === 'text') advance();
  }
  function toggleAuto() {
    auto = !auto; if (auto) skip = false; updateHud();
    if (auto && waiting === 'text' && !typing) advance();
  }
  $('btn-skip').addEventListener('click', e => { e.stopPropagation(); toggleSkip(); });
  $('btn-auto').addEventListener('click', e => { e.stopPropagation(); toggleAuto(); });
  $('btn-save').addEventListener('click', e => { e.stopPropagation(); openSave(); });
  $('btn-load').addEventListener('click', e => { e.stopPropagation(); openLoad(); });
  $('btn-log').addEventListener('click', e => { e.stopPropagation(); openLog(); });
  $('btn-menu').addEventListener('click', e => { e.stopPropagation(); openMenu(); });

  let hidden = false;
  function toggleHide() { hidden = !hidden; el.layer.classList.toggle('hidden', hidden); }
  el.layer.addEventListener('click', () => {
    if (panelOpen) return;
    if (skip) { stopSkip(); return; }
    if (auto) { auto = false; updateHud(); }
    advance();
  });
  el.titlecard.addEventListener('click', () => endTitleCard());
  el.stage.addEventListener('click', () => { if (hidden) toggleHide(); }, true);
  el.stage.addEventListener('contextmenu', e => { e.preventDefault(); if (!el.title.classList.contains('on')) toggleHide(); });
  el.stage.addEventListener('wheel', e => { if (e.deltaY < 0 && !panelOpen && S && !el.title.classList.contains('on')) openLog(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Control') { if (!ctrlSkip && S && !el.title.classList.contains('on') && !panelOpen) { ctrlSkip = true; updateHud(); if (waiting === 'text') advance(); } return; }
    if (e.key === 'Escape') { if (panelOpen) closePanel(); else if (S && !el.title.classList.contains('on') && !el.ending.classList.contains('on')) openMenu(); return; }
    if (panelOpen) return;
    if (el.ending.classList.contains('on')) { if (e.key === 'Enter' || e.key === ' ') { el.ending.classList.remove('on'); toTitle(); } return; }
    if (el.title.classList.contains('on')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (hidden) toggleHide(); else advance(); }
    else if (/^[1-9]$/.test(e.key) && waiting === 'choice') { const b = el.choices.children[parseInt(e.key, 10) - 1]; if (b) b.click(); }
    else if (e.key === 'a' || e.key === 'A') toggleAuto();
    else if (e.key === 'l' || e.key === 'L') openLog();
    else if (e.key === 'h' || e.key === 'H') toggleHide();
    else if (e.key === 's' || e.key === 'S') openSave();
  });
  document.addEventListener('keyup', e => { if (e.key === 'Control') { ctrlSkip = false; updateHud(); } });
  window.addEventListener('blur', () => { ctrlSkip = false; updateHud(); });

  // 開発用：URLに #scene=xxx で任意のシーンから
  const m = location.hash.match(/scene=([a-z0-9_]+)/);
  if (m && SCENES[m[1]]) { const st = newState(); st.scene = m[1]; startFrom(st); }
  else toTitle();
  window.__dt = { SCENES: SCENES, errors: parsed.errors, state: () => S, G: G };
})();
