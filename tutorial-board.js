/* Naming, directions and svgIcon copied without rule changes from index.html,
 * KoiChem/AlkanePuzzle 1a31118d2a1235610dee3d9d6692fadf72e5cbc9.
 * Standalone prototype: keep this boundary when integrating with the main editor. */
(function(root){
'use strict';
  const ROWS = 5, COLS = 7;
  // 生成中に配列をシャッフルしても方角の基準順を壊さないよう固定する。
  const DIR_ORDER = Object.freeze(['N', 'E', 'S', 'W']);
  const DIRECTION_BIT = Object.freeze({ N: 1, E: 2, S: 4, W: 8 });
  const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
  const DELTA = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] }; // [drow, dcol]
  const VEC = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };   // SVG上の[dx, dy]

  const PANEL_ARM_TABLE = { 1: ['E'], 2: ['N', 'S'], 3: ['N', 'E'], 4: ['N', 'W', 'E'], 5: ['N', 'E', 'S', 'W'] };
  const PANEL_LABELS = { 1: '末端', 2: '直線', 3: 'かど', 4: '分岐', 5: '四級' };
  // 練習モードでは主鎖を炭素35(ペンタトリアコンタン)まで組めるようにするため、35まで用意する。
  // 21以降は「1の位+10の位語幹」の組み合わせ方式に変わるため、個別の綴りを列挙している。
  const CHAIN_NAMES = [
    '', 'メタン', 'エタン', 'プロパン', 'ブタン', 'ペンタン', 'ヘキサン', 'ヘプタン', 'オクタン', 'ノナン', 'デカン',
    'ウンデカン', 'ドデカン', 'トリデカン', 'テトラデカン', 'ペンタデカン', 'ヘキサデカン', 'ヘプタデカン', 'オクタデカン', 'ノナデカン', 'イコサン',
    'ヘンイコサン', 'ドコサン', 'トリコサン', 'テトラコサン', 'ペンタコサン', 'ヘキサコサン', 'ヘプタコサン', 'オクタコサン', 'ノナコサン', 'トリアコンタン',
    'ヘントリアコンタン', 'ドトリアコンタン', 'トリトリアコンタン', 'テトラトリアコンタン', 'ペンタトリアコンタン',
  ];
  // 練習では、直鎖のアルキル基をペンタデシル基まで命名できる。
  // 分岐C3・C4側鎖は、学習でなじみのある慣用名で扱う。
  const STRAIGHT_ALKYL_NAMES = [
    '', 'メチル', 'エチル', 'プロピル', 'ブチル', 'ペンチル', 'ヘキシル', 'ヘプチル', 'オクチル', 'ノニル', 'デシル',
    'ウンデシル', 'ドデシル', 'トリデシル', 'テトラデシル', 'ペンタデシル',
  ];
  const SUBSTITUENT_NAME_BY_LENGTH = Object.fromEntries(
    STRAIGHT_ALKYL_NAMES.slice(1).map((name, index) => [index + 1, name])
  );
  // アルファベット順。慣用名では iso は数え、sec / tert は母体の butyl として扱う。
  // これは学習アプリで採る一般命名の約束であり、日本語の五十音順ではない。
  const SUBSTITUENT_ORDER = {
    'ブロモ': 0, 'ブチル': 1, 'sec-ブチル': 1.1, 'tert-ブチル': 1.2,
    'クロロ': 2, 'デシル': 3, 'ドデシル': 4, 'エチル': 5, 'フルオロ': 6,
    'ヘプチル': 7, 'ヘキシル': 8, 'ヨード': 9, 'イソブチル': 10, 'イソプロピル': 11,
    'メチル': 12, 'ノニル': 13, 'オクチル': 14, 'ペンタデシル': 15, 'ペンチル': 16,
    'プロピル': 17, 'テトラデシル': 18, 'トリデシル': 19, 'ウンデシル': 20,
  };
  function substituentOrder(name) { return SUBSTITUENT_ORDER[name] ?? Number.MAX_SAFE_INTEGER; }
  // index = 同じ置換基の個数。同一置換基を20個まで置いても倍数接頭語が付けられるようにする。
  const MULTIPLIER_PREFIX = [
    '', '', 'ジ', 'トリ', 'テトラ', 'ペンタ', 'ヘキサ', 'ヘプタ', 'オクタ', 'ノナ', 'デカ',
    'ウンデカ', 'ドデカ', 'トリデカ', 'テトラデカ', 'ペンタデカ', 'ヘキサデカ', 'ヘプタデカ', 'オクタデカ', 'ノナデカ', 'イコサ',
  ];
  // ハロゲン(F/Cl/Br/I): 一価の原子なので必ず1マス・末端(type1相当)になる
  const HALOGEN_INFO = {
    F: { name: 'フルオロ', stroke: '#B08D1A', fill: '#F7F2A0' },
    Cl: { name: 'クロロ', stroke: '#7CB518', fill: '#E8F5D0' },
    Br: { name: 'ブロモ', stroke: '#A0522D', fill: '#F3E0D6' },
    I: { name: 'ヨード', stroke: '#7B4397', fill: '#EBDFF5' },
  };
  const HYDROXYL_ELEMENT = 'OH';
  const HYDROXYL_FILL = '#E8564F';
  const HALOGEN_ELEMENT_BY_NAME = { 'フルオロ': 'F', 'クロロ': 'Cl', 'ブロモ': 'Br', 'ヨード': 'I' };
  // 出題(生成)で使う置換基の種類プールは、従来どおりエチルまでに固定する。
  // 練習の命名範囲とは意図的に別で、プロピル以上や分岐アルキル基は自動出題しない。
  const SUBSTITUENT_SPECIES = ['メチル', 'エチル', 'フルオロ', 'クロロ', 'ブロモ', 'ヨード'];
  const SUBSTITUENT_LENGTH = { 'メチル': 1, 'エチル': 2, 'フルオロ': 1, 'クロロ': 1, 'ブロモ': 1, 'ヨード': 1, [HYDROXYL_ELEMENT]: 1 };
  // 環は原子1個分の余白しか確保していないため、エチル(2マス必要)は対象外にする
  const RING_SUBSTITUENT_SPECIES = ['メチル', 'フルオロ', 'クロロ', 'ブロモ', 'ヨード'];

  function rotateCW(dir, times) {
    const steps = ((times % 4) + 4) % 4;
    const bit = DIRECTION_BIT[dir];
    const rotated = ((bit << steps) | (bit >> (4 - steps))) & 15;
    return DIR_ORDER.find((candidate) => DIRECTION_BIT[candidate] === rotated);
  }
  function getActiveDirections(panel) {
    const base = PANEL_ARM_TABLE[panel.type];
    const steps = (panel.rotation / 90) % 4;
    return new Set(base.map((d) => rotateCW(d, steps)));
  }
  function isHalogenPanel(panel) {
    return !!panel && !!panel.element && panel.element !== 'C';
  }
  // 炭素側から「このマスへ向かって」手を伸ばしている隣接方向の一覧を返す。
  // (隣が炭素で、その炭素の手がこちら側=OPPOSITE[dir]を向いているとき、その方向を含める)
  function incomingCarbonDirections(grid, r, c) {
    const dirs = [];
    for (const dir of DIR_ORDER) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const neighbor = grid[nr][nc];
      if (!neighbor || isHalogenPanel(neighbor)) continue; // 炭素からの手だけを数える
      if (getActiveDirections(neighbor).has(OPPOSITE[dir])) dirs.push(dir);
    }
    return dirs;
  }
  // そのマスのパネルが実際に結合を形成している方向の集合を返す(グリッド全体の文脈が必要)。
  // ・炭素: 自身の手の向き(getActiveDirections)がそのまま結合方向。
  // ・ハロゲン: 向きを持たない一価原子。上下左右のうち「炭素の手がちょうど1方向だけ」来ているとき、
  //   その1方向へ自動で結合する。0方向、または2方向以上のときは結合しない(手を出さない)。
  function getBondDirections(grid, r, c) {
    const panel = grid[r][c];
    if (!panel) return new Set();
    if (isHalogenPanel(panel)) {
      const incoming = incomingCarbonDirections(grid, r, c);
      return incoming.length === 1 ? new Set(incoming) : new Set();
    }
    return getActiveDirections(panel);
  }
  function toBaseDir(actualDir, rotationDeg) {
    const steps = (rotationDeg / 90) % 4;
    return rotateCW(actualDir, (4 - steps) % 4);
  }

  // ============================================================
  // 命名エンジン(naming-engine.jsで検証済みのロジックと同一)
  // ============================================================
  function checkMismatches(grid) {
    const mismatches = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const panel = grid[r][c];
        if (!panel) continue;
        const bonds = getBondDirections(grid, r, c);
        for (const dir of bonds) {
          const [dr, dc] = DELTA[dir];
          const nr = r + dr, nc = c + dc;
          const inBounds = nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS;
          const neighbor = inBounds ? grid[nr][nc] : null;
          if (!neighbor) {
            mismatches.push({ r, c, dir, reason: 'DANGLING_BOND' });
            continue;
          }
          // 相手側も同じ結合を張り返しているか(ハロゲンの自動結合もこの1本の判定に含まれる)
          const neighborBonds = getBondDirections(grid, nr, nc);
          if (!neighborBonds.has(OPPOSITE[dir])) {
            mismatches.push({ r, c, dir, reason: 'ONE_SIDED_BOND' });
          }
        }
      }
    }
    return mismatches;
  }

  // SVGへ適用する数値の回転角から、実際に画面へ向く結合方向を独立に復元する。
  // getActiveDirections() と同じ方角表を経由しないため、方角表の誤変更で
  // 論理上だけ正しく見える状態を、出題前に検出できる。
  function physicalCarbonDirections(panel) {
    const baseMask = PANEL_ARM_TABLE[panel.type]
      .reduce((mask, dir) => mask | DIRECTION_BIT[dir], 0);
    const steps = (((panel.rotation / 90) % 4) + 4) % 4;
    const rotatedMask = ((baseMask << steps) | (baseMask >> (4 - steps))) & 15;
    return new Set(DIR_ORDER.filter((dir) => (rotatedMask & DIRECTION_BIT[dir]) !== 0));
  }

  function physicalBondDirections(grid, r, c) {
    const panel = grid[r][c];
    if (!panel) return new Set();
    if (!isHalogenPanel(panel)) return physicalCarbonDirections(panel);
    const incoming = [];
    for (const dir of DIR_ORDER) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr, nc = c + dc;
      const neighbor = nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS ? grid[nr][nc] : null;
      if (neighbor && !isHalogenPanel(neighbor) && physicalCarbonDirections(neighbor).has(OPPOSITE[dir])) incoming.push(dir);
    }
    return incoming.length === 1 ? new Set(incoming) : new Set();
  }

  // 隣接しているが結合していないパネルは許容する。ここで検査するのは、
  // 実際に結合線を出しているパネルの向きが相手の結合線と一致することだけ。
  function checkPhysicalPanelDirections(grid) {
    const mismatches = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        for (const dir of physicalBondDirections(grid, r, c)) {
          const [dr, dc] = DELTA[dir];
          const nr = r + dr, nc = c + dc;
          const neighbor = nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS ? grid[nr][nc] : null;
          if (!neighbor || !physicalBondDirections(grid, nr, nc).has(OPPOSITE[dir])) {
            mismatches.push({ r, c, dir });
          }
        }
      }
    }
    return mismatches;
  }

  function buildGraph(grid) {
    const adjacency = new Map();
    const nodeIds = [];
    const elements = new Map();
    const idOf = (r, c) => `${r},${c}`;

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) {
          nodeIds.push(idOf(r, c));
          adjacency.set(idOf(r, c), new Set());
          elements.set(idOf(r, c), grid[r][c].element || 'C');
        }
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const panel = grid[r][c];
        if (!panel) continue;
        for (const dir of getBondDirections(grid, r, c)) {
          const [dr, dc] = DELTA[dir];
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || !grid[nr][nc]) continue;
          adjacency.get(idOf(r, c)).add(idOf(nr, nc));
          adjacency.get(idOf(nr, nc)).add(idOf(r, c));
        }
      }
    }
    return { nodeIds, adjacency, elements };
  }

  function checkConnectivity(graph) {
    const { nodeIds, adjacency } = graph;
    if (nodeIds.length === 0) return { allConnected: true, islands: [] };
    const visited = new Set([nodeIds[0]]);
    const queue = [nodeIds[0]];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency.get(cur)) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }
    return { allConnected: visited.size === nodeIds.length, islands: nodeIds.filter((id) => !visited.has(id)) };
  }

  function countEdges(graph) {
    let sum = 0;
    for (const n of graph.adjacency.values()) sum += n.size;
    return sum / 2;
  }
  function classifyStructure(graph) {
    const V = graph.nodeIds.length, E = countEdges(graph);
    const cyclomatic = E - V + 1;
    if (cyclomatic === 0) return 'ALKANE';
    if (cyclomatic === 1) return 'CYCLOALKANE';
    return 'UNSUPPORTED_MULTI_RING';
  }

  function bfsDistancesAndParents(adjacency, start) {
    const dist = new Map([[start, 0]]);
    const parent = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adjacency.get(cur)) {
        if (!dist.has(next)) { dist.set(next, dist.get(cur) + 1); parent.set(next, cur); queue.push(next); }
      }
    }
    return { dist, parent };
  }
  function reconstructPath(parent, from, to) {
    const path = [to];
    let cur = to;
    while (cur !== from) { cur = parent.get(cur); path.push(cur); }
    return path.reverse();
  }

  // 親鎖との結合を外した炭素側鎖を集める。分岐C3・C4は rooted tree の形から
  // 慣用名へ対応付け、直鎖はC15まで扱う。それより複雑な側鎖は従来どおり対象外にする。
  function nameCarbonSubstituent(graph, backboneSet, backboneNode, root) {
    const nodes = new Set();
    const queue = [{ id: root, parent: backboneNode }];
    while (queue.length) {
      const { id: cur, parent } = queue.shift();
      if (nodes.has(cur)) throw new Error('UNSUPPORTED_SUBSTITUENT');
      if (graph.elements.get(cur) !== 'C') throw new Error('UNSUPPORTED_SUBSTITUENT');
      nodes.add(cur);
      for (const next of graph.adjacency.get(cur)) {
        if (next === parent) continue;
        if (backboneSet.has(next)) throw new Error('UNSUPPORTED_SUBSTITUENT');
        if (nodes.has(next)) throw new Error('UNSUPPORTED_SUBSTITUENT');
        queue.push({ id: next, parent: cur });
      }
    }
    const carbonNeighbors = (id) => [...graph.adjacency.get(id)].filter((next) => nodes.has(next));
    const length = nodes.size;
    const rootDegree = carbonNeighbors(root).length;
    const isStraight = [...nodes].every((id) => carbonNeighbors(id).length <= 2);

    if (isStraight && rootDegree <= 1) {
      const name = SUBSTITUENT_NAME_BY_LENGTH[length];
      if (!name) throw new Error('UNSUPPORTED_SUBSTITUENT');
      return { backboneNode, length, name };
    }
    if (isStraight && length === 3 && rootDegree === 2) {
      return { backboneNode, length, name: 'イソプロピル' };
    }
    if (isStraight && length === 4 && rootDegree === 2) {
      return { backboneNode, length, name: 'sec-ブチル' };
    }
    if (length === 4 && rootDegree === 1) {
      const junction = carbonNeighbors(root)[0];
      if (junction && carbonNeighbors(junction).length === 3) {
        return { backboneNode, length, name: 'イソブチル' };
      }
    }
    if (length === 4 && rootDegree === 3 && [...nodes].every((id) => id === root || carbonNeighbors(id).length === 1)) {
      return { backboneNode, length, name: 'tert-ブチル' };
    }
    throw new Error('UNSUPPORTED_SUBSTITUENT');
  }

  function extractSubstituents(graph, backboneSet) {
    const substituents = [];
    for (const node of backboneSet) {
      for (const neighbor of graph.adjacency.get(node)) {
        if (backboneSet.has(neighbor)) continue;

        const neighborElement = graph.elements.get(neighbor);
        if (neighborElement !== 'C') {
          if (neighborElement === HYDROXYL_ELEMENT) continue; // OHは主官能基として別途集計する
          // ハロゲンは一価なので、この1マスで置換基が確定する(さらに先に何か繋がっていたら不正な構造)
          const further = [...graph.adjacency.get(neighbor)].filter((n) => n !== node);
          if (further.length > 0) throw new Error('UNSUPPORTED_SUBSTITUENT');
          substituents.push({ backboneNode: node, length: 1, name: HALOGEN_INFO[neighborElement].name });
          continue;
        }

        substituents.push(nameCarbonSubstituent(graph, backboneSet, node, neighbor));
      }
    }
    return substituents;
  }

  function hydroxylLocants(graph, orderedBackbone) {
    const backboneSet = new Set(orderedBackbone);
    const locants = [];
    for (const node of orderedBackbone) {
      for (const neighbor of graph.adjacency.get(node)) {
        if (graph.elements.get(neighbor) === HYDROXYL_ELEMENT) {
          if (graph.adjacency.get(neighbor).size !== 1) throw new Error('INVALID_HYDROXYL');
          locants.push(orderedBackbone.indexOf(node) + 1);
        }
      }
    }
    // 親構造外のOHを「ヒドロキシ置換基」としては扱わない。ベータでは主鎖・主環に
    // すべてのOHが載る構造だけを命名対象とし、生成器もその条件を満たすものを選ぶ。
    const allHydroxyls = graph.nodeIds.filter((id) => graph.elements.get(id) === HYDROXYL_ELEMENT);
    if (locants.length !== allHydroxyls.length || new Set(locants).size !== locants.length) {
      throw new Error('UNSUPPORTED_HYDROXYL_LAYOUT');
    }
    return locants.sort((a, b) => a - b);
  }

  function validateHydroxyls(graph) {
    for (const id of graph.nodeIds) {
      if (graph.elements.get(id) !== HYDROXYL_ELEMENT) continue;
      const neighbors = [...graph.adjacency.get(id)];
      if (neighbors.length !== 1 || graph.elements.get(neighbors[0]) !== 'C') throw new Error('INVALID_HYDROXYL');
    }
    for (const id of graph.nodeIds) {
      if (graph.elements.get(id) !== 'C') continue;
      const hydroxylCount = [...graph.adjacency.get(id)].filter((n) => graph.elements.get(n) === HYDROXYL_ELEMENT).length;
      if (hydroxylCount > 1) throw new Error('GEMINAL_DIOL');
    }
  }

  // IUPACでは、同種の原子だけからなる2炭素鎖の単置換体は位置番号「1」を省略する。
  // 例: フルオロエタン、クロロエタン（ただし 1,1-ジクロロエタン等では省略しない）。
  function buildSubstituentPrefix(locantedSubstituents, omitSoleEthaneLocant = false) {
    if (locantedSubstituents.length === 0) return '';
    if (omitSoleEthaneLocant && locantedSubstituents.length === 1 && locantedSubstituents[0].locant === 1) {
      return locantedSubstituents[0].name;
    }
    const groups = new Map();
    for (const s of locantedSubstituents) {
      if (!groups.has(s.name)) groups.set(s.name, []);
      groups.get(s.name).push(s.locant);
    }
    const sortedNames = [...groups.keys()].sort((a, b) => substituentOrder(a) - substituentOrder(b));
    return sortedNames.map((name) => {
      const locants = groups.get(name).sort((a, b) => a - b);
      return `${locants.join(',')}-${MULTIPLIER_PREFIX[locants.length] || ''}${name}`;
    }).join('-');
  }

  // メタンを親構造にする場合、炭素は1個だけなので置換基の位置番号「1」は書かない。
  function buildMethaneSubstituentPrefix(substituents) {
    if (substituents.length === 0) return '';
    const counts = new Map();
    for (const s of substituents) counts.set(s.name, (counts.get(s.name) || 0) + 1);
    return [...counts.keys()]
      .sort((a, b) => substituentOrder(a) - substituentOrder(b))
      .map((name) => `${MULTIPLIER_PREFIX[counts.get(name)] || ''}${name}`)
      .join('');
  }

  function buildAlcoholName(parentName, hydroxylLocantList, locantedSubstituents, isCyclo) {
    const prefix = parentName === 'メタン'
      ? buildMethaneSubstituentPrefix(locantedSubstituents)
      : buildSubstituentPrefix(locantedSubstituents);
    const count = hydroxylLocantList.length;
    if (count === 0) return prefix + parentName;
    const alcoholStem = parentName.endsWith('ン') ? parentName.slice(0, -1) + 'ノール' : parentName + 'オール';
    if (count === 1) {
      const omitLocant = isCyclo || parentName === 'メタン' || parentName === 'エタン';
      const alcoholPart = omitLocant ? alcoholStem : `${hydroxylLocantList[0]}-${alcoholStem}`;
      return prefix ? (omitLocant ? prefix + alcoholPart : `${prefix}-${alcoholPart}`) : alcoholPart;
    }
    const alcoholPart = `${hydroxylLocantList.join(',')}-${parentName}${MULTIPLIER_PREFIX[count]}オール`;
    return prefix ? `${prefix}-${alcoholPart}` : alcoholPart;
  }

  function buildName(baseName, locantedSubstituents) {
    return buildSubstituentPrefix(locantedSubstituents, baseName === 'エタン') + baseName;
  }

  function compareLocantArrays(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] ?? Infinity, bv = b[i] ?? Infinity;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  // 置換基をアルファベット順(同名なら位置番号順)に並べたときの、位置番号だけの配列を作る。
  // 「位置番号の組み合わせ」が同点の候補同士を比べるときのタイブレークに使う
  // (IUPACの規則: 同点なら、アルファベット順で先に来る置換基により小さい番号を与える)。
  function alphabeticalLocants(rawSubstituents, locantOf) {
    return rawSubstituents
      .map((s) => ({ order: substituentOrder(s.name), locant: locantOf(s) }))
      .sort((a, b) => (a.order - b.order) || (a.locant - b.locant))
      .map((x) => x.locant);
  }

  // 番号の付け方の候補を2段階で比較する。
  // ①位置番号の組み合わせ全体(小さい方が優先)。②それが同点なら、アルファベット順で先に来る
  // 置換基がより小さい番号になっている方を優先する。
  function compareNumberingCandidates(a, b) {
    const bySet = compareLocantArrays(a.locants, b.locants);
    if (bySet !== 0) return bySet;
    return compareLocantArrays(a.alphaLocants, b.alphaLocants);
  }

  // メタン置換体(炭素が1個だけの構造)専用の名前組み立て。
  // 炭素が1個しかなく位置番号に意味がないため、位置番号(ロカント)を付けずに置換基名を連結する。
  // 例: クロロメタン、ジクロロメタン、トリクロロメタン、テトラクロロメタン、クロロフルオロメタン
  function buildMethaneName(substituents) {
    if (substituents.length === 0) return 'メタン'; // 通常は不整合チェックの時点で弾かれるためここには来ない
    const counts = new Map();
    for (const s of substituents) counts.set(s.name, (counts.get(s.name) || 0) + 1);
    const sortedNames = [...counts.keys()].sort((a, b) => substituentOrder(a) - substituentOrder(b));
    const parts = sortedNames.map((name) => {
      const count = counts.get(name);
      const multiplier = MULTIPLIER_PREFIX[count] || '';
      return `${multiplier}${name}`;
    });
    return parts.join('') + 'メタン';
  }

  function nameAlkane(graph) {
    const { nodeIds, adjacency, elements } = graph;
    const carbonIds = nodeIds.filter((id) => elements.get(id) === 'C');

    // 主鎖の炭素が1個だけの場合(ハロゲン化メタン): 2端点間の最長パス探索がそもそも成立しない特殊ケースなので専用に処理する
    if (carbonIds.length === 1) {
      const centerId = carbonIds[0];
      const rawSubstituents = extractSubstituents(graph, new Set([centerId]));
      const hydroxyls = hydroxylLocants(graph, [centerId]);
      if (hydroxyls.length) return buildAlcoholName('メタン', hydroxyls, rawSubstituents.map((s) => ({ locant: 1, name: s.name })), false);
      return buildMethaneName(rawSubstituents);
    }

    // 主鎖の候補端点は炭素のみに限定する(ハロゲンは一価の置換基であり、主鎖の一部にはなれない)。
    // 末端炭素にハロゲンが付いている場合でも正しく端点として扱えるよう、
    // 「全結合数」ではなく「炭素どうしの結合数」が1かどうかで判定する。
    const leaves = carbonIds.filter((id) => {
      let carbonNeighborCount = 0;
      for (const n of adjacency.get(id)) if (elements.get(n) === 'C') carbonNeighborCount++;
      return carbonNeighborCount === 1;
    });
    const distMaps = new Map();
    for (const leaf of leaves) distMaps.set(leaf, bfsDistancesAndParents(adjacency, leaf));

    const candidatePairs = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const d = distMaps.get(leaves[i]).dist.get(leaves[j]);
        if (Number.isFinite(d)) candidatePairs.push([leaves[i], leaves[j]]);
      }
    }

    // 主鎖は「OHを最も多く含む」→「最も長い」の順で、構造そのものから先に決める。
    // 命名できない側鎖を持つ最長鎖候補を捨てて、短い鎖へ後退すると、
    // 3-プロピルヘキサンのような最長鎖規則に反する名前を作ってしまう。
    // そこで命名可能性は主鎖候補の優先順位を変えないものとし、最上位候補だけを命名する。
    const structuralCandidates = candidatePairs.flatMap(([a, b]) => {
      const path = reconstructPath(distMaps.get(a).parent, a, b);
      const hydroxylCount = path.reduce((count, node) => count + [...adjacency.get(node)]
        .filter((neighbor) => elements.get(neighbor) === HYDROXYL_ELEMENT).length, 0);
      return [path, [...path].reverse()].map((orderedPath) => ({ orderedPath, hydroxylCount }));
    });
    const maxHydroxylCount = Math.max(...structuralCandidates.map((candidate) => candidate.hydroxylCount));
    const maxParentLength = Math.max(...structuralCandidates
      .filter((candidate) => candidate.hydroxylCount === maxHydroxylCount)
      .map((candidate) => candidate.orderedPath.length));

    let best = null;
    const candidateErrors = new Set();
    for (const { orderedPath, hydroxylCount } of structuralCandidates) {
      if (hydroxylCount !== maxHydroxylCount || orderedPath.length !== maxParentLength) continue;
      if (orderedPath.length > 35) throw new Error('UNSUPPORTED: 主鎖がペンタトリアコンタンを超えています');
      const pathSet = new Set(orderedPath);
      try {
        const rawSubstituents = extractSubstituents(graph, pathSet);
        const hydroxyls = hydroxylLocants(graph, orderedPath);
        const locantOf = (s) => orderedPath.indexOf(s.backboneNode) + 1;
        const locants = rawSubstituents.map(locantOf).sort((a, b) => a - b);
        const alphaLocants = alphabeticalLocants(rawSubstituents, locantOf);
        const branchCount = rawSubstituents.length;
        const candidate = { orderedPath, rawSubstituents, hydroxyls, locants, alphaLocants, branchCount };
        if (best === null
          || compareLocantArrays(candidate.hydroxyls, best.hydroxyls) < 0
          || (compareLocantArrays(candidate.hydroxyls, best.hydroxyls) === 0 && candidate.branchCount > best.branchCount)
          || (compareLocantArrays(candidate.hydroxyls, best.hydroxyls) === 0 && candidate.branchCount === best.branchCount && compareNumberingCandidates(candidate, best) < 0)) best = candidate;
      } catch (e) {
        // 最優先の主鎖だけを試したうえで理由を返す。短い主鎖への後退はしない。
        candidateErrors.add(e.message);
      }
    }
    if (!best) {
      if (candidateErrors.has('UNSUPPORTED_SUBSTITUENT')) throw new Error('UNSUPPORTED_SUBSTITUENT');
      if (candidateErrors.has('UNSUPPORTED_HYDROXYL_LAYOUT')) throw new Error('UNSUPPORTED_HYDROXYL_LAYOUT');
      throw new Error('UNSUPPORTED_SUBSTITUENT');
    }
    const locantedSubstituents = best.rawSubstituents.map((s) => ({ locant: best.orderedPath.indexOf(s.backboneNode) + 1, name: s.name }));
    if (best.hydroxyls.length) return buildAlcoholName(CHAIN_NAMES[best.orderedPath.length], best.hydroxyls, locantedSubstituents, false);
    return buildName(CHAIN_NAMES[best.orderedPath.length], locantedSubstituents);
  }

  function findRing(graph) {
    const { nodeIds, adjacency } = graph;
    const visited = new Set();
    const parent = new Map();
    const stack = [[nodeIds[0], null]];
    while (stack.length) {
      const [node, from] = stack.pop();
      if (visited.has(node)) continue;
      visited.add(node); parent.set(node, from);
      for (const next of adjacency.get(node)) {
        if (next === from) continue;
        if (visited.has(next)) {
          const ring = [node];
          let cur = node;
          while (cur !== next) { cur = parent.get(cur); ring.push(cur); }
          return ring;
        }
        stack.push([next, node]);
      }
    }
    throw new Error('RING_NOT_FOUND');
  }

  function nameCycloalkane(graph) {
    const ring = findRing(graph);
    const ringSize = ring.length;
    if (ringSize % 2 !== 0) throw new Error('UNSUPPORTED: 奇数員環');
    if (ringSize < 4 || ringSize > 34) throw new Error(`UNSUPPORTED: シクロ${ringSize}員環は対象外`);

    const ringSet = new Set(ring);
    const rawSubstituents = extractSubstituents(graph, ringSet);
    const hydroxylCount = graph.nodeIds.filter((id) => graph.elements.get(id) === HYDROXYL_ELEMENT).length;
    const parentName = 'シクロ' + CHAIN_NAMES[ringSize];
    if (hydroxylCount > 0) {
      let bestAlcohol = null;
      for (let startIdx = 0; startIdx < ringSize; startIdx++) {
        for (const direction of [1, -1]) {
          const ordered = [];
          for (let step = 0; step < ringSize; step++) ordered.push(ring[((startIdx + step * direction) % ringSize + ringSize) % ringSize]);
          try {
            const hydroxyls = hydroxylLocants(graph, ordered);
            const locantOf = (s) => ordered.indexOf(s.backboneNode) + 1;
            const locants = rawSubstituents.map(locantOf).sort((a, b) => a - b);
            const candidate = { ordered, hydroxyls, locants, alphaLocants: alphabeticalLocants(rawSubstituents, locantOf) };
            if (bestAlcohol === null
              || compareLocantArrays(candidate.hydroxyls, bestAlcohol.hydroxyls) < 0
              || (compareLocantArrays(candidate.hydroxyls, bestAlcohol.hydroxyls) === 0 && compareNumberingCandidates(candidate, bestAlcohol) < 0)) bestAlcohol = candidate;
          } catch (e) { /* 主環外のOHを持つ候補は除外 */ }
        }
      }
      if (!bestAlcohol) throw new Error('UNSUPPORTED_HYDROXYL_LAYOUT');
      const locantedSubstituents = rawSubstituents.map((s) => ({ locant: bestAlcohol.ordered.indexOf(s.backboneNode) + 1, name: s.name }));
      return buildAlcoholName(parentName, bestAlcohol.hydroxyls, locantedSubstituents, true);
    }
    if (rawSubstituents.length === 0) return 'シクロ' + CHAIN_NAMES[ringSize];

    // 環の置換基が1個だけなら、どこを1番炭素にしても位置番号は必ず1になり情報を持たないため省略する
    // (例: 1-メチルシクロヘキサン ではなく メチルシクロヘキサン)
    if (rawSubstituents.length === 1) {
      return rawSubstituents[0].name + 'シクロ' + CHAIN_NAMES[ringSize];
    }

    let best = null;
    for (let startIdx = 0; startIdx < ringSize; startIdx++) {
      for (const direction of [1, -1]) {
        const ordered = [];
        for (let step = 0; step < ringSize; step++) {
          const idx = ((startIdx + step * direction) % ringSize + ringSize) % ringSize;
          ordered.push(ring[idx]);
        }
        const locantOf = (s) => ordered.indexOf(s.backboneNode) + 1;
        const locants = rawSubstituents.map(locantOf).sort((a, b) => a - b);
        const alphaLocants = alphabeticalLocants(rawSubstituents, locantOf);
        const candidate = { ordered, locants, alphaLocants };
        if (best === null || compareNumberingCandidates(candidate, best) < 0) best = candidate;
      }
    }
    const locantedSubstituents = rawSubstituents.map((s) => ({ locant: best.ordered.indexOf(s.backboneNode) + 1, name: s.name }));
    return buildName('シクロ' + CHAIN_NAMES[ringSize], locantedSubstituents);
  }

  function generateName(grid) {
    const mismatches = checkMismatches(grid);
    if (mismatches.length > 0) return { ok: false, error: 'INCOMPLETE_BONDS', mismatches };
    const graph = buildGraph(grid);
    if (graph.nodeIds.length === 0) return { ok: false, error: 'EMPTY_GRID' };
    const connectivity = checkConnectivity(graph);
    if (!connectivity.allConnected) return { ok: false, error: 'DISCONNECTED', islands: connectivity.islands };
    const structureType = classifyStructure(graph);
    try {
      validateHydroxyls(graph);
      if (structureType === 'ALKANE') return { ok: true, name: nameAlkane(graph) };
      if (structureType === 'CYCLOALKANE') return { ok: true, name: nameCycloalkane(graph) };
      return { ok: false, error: structureType };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function panelFor(type, targetDirs) {
    const targetSet = new Set(targetDirs);
    const base = PANEL_ARM_TABLE[type];
    for (let steps = 0; steps < 4; steps++) {
      const candidate = new Set(base.map((d) => rotateCW(d, steps)));
      if (candidate.size === targetSet.size && [...candidate].every((d) => targetSet.has(d))) {
        return { type, rotation: steps * 90 };
      }
    }
    throw new Error('NO_ROTATION_MATCH'); // 生成ロジックのバグ(本来到達しないはず)
  }

  function directionBetween([r1, c1], [r2, c2]) {
    if (r2 === r1 - 1 && c2 === c1) return 'N';
    if (r2 === r1 + 1 && c2 === c1) return 'S';
    if (r2 === r1 && c2 === c1 + 1) return 'E';
    if (r2 === r1 && c2 === c1 - 1) return 'W';
    throw new Error('NOT_ADJACENT');
  }

  function panelForDirections(dirs) {
    const set = new Set(dirs);
    const n = set.size;
    if (n === 1) return panelFor(1, [...set]);
    if (n === 2) {
      const [a, b] = [...set];
      return panelFor(OPPOSITE[a] === b ? 2 : 3, [...set]);
    }
    if (n === 3) return panelFor(4, [...set]);
    if (n === 4) return panelFor(5, [...set]);
    throw new Error('INVALID_DIRECTION_COUNT');
  }

  const ARM_END = 44;
  const H_LINE_END = 25;
  const H_CIRCLE_AT = 32;

  function svgIcon(type, mismatchActualDirs, rotationDeg, highlightAlpha, element, halogenBondDirs) {
    const isHalogen = !!element && element !== 'C';
    let underlay = '';
    let arms = '';

    if (isHalogen) {
      // ハロゲンは向きを持たない一価原子。結合が成立している方向(halogenBondDirs)にだけ手を1本描く。
      // 未接続(パレット/ゴースト/孤立)のときは手を描かず、丸と元素記号だけを表示する。
      const bondSet = halogenBondDirs || new Set();
      for (const dir of DIR_ORDER) {
        if (!bondSet.has(dir)) continue;
        const [dx, dy] = VEC[dir];
        const x1 = 50 + dx * 13, y1 = 50 + dy * 13, x2 = 50 + dx * ARM_END, y2 = 50 + dy * ARM_END;
        if (highlightAlpha > 0) {
          underlay += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--highlighter)" stroke-width="14" stroke-linecap="round" opacity="${highlightAlpha}"/>`;
        }
        arms += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text)" stroke-width="3" stroke-linecap="round"/>`;
      }
      if (element === HYDROXYL_ELEMENT) {
        const bondDir = [...bondSet][0];
        if (bondDir) {
          const [dx, dy] = VEC[OPPOSITE[bondDir]];
          const x1 = 50 + dx * 13, y1 = 50 + dy * 13, x2 = 50 + dx * H_LINE_END, y2 = 50 + dy * H_LINE_END;
          const cx = 50 + dx * H_CIRCLE_AT, cy = 50 + dy * H_CIRCLE_AT;
          arms += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>`;
          arms += `<circle cx="${cx}" cy="${cy}" r="6" fill="var(--paper)" stroke="var(--text-muted)" stroke-width="2"/>`;
        } else {
          // デッキ・未結合時は、結合線を出さずにHを右上(約2時方向)へ直接付ける。
          arms += `<circle cx="64.1" cy="35.9" r="6" fill="var(--paper)" stroke="var(--text-muted)" stroke-width="2"/>`;
        }
        const atom = `<circle cx="50" cy="50" r="14" fill="${HYDROXYL_FILL}"/>`;
        return `<svg viewBox="0 0 100 100" width="100%" height="100%">${underlay}${arms}${atom}</svg>`;
      }
      const info = HALOGEN_INFO[element];
      const fontSize = element.length === 1 ? 32 : 24;
      const atom = `<circle cx="50" cy="50" r="27" fill="${info.fill}" stroke="${info.stroke}" stroke-width="2"/>`
        + `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="700" fill="${info.stroke}">${element}</text>`;
      return `<svg viewBox="0 0 100 100" width="100%" height="100%">${underlay}${arms}${atom}</svg>`;
    }

    const base = new Set(PANEL_ARM_TABLE[type]);
    const mismatchBase = new Set((mismatchActualDirs || []).map((d) => toBaseDir(d, rotationDeg)));
    for (const dir of DIR_ORDER) {
      const [dx, dy] = VEC[dir];
      if (base.has(dir)) {
        const danger = mismatchBase.has(dir);
        const x1 = 50 + dx * 13, y1 = 50 + dy * 13, x2 = 50 + dx * ARM_END, y2 = 50 + dy * ARM_END;
        if (highlightAlpha > 0 && !danger) {
          underlay += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--highlighter)" stroke-width="14" stroke-linecap="round" opacity="${highlightAlpha}"/>`;
        }
        arms += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${danger ? 'var(--warning)' : 'var(--text)'}" stroke-width="3" stroke-linecap="round"/>`;
      } else {
        // 炭素の未結合の手: 薄い線 + 小さな白丸(水素原子を表す)
        const x1 = 50 + dx * 13, y1 = 50 + dy * 13, x2 = 50 + dx * H_LINE_END, y2 = 50 + dy * H_LINE_END;
        const cx = 50 + dx * H_CIRCLE_AT, cy = 50 + dy * H_CIRCLE_AT;
        arms += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round"/>`;
        arms += `<circle cx="${cx}" cy="${cy}" r="6" fill="var(--paper)" stroke="var(--text-muted)" stroke-width="2"/>`;
      }
    }
    const atom = `<circle cx="50" cy="50" r="14" fill="var(--text)"/>`;
    return `<svg viewBox="0 0 100 100" width="100%" height="100%">${underlay}${arms}${atom}</svg>`;
  }


