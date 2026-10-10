(function () {
  'use strict';
  const api = AlkaneSettings, $ = id => document.getElementById(id);
  let loaded = null, draft = null, savedProfile = null, publicationTimer = null, busy = false, authenticatedPassword = null;
  function status(message) {
    const dirty = loaded && draft && JSON.stringify(draft) !== JSON.stringify(loaded.profile);
    $('status').textContent = message + (dirty ? '\n未保存の変更があります。' : '');
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['save-button','save-confirm','password-button','password-confirm','logout-button','login-button']) $(id).disabled = value;
    $('editor').inert = value;
  }
  function stopPublicationCheck() { clearTimeout(publicationTimer); publicationTimer = null; }
  function clearFields(dialog) { for (const input of dialog.querySelectorAll('input')) input.value = ''; }
  function lock() {
    stopPublicationCheck();
    loaded = draft = authenticatedPassword = savedProfile = null;
    $('editor').src = 'about:blank';
    $('login-section').hidden = false;
    $('admin-section').hidden = true;
    $('saved-link').hidden = true;
    $('publication-button').hidden = true;
    $('login-password').value = '';
    status('管理パスワードを入力してください。');
    $('login-password').focus();
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    let password = $('login-password').value; $('login-password').value = '';
    setBusy(true); status('共通設定を確認しています…');
    try {
      const latest = await api.readGithub();
      if (!await api.verifyPassword(password,latest.profile.password)) throw new Error('パスワードが違います。');
      loaded = latest; draft = api.clone(latest.profile); authenticatedPassword = api.clone(latest.profile.password);
      $('login-section').hidden = true; $('admin-section').hidden = false;
      $('editor').src = 'index.html?v=20261010-shared-v1';
      status('GitHubの共通設定を読み込みました。');
    } catch (error) { status(error.message); }
    finally { password = ''; setBusy(false); }
  });
  window.addEventListener('message', event => {
    if (!draft || event.origin !== location.origin || event.source !== $('editor').contentWindow) return;
    if (event.data?.type === 'alkane-settings-ready') $('editor').contentWindow.postMessage({type:'alkane-settings-edit',profile:draft},location.origin);
    if (event.data?.type === 'alkane-settings-height' && Number.isFinite(event.data.height)) $('editor').style.height = `${Math.min(2400,Math.max(400,event.data.height))}px`;
    if (event.data?.type === 'alkane-settings-draft' && !busy) {
      try { draft = api.validateProfile({...draft,settings:event.data.settings}); status('変更は下書きです。「GitHubへ保存」で全端末に反映します。'); }
      catch (error) { status(error.message); }
    }
  });
  for (const [open,dialog,cancel] of [['save-button','save-dialog','save-cancel'],['password-button','password-dialog','password-cancel']]) {
    $(open).addEventListener('click', () => { if (!loaded || busy) return; clearFields($(dialog)); $('password-status').textContent = ''; $(dialog).showModal(); $(dialog).querySelector('input').focus(); });
    $(cancel).addEventListener('click', () => { if (!busy) $(dialog).close(); });
    $(dialog).addEventListener('close', () => clearFields($(dialog)));
    $(dialog).addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  }
  $('password-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!draft || busy) return;
    let current = $('current-password').value, next = $('new-password').value, confirmation = $('confirm-password').value;
    clearFields($('password-dialog')); setBusy(true);
    try {
      if (next !== confirmation) throw new Error('新しいパスワードが一致しません。');
      if (!await api.verifyPassword(current,authenticatedPassword)) throw new Error('現在のパスワードが違います。');
      draft.password = await api.createPassword(next);
      $('password-dialog').close(); status('新しいパスワードを下書きに反映しました。「GitHubへ保存」で変更が確定します。');
    } catch (error) { $('password-status').textContent = error.message; }
    finally { current = next = confirmation = ''; setBusy(false); }
  });
  async function checkPublication(remaining = 0) {
    if (!savedProfile) return;
    const expected = savedProfile;
    try {
      const published = await api.readPublished();
      if (savedProfile !== expected) return;
      if (JSON.stringify(published) === JSON.stringify(expected)) {
        status('公開への反映を確認しました。各端末を再読み込みすると共通設定が反映されます。');
        $('publication-button').hidden = true; stopPublicationCheck(); return;
      }
      status('GitHubへの保存は完了しました。公開への反映を待っています。');
    } catch { if (savedProfile === expected) status('GitHubへの保存は完了しました。公開反映の確認は再試行してください。'); }
    if (savedProfile === expected && remaining > 0) publicationTimer = setTimeout(() => checkPublication(remaining-1),5000);
  }
  $('publication-button').addEventListener('click', () => { stopPublicationCheck(); checkPublication(0); });
  $('save-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!draft || !loaded || busy) return;
    let token = $('github-token').value; $('github-token').value = '';
    setBusy(true); stopPublicationCheck(); status('GitHubへ保存しています…');
    try {
      // The original SHA prevents an intervening administrator's update being overwritten.
      const candidate = api.validateProfile({...draft,revision:crypto.randomUUID()});
      const result = await api.writeGithub(candidate,loaded.sha,token);
      draft = candidate; loaded = {profile:api.clone(candidate),sha:result.sha}; authenticatedPassword = api.clone(candidate.password);
      savedProfile = api.clone(candidate); $('save-dialog').close();
      $('saved-link').href = `https://github.com/KoiChem/AlkanePuzzle/commit/${result.commit}`; $('saved-link').hidden = false;
      $('publication-button').hidden = false;
      status('GitHubへの保存は完了しました。公開への反映を確認しています…');
      checkPublication(24);
    } catch (error) { status(error.message + '\n変更は下書きに残っています。'); $('save-dialog').close(); }
    finally { token = ''; setBusy(false); }
  });
  $('logout-button').addEventListener('click', lock);
  window.addEventListener('beforeunload', event => {
    if (loaded && draft && JSON.stringify(draft) !== JSON.stringify(loaded.profile)) { event.preventDefault(); event.returnValue = ''; }
  });
})();
