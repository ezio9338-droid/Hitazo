// Busca en YouTube el vídeo de cada canción y comprueba que se puede incrustar.
// Uso: abrir youtube.com, pegar en la consola con QUERIES = [[artista, título], ...] y ejecutar.
(async () => {
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const BAD = /(live|en vivo|en directo|karaoke|cover|instrumental|remix|8d|slowed|sped up|reaction|tutorial|1 hour|1 hora|letra en|traduc)/i;
  async function search(q) {
    const html = await (await fetch('/results?search_query=' + encodeURIComponent(q) + '&hl=es')).text();
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) return [];
    const out = [];
    (function walk(o) {
      if (!o || typeof o !== 'object' || out.length >= 8) return;
      if (o.videoRenderer && o.videoRenderer.videoId) {
        const v = o.videoRenderer;
        out.push({
          id: v.videoId,
          title: v.title?.runs?.map(r => r.text).join('') || '',
          ch: v.ownerText?.runs?.[0]?.text || '',
          len: v.lengthText?.simpleText || '',
        });
        return;
      }
      for (const k in o) walk(o[k]);
    })(JSON.parse(m[1]));
    return out;
  }
  const secs = l => l.split(':').reduce((a, b) => a * 60 + +b, 0);
  async function embeddable(id) {
    const r = await fetch('/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    return r.ok;
  }
  async function resolve([artist, title]) {
    const cands = await search(`${artist} ${title}`);
    const nt = norm(title).split(' ').filter(w => w.length > 2).slice(0, 3);
    const na = norm(artist).split(' ')[0];
    const scored = cands.map((c, i) => {
      const t = norm(c.title), ch = norm(c.ch);
      let s = 10 - i;
      if (nt.every(w => t.includes(w))) s += 10;
      if (ch.includes(na) || /vevo|topic/.test(ch)) s += 8;
      if (/official|oficial|videoclip/.test(t)) s += 3;
      if (BAD.test(c.title)) s -= 15;
      const L = secs(c.len || '0');
      if (!L || L > 600) s -= 20;
      return { ...c, s };
    }).sort((a, b) => b.s - a.s);
    for (const c of scored.slice(0, 4)) {
      if (await embeddable(c.id)) return c;
    }
    return null;
  }
  const results = new Array(QUERIES.length);
  let next = 0;
  async function worker() {
    while (next < QUERIES.length) {
      const i = next++;
      try { results[i] = await resolve(QUERIES[i]); } catch (e) { results[i] = { err: String(e) }; }
    }
  }
  await Promise.all([1, 2, 3, 4].map(worker));
  window.__RES = results;
  return results.map((r, i) => r ? [i, r.id, r.title, r.ch, r.len, r.s] : [i, null]);
})();
