// シナリオ検証ツール:  node tools/validate.js [--only 接頭辞]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DSL = require(path.join(ROOT, 'js/parser.js'));
const { ENDINGS, IDS, START } = require(path.join(ROOT, 'js/data.js'));

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > 0 ? process.argv[onlyIdx + 1] : null;

const dir = path.join(ROOT, 'scenario');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
const sources = [];
for (const f of files) {
  const collected = [];
  const ctx = { SCN: { add: t => collected.push(t) } };
  try {
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  } catch (e) {
    console.log('✖ ' + f + ' の読み込みに失敗: ' + e.message);
    process.exitCode = 1;
    continue;
  }
  collected.forEach(t => sources.push({ name: f, text: t }));
}

const { scenes, order, errors } = DSL.parse(sources);
const warns = [];
const endingIds = ENDINGS.map(e => e.id);
const mine = id => !only || id.startsWith(only);

function checkExpr(expr, where, kind) {
  try {
    if (kind === 'set') expr.split(',').forEach(p => new Function('v', 'with(v){' + p + '}'));
    else new Function('v', 'with(v){return (' + expr + ')}');
  } catch (e) { errors.push(where + ' 式エラー: ' + expr); }
}

for (const id of order) {
  if (!mine(id)) continue;
  const sc = scenes[id];
  const ops = sc.ops;
  const last = ops[ops.length - 1];
  if (!last || !['goto', 'choice', 'ending'].includes(last.t)) {
    errors.push(sc.where + ' シーン ' + id + ' が @goto/@choice/@ending で終わっていません');
  }
  for (const op of ops) {
    const w = op.where;
    const target = to => { if (!scenes[to]) errors.push(w + ' 飛び先がありません: ' + to); };
    switch (op.t) {
      case 'goto': target(op.arg); break;
      case 'if': target(op.to); checkExpr(op.cond, w, 'cond'); break;
      case 'choice':
        op.opts.forEach(o => { target(o.to); if (o.cond) checkExpr(o.cond, w, 'cond'); });
        break;
      case 'set': checkExpr(op.arg, w, 'set'); break;
      case 'ending': if (!endingIds.includes(op.arg)) errors.push(w + ' 未定義のエンディング: ' + op.arg); break;
      case 'bg': case 'bgm': case 'se': case 'fx':
        if (!IDS[op.t].includes(op.arg)) errors.push(w + ' 未定義の @' + op.t + ': ' + op.arg);
        break;
      case 'chara':
        op.args.forEach(a => { if (!IDS.chara.includes(a)) errors.push(w + ' 未定義の @chara: ' + a); });
        if (op.args.length > 4) warns.push(w + ' @chara は4人まで');
        break;
      case 'text':
        if (op.s.length > 70) warns.push(w + ' 1行が長すぎます(' + op.s.length + '字)');
        break;
    }
  }
  // 1ページの行数チェック
  let n = 0;
  for (const op of ops) {
    if (op.t === 'text') { n++; if (n === 7) warns.push(op.where + ' 1ページが7行以上あります'); }
    else if (op.t === 'page' || op.t === 'title' || op.t === 'choice') n = 0;
  }
}

// 到達可能性
const reach = new Set();
const endingsReached = new Set();
if (scenes[START]) {
  const stack = [START];
  while (stack.length) {
    const id = stack.pop();
    if (reach.has(id) || !scenes[id]) continue;
    reach.add(id);
    for (const op of scenes[id].ops) {
      if (op.t === 'goto') stack.push(op.arg);
      if (op.t === 'if') stack.push(op.to);
      if (op.t === 'choice') op.opts.forEach(o => stack.push(o.to));
      if (op.t === 'ending') endingsReached.add(op.arg);
    }
  }
  for (const id of order) if (mine(id) && !reach.has(id)) warns.push(scenes[id].where + ' 到達できないシーン: ' + id);
}

// 文字数
const stats = {};
for (const id of order) {
  const p = id.split('_')[0];
  stats[p] = stats[p] || { scenes: 0, chars: 0 };
  stats[p].scenes++;
  for (const op of scenes[id].ops) {
    if (op.t === 'text') stats[p].chars += op.s.length;
    if (op.t === 'choice') op.opts.forEach(o => { stats[p].chars += o.text.length; });
  }
}

console.log('— 文字数（読了目安 500字/分）—');
for (const [p, s] of Object.entries(stats)) {
  console.log(`  ${p.padEnd(4)} ${String(s.scenes).padStart(4)}シーン ${String(s.chars).padStart(7)}字  約${Math.round(s.chars / 500)}分`);
}
if (scenes[START]) {
  const miss = endingIds.filter(e => !endingsReached.has(e));
  console.log('— エンディング到達: ' + endingsReached.size + '/' + endingIds.length + (miss.length ? '（未到達: ' + miss.join(' ') + '）' : ''));
}
if (warns.length) { console.log('— 警告 ' + warns.length + '件'); warns.forEach(w => console.log('  △ ' + w)); }
if (errors.length) { console.log('— エラー ' + errors.length + '件'); errors.forEach(e => console.log('  ✖ ' + e)); process.exitCode = 1; }
else console.log('✔ エラーなし');
