// ランダムに選択肢を選んで何千回も通しプレイし、各エンディングまでの文字数を調べる
//   node tools/simulate.js [回数]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const DSL = require(path.join(ROOT, 'js/parser.js'));
const { ENDINGS, START } = require(path.join(ROOT, 'js/data.js'));

const sources = [];
for (const f of fs.readdirSync(path.join(ROOT, 'scenario')).filter(f => f.endsWith('.js')).sort()) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'scenario', f), 'utf8'), { SCN: { add: t => sources.push({ name: f, text: t }) } });
}
const { scenes } = DSL.parse(sources);
const RUNS = parseInt(process.argv[2] || '5000', 10);

function scope(vars, gold) {
  const extra = { gold: gold };
  return new Proxy(vars, {
    has: () => true,
    get: (t, k) => k === Symbol.unscopables ? undefined : (k in t ? t[k] : (k in extra ? extra[k] : 0)),
    set: (t, k, v) => { t[k] = v; return true; }
  });
}
const cond = (e, v, g) => !!new Function('v', 'with(v){return (' + e + ')}')(scope(v, g));
const set = (e, v, g) => e.split(',').forEach(p => new Function('v', 'with(v){' + p + '}')(scope(v, g)));

const stats = {};
const problems = new Set();
for (let r = 0; r < RUNS; r++) {
  const gold = r % 2;
  const vars = {};
  let sc = START, ip = 0, chars = 0, choices = 0, steps = 0, branch = null;
  while (true) {
    if (++steps > 100000) { problems.add('無限ループの疑い: ' + sc); break; }
    const s = scenes[sc];
    if (!s) { problems.add('存在しないシーン: ' + sc); break; }
    if (ip >= s.ops.length) { problems.add('シーンの終端: ' + sc); break; }
    const op = s.ops[ip++];
    if (op.t === 'text') chars += op.s.length;
    else if (op.t === 'set') set(op.arg, vars, gold);
    else if (op.t === 'if') { if (cond(op.cond, vars, gold)) { sc = op.to; ip = 0; } }
    else if (op.t === 'goto') { sc = op.arg; ip = 0; }
    else if (op.t === 'choice') {
      const opts = op.opts.filter(o => !o.cond || cond(o.cond, vars, gold));
      if (!opts.length) { problems.add('選べる選択肢がない: ' + sc); break; }
      const o = opts[Math.floor(Math.random() * opts.length)];
      if (sc === 'c3_06') branch = o.to.split('_')[0];
      choices++; sc = o.to; ip = 0;
    } else if (op.t === 'ending') {
      const k = op.arg;
      const st = stats[k] = stats[k] || { n: 0, min: 1e9, max: 0, sum: 0, ch: 0, via: new Set() };
      st.n++; st.min = Math.min(st.min, chars); st.max = Math.max(st.max, chars); st.sum += chars; st.ch += choices;
      if (branch) st.via.add(branch);
      break;
    }
  }
}
console.log('ID   回数   文字数(最小/平均/最大)   ≒分(平均/500字)  選択回数  経由');
for (const e of ENDINGS) {
  const s = stats[e.id];
  if (!s) { console.log(e.id + '  未到達'); continue; }
  const avg = Math.round(s.sum / s.n);
  console.log(`${e.id}  ${String(s.n).padStart(5)}  ${String(s.min).padStart(6)}/${String(avg).padStart(6)}/${String(s.max).padStart(6)}   ${String(Math.round(avg / 500)).padStart(3)}分   ${(s.ch / s.n).toFixed(1).padStart(5)}   ${[...s.via].join(',')}  ${e.title}`);
}
if (problems.size) { console.log('— 問題'); problems.forEach(p => console.log('  ✖ ' + p)); process.exitCode = 1; }
else console.log('✔ 行き止まりなし');