const emptyGrid=()=>Array.from({length:ROWS},()=>Array(COLS).fill(null));
const clone=g=>g.map(row=>row.map(p=>p?{...p}:null));
function signature(g){return g.map((row,r)=>row.map((p,c)=>p?`${p.element||'C'}:${[...getBondDirections(g,r,c)].sort().join('')}`:'').join('|')).join('/');}
function matches(a,b){return signature(a)===signature(b)&&checkMismatches(a).length===0;}
// Like applyTraceToGrid: preserve existing reciprocal bonds and merge route bonds.
function applyTrace(original,route){
 const g=clone(original),path=route.map(p=>p.slice());
 const closed=path.length>2&&path[0][0]===path.at(-1)[0]&&path[0][1]===path.at(-1)[1];
 if(closed)path.pop();if(path.length<2)return g;
 path.forEach(([r,c],i)=>{
  const dirs=new Set();
  for(const d of getBondDirections(original,r,c)){const[dr,dc]=DELTA[d],n=original[r+dr]?.[c+dc];if(n&&getBondDirections(original,r+dr,c+dc).has(OPPOSITE[d]))dirs.add(d);}
  if(i>0)dirs.add(directionBetween(path[i],path[i-1]));else if(closed)dirs.add(directionBetween(path[i],path.at(-1)));
  if(i+1<path.length)dirs.add(directionBetween(path[i],path[i+1]));else if(closed)dirs.add(directionBetween(path[i],path[0]));
  g[r][c]=panelForDirections([...dirs]);
 });return g;
}
function icon(panel,g,r,c){if(!panel)return '';const element=panel.element||'C';return `<span class="rotor" style="transform:rotate(${element==='C'?panel.rotation:0}deg)">${svgIcon(panel.type,null,panel.rotation,0,element,g?getBondDirections(g,r,c):null)}</span>`;}
const api={ROWS,COLS,DELTA,OPPOSITE,emptyGrid,clone,signature,matches,applyTrace,generateName,panelForDirections,getBondDirections,checkMismatches,icon};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TutorialBoard=api;
})(typeof window!=='undefined'?window:globalThis);
