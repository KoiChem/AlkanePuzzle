const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../shared-settings.js');
const initial = JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/shared-settings.json'),'utf8'));
test('new password record accepts only the new password without storing plaintext', async () => {
  const record = await api.createPassword('new-test-password');
  assert.equal(await api.verifyPassword('new-test-password',record),true);
  assert.equal(await api.verifyPassword('wrong-test-password',record),false);
  assert.equal(JSON.stringify(record).includes('new-test-password'),false);
});
test('GitHub save sends the original SHA and preserves the full common profile', async () => {
  let saved;
  const result = await api.writeGithub(initial,'original-sha','fixture-token',async (url,options) => {
    assert.equal(url,'https://api.github.com/repos/KoiChem/AlkanePuzzle/contents/data/shared-settings.json');
    assert.equal(options.method,'PUT');
    assert.equal(options.headers.Authorization,'Bearer fixture-token');
    const body = JSON.parse(options.body);
    assert.equal(body.sha,'original-sha'); assert.equal(body.branch,'main');
    saved = JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
    return Response.json({content:{sha:'saved-sha'},commit:{sha:'saved-commit'}});
  });
  assert.deepEqual(saved,initial);
  assert.deepEqual(result,{sha:'saved-sha',commit:'saved-commit'});
});
test('conflict, rejected credential and network failure do not change the draft', async () => {
  for (const status of [409,422,401,403]) {
    const draft = api.clone(initial);
    await assert.rejects(api.writeGithub(draft,'original','fixture-token',async () => new Response('',{status})));
    assert.deepEqual(draft,initial);
  }
  await assert.rejects(api.writeGithub(initial,'original','fixture-token',async () => {throw new Error('network');}),/通信/);
});
test('malformed settings and missing credentials cannot be saved', async () => {
  const invalid = api.clone(initial); invalid.settings.game2.easy.subMax = -1;
  const unexpectedRequest = () => { assert.fail('invalid settings must never reach GitHub'); };
  await assert.rejects(api.writeGithub(invalid,'original','fixture-token',unexpectedRequest));
  await assert.rejects(api.writeGithub(initial,'','fixture-token',unexpectedRequest));
  await assert.rejects(api.writeGithub(initial,'original','',unexpectedRequest));
});
