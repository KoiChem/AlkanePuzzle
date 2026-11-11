(() => {
  'use strict';
  const practice = document.querySelector('#practice-mode'), quiz = document.querySelector('#quiz-mode');
  const panel = document.querySelector('#question-panel'), prompt = document.querySelector('#question-name');
  const check = document.querySelector('#check-structure'), next = document.querySelector('#next-question');
  const feedback = document.querySelector('#question-feedback'), names = document.querySelector('#names');
  const enabled = {hydrocarbon:true,oxygen:true,aromatic:true};
  let active = false, target = null, practiceState = null;
  function controls() {
    const available = UnsatQuestions.pool(enabled).length > 0;
    next.disabled = !available;
    check.disabled = !available || !target || !enabled[target.category];
    prompt.textContent = !available ? '出題する分類を選んでください' : target && enabled[target.category] ? target.name : '「次の問題」で出題します';
  }
  function newQuestion() {
    const q = UnsatQuestions.choose(enabled, target?.name);
    if (!q) return;
    cancel(); target = q; atoms = {}; bonds = {}; history = []; select(null); render(); controls();
    feedback.textContent = ''; message('');
  }
  function mode(value) {
    if (value === active) return;
    cancel();
    if (value) practiceState = JSON.stringify({atoms,bonds,history,tool});
    active = value;
    practice.setAttribute('aria-pressed',String(!active)); quiz.setAttribute('aria-pressed',String(active));
    panel.hidden = !active; names.hidden = active;
    if (active) newQuestion();
    else if (practiceState) { const saved=JSON.parse(practiceState); atoms=saved.atoms; bonds=saved.bonds; history=saved.history; tool=null; select(saved.tool); render(); message(''); }
  }
  practice.onclick=()=>mode(false); quiz.onclick=()=>mode(true);
  for (const b of document.querySelectorAll('[data-category]')) b.onclick=()=>{
    const category=b.dataset.category; enabled[category]=!enabled[category];
    b.setAttribute('aria-pressed',String(enabled[category])); feedback.textContent=''; controls();
  };
  next.onclick=newQuestion;
  check.onclick=()=>{
    if (check.disabled) return;
    const g=UnsatNaming.graph(atoms,bonds);
    feedback.textContent=UnsatQuestions.matches(g,hydrogen,target)?'正解！':'まだ違います。構造を確認してみましょう。';
  };
  window.UnsatQuiz={edited(){if(active){names.hidden=true;feedback.textContent='';controls();}}};
  controls();
})();
