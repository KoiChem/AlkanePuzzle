const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const APP_URL = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const CHROMIUM_EXECUTABLE = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
].find((candidate) => candidate && fs.existsSync(candidate));

test('keeps the naming answer when a wrap moves controls under a rapid repeat tap', async (t) => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await page.goto(APP_URL);
  await page.getByRole('button', { name: '名付ける', exact: true }).click();

  const fluoro = page.getByRole('button', { name: 'フルオロ', exact: true });
  for (let index = 0; index < 6; index += 1) await fluoro.click();

  const numberThree = page.getByRole('button', { name: '3', exact: true });
  await numberThree.click();
  await page.evaluate(() => {
    document.querySelector('.token-scroll').scrollTop = 0;
    window.scrollTo(0, 48);
  });

  const pointBeforeWrap = await numberThree.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const heightBeforeWrap = await page.locator('#answer-preview').evaluate((preview) => preview.getBoundingClientRect().height);

  await numberThree.click();
  const layoutAfterWrap = await page.evaluate(({ x, y }) => {
    const clearRect = document.querySelector('.control-row button:nth-child(2)').getBoundingClientRect();
    return {
      answerCount: document.querySelectorAll('#answer-preview .answer-chip').length,
      clearMovedUnderTap: x >= clearRect.left && x <= clearRect.right && y >= clearRect.top && y <= clearRect.bottom,
      previewHeight: document.querySelector('#answer-preview').getBoundingClientRect().height,
    };
  }, pointBeforeWrap);
  assert.equal(layoutAfterWrap.answerCount, 8);
  assert.ok(layoutAfterWrap.previewHeight > heightBeforeWrap + 20, 'the eighth token must create a new answer line');
  assert.equal(layoutAfterWrap.clearMovedUnderTap, true, 'the clear button must move under the previous token position');

  await page.getByRole('button', { name: '1つ戻す', exact: true }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelector('.token-scroll').scrollTop = 0;
    window.scrollTo(0, 48);
  });
  const repeatPoint = await numberThree.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.mouse.click(repeatPoint.x, repeatPoint.y);
  await page.mouse.click(repeatPoint.x, repeatPoint.y);

  assert.equal(
    await page.locator('#answer-preview .answer-chip').count(),
    8,
    'the first tap should add one token and the shifted control row must ignore the repeat tap',
  );

  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'クリア', exact: true }).click();
  assert.equal(await page.locator('#answer-preview .answer-chip').count(), 0, 'clear must work after the guard settles');
  await page.getByRole('button', { name: '1つ戻す', exact: true }).click();
  assert.equal(await page.locator('#answer-preview .answer-chip').count(), 8, 'undo must restore the deliberately cleared answer');
});

test('protects the shifted control row at wider viewport sizes too', async (t) => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM_EXECUTABLE });
  t.after(() => browser.close());

  for (const viewport of [
    { width: 375, height: 667 },
    { width: 768, height: 1024 },
    { width: 1280, height: 900 },
  ]) {
    await t.test(`${viewport.width}x${viewport.height}`, async () => {
      const page = await browser.newPage({ viewport });
      await page.goto(APP_URL);
      await page.getByRole('button', { name: '名付ける', exact: true }).click();

      const numberButtons = page.locator('.token-scroll .cat-number button');
      const clearBox = await page.getByRole('button', { name: 'クリア', exact: true }).boundingBox();
      const candidates = await numberButtons.all();
      let tokenButton = null;
      for (const candidate of candidates) {
        const box = await candidate.boundingBox();
        const centerX = box.x + box.width / 2;
        if (centerX >= clearBox.x && centerX <= clearBox.x + clearBox.width) {
          tokenButton = candidate;
          break;
        }
      }
      assert.ok(tokenButton, 'a number token must align horizontally with the clear button');

      let countBeforeWrap = 0;
      let previousHeight = await page.locator('#answer-preview').evaluate((preview) => preview.getBoundingClientRect().height);
      for (let count = 1; count <= 80; count += 1) {
        await tokenButton.click();
        const height = await page.locator('#answer-preview').evaluate((preview) => preview.getBoundingClientRect().height);
        if (height > previousHeight + 20) {
          countBeforeWrap = count - 1;
          break;
        }
        previousHeight = height;
      }
      assert.ok(countBeforeWrap > 0, 'repeated number tokens must reach a wrapping boundary');

      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '1つ戻す', exact: true }).click();
      await page.waitForTimeout(400);
      await tokenButton.scrollIntoViewIfNeeded();
      const repeatPoint = await tokenButton.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });

      await page.mouse.click(repeatPoint.x, repeatPoint.y);
      await page.mouse.click(repeatPoint.x, repeatPoint.y);

      assert.equal(
        await page.locator('#answer-preview .answer-chip').count(),
        countBeforeWrap + 1,
        'only the tap that creates the new line should change the answer',
      );
      await page.close();
    });
  }
});
