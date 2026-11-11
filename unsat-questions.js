(() => {
  'use strict';
  const groups = {
    hydrocarbon: ['エタン','プロパン','ブタン','エチレン','プロピレン','1-ブテン','シス-2-ブテン','トランス-2-ブテン','アセチレン','プロピン','1-ブチン','2-ブチン','1,3-ブタジエン','イソプレン'],
    oxygen: ['メタノール','エタノール','1-プロパノール','2-プロパノール','エチレングリコール','グリセリン','ジメチルエーテル','ジエチルエーテル','ホルムアルデヒド','アセトアルデヒド','プロパナール','アセトン','2-ブタノン','ギ酸','酢酸','プロピオン酸','酪酸','吉草酸','シュウ酸','乳酸','アクリル酸','メタクリル酸','マレイン酸','フマル酸','ギ酸メチル','ギ酸エチル','酢酸メチル','酢酸エチル','無水酢酸','無水プロピオン酸','無水酪酸','無水吉草酸'],
    aromatic: ['ベンゼン','トルエン','エチルベンゼン','スチレン','フェノール','アニソール','ベンズアルデヒド','アセトフェノン','安息香酸','安息香酸メチル','酢酸フェニル','o-キシレン','m-キシレン','p-キシレン','カテコール','レゾルシノール','ヒドロキノン','フタル酸','イソフタル酸','テレフタル酸','サリチル酸','サリチル酸メチル','サリチル酸エチル','アセチルサリチル酸']
  };
  const questions = Object.entries(groups).flatMap(([category,names]) => names.map(name => ({category,name})));
  function pool(enabled) { return questions.filter(q => enabled[q.category]); }
  function choose(enabled, previous, random = Math.random) {
    const all = pool(enabled), others = all.filter(q => q.name !== previous);
    const candidates = others.length ? others : all;
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
  }
  function matches(g, hydrogen, target) {
    if (!target || !g.ids.length || !UnsatNaming.complete(g)) return false;
    const seen = new Set([g.ids[0]]), queue = [g.ids[0]];
    for (let i=0;i<queue.length;i++) for (const b of g.adj.get(queue[i])) if (!seen.has(b.id)) { seen.add(b.id); queue.push(b.id); }
    return seen.size === g.ids.length && UnsatNaming.name(g, hydrogen) === target.name;
  }
  window.UnsatQuestions = {questions,pool,choose,matches};
})();
