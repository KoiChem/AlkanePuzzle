(() => {
  const cache = new Map();
  function smiles(graph) {
    const seen = new Set(), children = new Map(), rings = new Map();
    let number = 0;
    const mark = (id, label) => rings.set(id, (rings.get(id) || '') + label);
    function visit(id, parent) {
      seen.add(id); children.set(id, []);
      for (const next of graph.adjacency.get(id)) {
        if (next === parent) continue;
        if (!seen.has(next)) { children.get(id).push(next); visit(next, id); }
        else if (!children.get(next)?.includes(id) && !edges.has([id,next].sort().join('|'))) {
          edges.add([id,next].sort().join('|'));
          const n = ++number, label = n < 10 ? String(n) : '%' + n;
          mark(id,label); mark(next,label);
        }
      }
    }
    const edges = new Set();
    visit(graph.nodeIds[0], null);
    function emit(id) {
      const element = graph.elements.get(id);
      if (!['C','OH','F','Cl','Br','I'].includes(element)) throw Error('Unsupported atom');
      return (element === 'OH' ? 'O' : element) + (rings.get(id) || '') + children.get(id).map(next => '(' + emit(next) + ')').join('');
    }
    return emit(graph.nodeIds[0]);
  }
  async function json(url) {
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    if (response.status === 404) return null;
    if (!response.ok) throw Error('通信に失敗しました');
    return response.json();
  }
  async function lookup(smiles) {
    if (cache.has(smiles)) return cache.get(smiles);
    const data = await json('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/IUPACName/JSON?smiles=' + encodeURIComponent(smiles));
    const record = data?.PropertyTable?.Properties?.[0];
    if (!record?.CID || !record.IUPACName) return null;
    let name = record.IUPACName, source = 'https://pubchem.ncbi.nlm.nih.gov/compound/' + record.CID;
    try {
      const query = `SELECT ?item ?name WHERE { ?item <http://www.wikidata.org/prop/direct/P662> "${Number(record.CID)}"; <http://www.w3.org/2000/01/rdf-schema#label> ?name. FILTER(LANG(?name) = "ja") } LIMIT 2`;
      const wiki = await json('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query));
      const rows = wiki?.results?.bindings;
      if (rows?.length === 1) { name = rows[0].name.value; source = rows[0].item.value.replace('http:', 'https:'); }
    } catch (_) { /* English remains available. */ }
    const result = {name, source}; cache.set(smiles, result); return result;
  }
  window.NameLookup = {smiles, lookup, attach(container, graph) {
    const key = graph.smiles || smiles(graph), area = document.createElement('div');
    area.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;margin:12px 0';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '名前を調べる';
    const output = document.createElement('div'); output.setAttribute('aria-live','polite');
    area.append(button,output); container.append(area);
    button.onclick = async () => {
      button.disabled = true; button.textContent = '検索中…'; output.textContent = '';
      try {
        const result = await lookup(key);
        if (!area.isConnected) return;
        if (result) {
          const name = document.createElement('div'); name.textContent = result.name;
          const link = document.createElement('a'); link.href = result.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '出典';
          output.append(name,link); button.hidden = true;
        } else output.textContent = '名前が見つかりませんでした';
      } catch (_) { if (area.isConnected) output.textContent = '通信に失敗しました。もう一度お試しください'; }
      finally { button.disabled = false; button.textContent = '名前を調べる'; }
    };
  }};
})();
