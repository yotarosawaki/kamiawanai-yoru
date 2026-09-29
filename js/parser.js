// シナリオDSLのパーサ（ブラウザとNodeの両方で動く）
(function (root) {
  'use strict';

  function parseChoiceLine(line) {
    // - 文字 -> id ? 条件
    const m = line.match(/^-\s*(.+?)\s*->\s*([a-z0-9_]+)\s*(?:\?\s*(.+))?$/);
    if (!m) return null;
    return { text: m[1], to: m[2], cond: m[3] ? m[3].trim() : null };
  }

  function parse(sources) {
    const scenes = {};
    const order = [];
    const errors = [];
    let cur = null;

    sources.forEach(function (src, fileIdx) {
      const lines = src.text.split(/\r?\n/);
      cur = null;
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        const where = src.name + ':' + (i + 1);

        if (line.startsWith('#')) continue;

        if (line.startsWith('*')) {
          const id = line.slice(1).trim();
          if (!/^[a-z0-9_]+$/.test(id)) errors.push(where + ' 不正なシーンID: ' + id);
          if (scenes[id]) errors.push(where + ' シーンIDが重複: ' + id);
          cur = { id: id, ops: [], where: where };
          scenes[id] = cur;
          order.push(id);
          continue;
        }

        if (!cur) {
          if (line) errors.push(where + ' シーンの外に行があります: ' + line);
          continue;
        }

        if (line === '') {
          const last = cur.ops[cur.ops.length - 1];
          if (last && last.t !== 'page') cur.ops.push({ t: 'page', where: where });
          continue;
        }

        if (line.startsWith('@')) {
          const sp = line.indexOf(' ');
          const cmd = (sp < 0 ? line.slice(1) : line.slice(1, sp)).trim();
          const arg = sp < 0 ? '' : line.slice(sp + 1).trim();

          if (cmd === 'choice') {
            const opts = [];
            while (i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
              i++;
              const o = parseChoiceLine(lines[i].trim());
              if (!o) errors.push(src.name + ':' + (i + 1) + ' 選択肢の書式エラー: ' + lines[i].trim());
              else opts.push(o);
            }
            if (!opts.length) errors.push(where + ' @choice に選択肢がありません');
            cur.ops.push({ t: 'choice', opts: opts, where: where });
            continue;
          }
          if (cmd === 'if') {
            const m = arg.match(/^(.+?)\s*->\s*([a-z0-9_]+)$/);
            if (!m) { errors.push(where + ' @if の書式エラー: ' + arg); continue; }
            cur.ops.push({ t: 'if', cond: m[1], to: m[2], where: where });
            continue;
          }
          const known = ['bg', 'bgm', 'se', 'chara', 'fx', 'title', 'set', 'goto', 'ending', 'wait'];
          if (known.indexOf(cmd) < 0) { errors.push(where + ' 不明なコマンド: @' + cmd); continue; }
          cur.ops.push({ t: cmd, arg: arg, args: arg ? arg.split(/\s+/) : [], where: where });
          continue;
        }

        let style = 'normal';
        let s = line;
        if (s.startsWith('>')) { style = 'em'; s = s.slice(1).trim(); }
        else if (s.startsWith('~')) { style = 'dream'; s = s.slice(1).trim(); }
        cur.ops.push({ t: 'text', s: s, style: style, where: where });
      }
    });

    // 末尾の page を掃除
    order.forEach(function (id) {
      const ops = scenes[id].ops;
      while (ops.length && ops[ops.length - 1].t === 'page') ops.pop();
    });

    return { scenes: scenes, order: order, errors: errors };
  }

  const api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DSL = api;
})(this);
