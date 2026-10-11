import { test, expect } from '@playwright/test';

test('idle character blinks briefly and returns to the original frame', async ({page}) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.clock.install({time:new Date(2026,9,11,12,0)});
  await page.goto('/');
  await expect(page.locator('.blink-frame')).toHaveCSS('opacity','0');
  await page.clock.runFor(5000);
  await expect(page.locator('.blink-frame')).toHaveCSS('opacity','1');
  await page.clock.runFor(140);
  await expect(page.locator('.blink-frame')).toHaveCSS('opacity','0');
});

test('wall clock follows local date and time across midnight', async ({page}) => {
  await page.clock.install({time:new Date(2026,9,11,23,59,58)});
  await page.goto('/');
  await expect(page.locator('.wall-date')).toHaveText('2026年10月11日（日）');
  await expect(page.locator('.wall-time')).toHaveText('23:59');
  await page.clock.fastForward(3000);
  await expect(page.locator('.wall-date')).toHaveText('2026年10月12日（月）');
  await expect(page.locator('.wall-time')).toHaveText('00:00');
});

test('double knock, accessible single-tap setting, and greeting', async ({page}) => {
  await page.goto('/');
  await page.screenshot({path:'/tmp/memory-window-preview.png',fullPage:true});
  const window = page.getByRole('button', {name:/^窓をノック/});
  await window.click();
  await expect(page.getByRole('status')).toContainText('ここで、ゆっくり。');
  await page.waitForTimeout(120);
  await window.click();
  await expect(page.getByRole('status')).not.toContainText('ここで、ゆっくり。');
  await expect(page.locator('.scene')).toHaveClass(/state-turn|state-wave|state-greeting/);
  await page.reload();
  await page.getByText('操作・音声の設定', {exact:true}).click();
  await page.getByRole('checkbox', {name:'一度のタップでノックする'}).check();
  await window.click();
  await expect(page.getByRole('status')).not.toContainText('ここで、ゆっくり。');
});

test('keyboard knock and television/radio open without triggering knock', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:'思い出のテレビを開く',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', {name:'思い出のテレビ',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('ここで、ゆっくり。');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', {name:'思い出のラジオを開く',exact:true}).click();
  await expect(page.getByRole('heading',{name:'思い出のラジオ',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  const window = page.getByRole('button',{name:/^窓をノック/});
  await window.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).not.toContainText('ここで、ゆっくり。');
});

test('local photos display and are cleared on close', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'写真',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'memory.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')});
  await expect(page.getByRole('img',{name:'選択した写真 1'})).toBeVisible();
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'写真',exact:true}).click();
  await expect(page.getByRole('img',{name:'選択した写真 1'})).toHaveCount(0);
});

test('PWA shell loads offline after installation', async ({page,context}) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.weather-art').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.character-pose').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.room-art image')).toHaveAttribute('href','/art/room.png');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading',{name:'思い出の窓',exact:true})).toBeVisible();
  await expect.poll(() => page.locator('.weather-art').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('.character-pose').evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(async () => (await fetch('/art/room.png')).ok)).toBe(true);
  await page.getByRole('button',{name:/^窓をノック/}).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).not.toContainText('ここで、ゆっくり。');
  await context.setOffline(false);
});

test('unsupported content is rejected and reduced motion disables animation', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect.poll(() => page.locator('.character-sprite').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.getByRole('button',{name:'写真',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
  await expect(page.getByRole('alert')).toContainText('対応する形式');
  await expect(page.getByRole('img',{name:'選択した写真 1'})).toHaveCount(0);
});

test('tablet touch can knock without horizontal overflow', async ({browser,baseURL}) => {
  const context = await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,baseURL});
  const page = await context.newPage();
  await page.goto('/');
  const window = page.getByRole('button',{name:/^窓をノック/});
  await window.tap(); await page.waitForTimeout(120); await window.tap();
  await expect(page.getByRole('status')).not.toContainText('ここで、ゆっくり。');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
