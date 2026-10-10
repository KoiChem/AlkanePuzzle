(function (root) {
  'use strict';
  const ENDPOINT = 'https://api.github.com/repos/KoiChem/AlkanePuzzle/contents/data/shared-settings.json';
  const HEADERS = {Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'};
  const clone = value => JSON.parse(JSON.stringify(value));
  function validateProfile(value) {
    if (!value || value.version !== 1 || typeof value.revision !== 'string' || !value.revision || value.revision.length > 100) throw new Error('共通設定の形式が不正です。');
    const p = value.password;
    if (!p || p.algorithm !== 'PBKDF2-SHA-256' || !Number.isInteger(p.iterations) || p.iterations < 150000 || p.iterations > 1000000
      || typeof p.salt !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(p.salt)
      || typeof p.hash !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(p.hash)) throw new Error('管理パスワードの設定が不正です。');
    for (const game of ['game1','game2']) {
      for (const tier of ['easy','medium','hard']) {
        const s = value.settings?.[game]?.[tier];
        if (!s) throw new Error('難易度設定が不足しています。');
        const ranges = {typeMin:[1,6],typeMax:[1,6],lenMin:[1,10],lenMax:[1,10],subMin:[0,10],subMax:[0,10],alcoholRate:[0,100]};
        if (game === 'game1') Object.assign(ranges,{gridCols:[3,7],gridRows:[3,5]});
        else Object.assign(ranges,{bendMin:[0,10],bendMax:[0,99]});
        for (const [key,[lo,hi]] of Object.entries(ranges)) if (!Number.isInteger(s[key]) || s[key] < lo || s[key] > hi) throw new Error('難易度設定の数値が不正です。');
        for (const [lo,hi] of [['typeMin','typeMax'],['lenMin','lenMax'],['subMin','subMax'],...(game === 'game2' ? [['bendMin','bendMax']] : [])]) if (s[lo] > s[hi]) throw new Error('設定範囲の下限が上限を超えています。');
        if (!Array.isArray(s.ringSizes) || s.ringSizes.length === 0 || new Set(s.ringSizes).size !== s.ringSizes.length || s.ringSizes.some(n => ![4,6,8,10].includes(n))) throw new Error('シクロ主鎖の炭素数が不正です。');
        for (const key of ['forceRingSubstituent','alcoholEnabled','hydroxylLimitOne','hydroxylCountsAsSubstituent',...(game === 'game2' ? ['shuffleWordBankGroups','cycloLimitOne'] : [])]) if (typeof s[key] !== 'boolean') throw new Error('難易度設定のON/OFFが不正です。');
        if (s.alcoholEnabled !== value.settings[game].easy.alcoholEnabled) throw new Error('アルコール出題の設定はゲーム共通です。');
      }
    }
    return clone(value);
  }
  function encode(text) { return btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join('')); }
  function decode(text) { return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')), c => c.charCodeAt(0))); }
  async function requestJson(url, options, request) {
    let response;
    try { response = await request(url, {...options,cache:'no-store',signal:AbortSignal.timeout(15000)}); }
    catch { throw new Error('通信できませんでした。接続を確認して再試行してください。'); }
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) throw new Error('共通設定が更新された可能性があります。変更を書き出して保全し、最新設定を読み直してください。');
      if (response.status === 401) throw new Error('GitHubトークンが無効または期限切れです。');
      if (response.status === 403) throw new Error('GitHubの権限または利用制限を確認してください。対象リポジトリのContentsをRead and writeにしてください。');
      throw new Error(`共通設定を取得・保存できませんでした（${response.status}）。再試行してください。`);
    }
    try { return await response.json(); } catch { throw new Error('共通設定の応答を読み取れませんでした。'); }
  }
  async function readPublished(request = fetch) {
    const url = new URL('data/shared-settings.json', document.baseURI);
    url.searchParams.set('fresh',Date.now().toString());
    return validateProfile(await requestJson(url.href,{},request));
  }
  async function readGithub(request = fetch) {
    const data = await requestJson(`${ENDPOINT}?ref=main`,{headers:HEADERS},request);
    if (typeof data.sha !== 'string' || !data.sha || typeof data.content !== 'string') throw new Error('GitHubの設定ファイルを確認できません。');
    let profile;
    try { profile = JSON.parse(decode(data.content)); } catch { throw new Error('GitHubの設定ファイルが不正です。'); }
    return {profile:validateProfile(profile),sha:data.sha};
  }
  async function writeGithub(profile, sha, token, request = fetch) {
    const candidate = validateProfile(profile);
    if (typeof sha !== 'string' || !sha) throw new Error('保存元の版を確認できません。最新設定を読み直してください。');
    if (typeof token !== 'string' || !token.trim()) throw new Error('GitHubトークンを入力してください。');
    const data = await requestJson(ENDPOINT,{method:'PUT',headers:{...HEADERS,Authorization:`Bearer ${token.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({message:'Update shared AlkanePuzzle settings',branch:'main',sha,content:encode(JSON.stringify(candidate,null,2)+'\n')})},request);
    if (!data.content?.sha || !data.commit?.sha) throw new Error('保存結果を確認できません。最新設定を読み直してください。');
    return {sha:data.content.sha,commit:data.commit.sha};
  }
  async function derive(password, record) {
    const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(atob(record.salt),c => c.charCodeAt(0)),iterations:record.iterations,hash:'SHA-256'},key,256));
  }
  async function createPassword(password) {
    if (typeof password !== 'string' || !password.trim()) throw new Error('新しいパスワードを入力してください。');
    const record = {algorithm:'PBKDF2-SHA-256',iterations:150000,salt:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))};
    record.hash = btoa(String.fromCharCode(...await derive(password,record)));
    return record;
  }
  async function verifyPassword(password, record) {
    if (typeof password !== 'string') return false;
    try {
      const actual = await derive(password,record), expected = Uint8Array.from(atob(record.hash),c => c.charCodeAt(0));
      if (actual.length !== expected.length) return false;
      let difference = 0;
      actual.forEach((byte,i) => { difference |= byte ^ expected[i]; });
      return difference === 0;
    } catch { return false; }
  }
  root.AlkaneSettings = {clone,validateProfile,readPublished,readGithub,writeGithub,createPassword,verifyPassword};
  if (typeof module !== 'undefined') module.exports = root.AlkaneSettings;
})(globalThis);
