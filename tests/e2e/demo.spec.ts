import {test,expect} from '@playwright/test';
test.beforeEach(async({request})=>{await request.post('/api/demo/reset',{data:{confirm:true}});});
async function choose(page:import('@playwright/test').Page,role:string){await page.getByRole('button',{name:role,exact:true}).click();await expect(page.getByRole('button',{name:'ログアウト',exact:true})).toBeVisible();}
async function switchAccount(page:import('@playwright/test').Page,role:string){await page.getByRole('button',{name:'ログアウト',exact:true}).click();await choose(page,role);}

test('conversation approaches slowly, settles chest-up, and restores the window',async({page})=>{
  await page.goto('/settings');
  await choose(page,'利用者として体験（Premium）');
  await page.getByRole('button',{name:'窓に戻る',exact:true}).click();
  await page.getByRole('button',{name:'会話を始める',exact:true}).click();
  await expect(page.locator('.scene-interaction')).toHaveClass(/conversation-approaching/);
  await expect(page.locator('.scene')).toHaveClass(/state-walking/);
  await expect.poll(() => page.locator('.character-pose').getAttribute('src'),{intervals:[50],timeout:2500}).toBe('/art/character-v2-walking-step.png');
  await expect(page.locator('.scene-interaction')).toHaveClass(/conversation-focused/);
  await expect(page.locator('.scene-interaction')).not.toHaveClass(/conversation-approaching/);
  const height=await page.locator('.character-sprite').evaluate(node=>getComputedStyle(node).height);
  const sceneHeight=await page.locator('.scene').evaluate(node=>getComputedStyle(node).height);
  expect(parseFloat(height)).toBeGreaterThan(parseFloat(sceneHeight)*1.9);
  await expect(page.locator('.wall-clock')).toHaveCSS('opacity','0');
  await page.getByRole('button',{name:'会話を終える',exact:true}).click();
  await expect(page.locator('.scene-interaction')).not.toHaveClass(/conversation-focused/);
  await expect(page.locator('.wall-clock')).toHaveCSS('opacity','1');
});

test('reduced motion skips the conversation approach',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/settings');
  await choose(page,'利用者として体験（Premium）');
  await page.getByRole('button',{name:'窓に戻る',exact:true}).click();
  await page.getByRole('button',{name:'会話を始める',exact:true}).click();
  await expect(page.locator('.scene-interaction')).toHaveClass(/conversation-focused/);
  await expect(page.locator('.scene-interaction')).not.toHaveClass(/conversation-approaching/);
  await expect(page.locator('.character-sprite')).toHaveCSS('animation-name','none');
  await expect(page.locator('.blink-frame')).toHaveCSS('opacity','0');
  await expect(page.locator('.character-pose')).toHaveAttribute('src','/art/character-v2-idle.png');
});

test('walkthrough: conversation -> private candidate -> invite -> consent -> caregiver -> withdrawal',async({page})=>{
  await page.goto('/settings');
  await choose(page,'利用者として体験（Premium）');
  await page.getByRole('button',{name:'窓に戻る',exact:true}).click();
  await page.getByRole('button',{name:'会話を始める',exact:true}).click();
  await expect(page.getByText('お話を聞いています',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'「電球が切れた」と話す',exact:true}).click();
  await expect(page.locator('.scene')).toHaveClass(/state-speaking/);
  await expect.poll(() => page.locator('.mouth-frame').evaluate(node => getComputedStyle(node).opacity),{intervals:[50],timeout:2000}).toBe('1');
  await page.getByRole('button',{name:'お手伝いの候補を確認（1件）',exact:true}).click();
  await page.getByRole('button',{name:'候補を非公開で保存',exact:true}).click();
  await expect(page.getByText(/自分だけに表示/)).toBeVisible();
  await page.getByRole('button',{name:'招待コードを作る',exact:true}).click();
  const code=await page.getByRole('textbox',{name:'招待コード',exact:true}).inputValue();expect(code.length).toBe(48);
  await switchAccount(page,'招待する支援者として体験');
  await expect(page.getByText('共有されたお願いはありません。',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'招待コード',exact:true}).fill(code);
  await page.getByRole('button',{name:'招待を受ける',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'招待コード',exact:true})).toHaveValue('');
  await switchAccount(page,'利用者として体験（Premium）');
  await page.getByRole('checkbox',{name:'この内容だけを、招待済みの支援者に共有することに同意します',exact:true}).check();
  await page.getByRole('button',{name:'同意した内容を共有',exact:true}).click();
  await expect(page.getByText(/共有中 · 保存期限/)).toBeVisible();
  await switchAccount(page,'権限のない支援者として体験');
  await expect(page.getByText('共有されたお願いはありません。',{exact:true})).toBeVisible();
  await switchAccount(page,'招待する支援者として体験');
  await expect(page.getByRole('heading',{name:'電球の交換',exact:true})).toBeVisible();
  await page.screenshot({path:'/tmp/memory-window-caregiver.png',fullPage:true});
  await switchAccount(page,'利用者として体験（Premium）');
  await page.getByRole('button',{name:'共有を撤回',exact:true}).click();
  await expect(page.getByText(/自分だけに表示/)).toBeVisible();
  await switchAccount(page,'招待する支援者として体験');
  await expect(page.getByText('共有されたお願いはありません。',{exact:true})).toBeVisible();
});

test('Free denied -> mock checkout -> demo key -> conversation -> usage -> mock cancellation',async({page})=>{
  await page.goto('/settings');await choose(page,'無料プランを体験');
  await page.getByRole('button',{name:'窓に戻る',exact:true}).click();await page.getByRole('button',{name:'会話を始める',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Premiumプランが必要');
  await page.getByRole('button',{name:'無料プランの利用者 · 設定',exact:true}).click();
  await page.getByRole('button',{name:'Premiumを体験する（模擬決済）',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('実際の料金は発生していません');
  await page.getByRole('button',{name:'デモ用接続を登録',exact:true}).click();await expect(page.getByText('接続キーは登録済みです。内容は表示しません。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'窓に戻る',exact:true}).click();await page.getByRole('button',{name:'会話を始める',exact:true}).click();
  await expect(page.getByText('お話を聞いています',{exact:true})).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('memory-window:suspend')));
  await expect(page.getByRole('button',{name:'会話を始める',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'無料プランの利用者 · 設定',exact:true}).click();
  await expect(page.getByText('今日の予約済み利用枠 5 分 / 30 分',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'模擬プランを解約',exact:true}).click();await expect(page.getByRole('status')).toContainText('解約しました');
});

test('server refuses forged identity, real secret input, ownership attack and missing consent',async({request})=>{
  const login=async(identity:string)=>(await (await request.post('/api/demo/login',{data:{identity}})).json()).token as string;
  const owner=await login('owner');const other=await login('free');
  expect((await request.get('/api/state',{headers:{Authorization:'Bearer forged-token'}})).status()).toBe(401);
  const realKey=await request.post('/api/key',{headers:{Authorization:`Bearer ${owner}`},data:{key:'sk-synthetic-but-not-allowed-in-demo'}});expect(realKey.status()).toBe(400);
  const created=await request.post('/api/needs',{headers:{Authorization:`Bearer ${owner}`},data:{title:'お願い',description:'共有前の内容'}});const {id}=await created.json();
  expect((await request.delete('/api/needs',{headers:{Authorization:`Bearer ${other}`},data:{id}})).status()).toBe(404);
  expect((await request.post('/api/share',{headers:{Authorization:`Bearer ${owner}`},data:{id,consent:false,revision:1}})).status()).toBe(400);
  expect((await request.post('/api/voice',{headers:{Authorization:`Bearer ${other}`},data:{premium:true,userId:'demo-owner'}})).status()).toBe(403);
});

test('original television, radio and seasonal photos play locally and stop on suspension',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'テレビ',exact:true}).click();
  await page.getByRole('button',{name:'オリジナルのデモ素材を表示',exact:true}).click();
  await page.locator('video').evaluate(async element=>{await (element as HTMLVideoElement).play();});
  await expect.poll(()=>page.locator('video').evaluate(element=>(element as HTMLVideoElement).videoWidth)).toBe(640);
  await page.evaluate(()=>window.dispatchEvent(new Event('memory-window:suspend')));
  await expect.poll(()=>page.locator('video').evaluate(element=>(element as HTMLVideoElement).paused)).toBe(true);
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'ラジオ',exact:true}).click();
  await page.getByRole('button',{name:'オリジナルのデモ素材を表示',exact:true}).click();
  await page.locator('dialog audio').evaluate(async element=>{await (element as HTMLAudioElement).play();});
  await expect.poll(()=>page.locator('dialog audio').evaluate(element=>(element as HTMLAudioElement).paused)).toBe(false);
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.getByRole('button',{name:'写真',exact:true}).click();
  await page.getByRole('button',{name:'オリジナルのデモ素材を表示',exact:true}).click();
  await expect(page.locator('dialog img')).toHaveAttribute('src','/samples/spring.svg');
  await page.getByRole('button',{name:'次の写真',exact:true}).click();
  await expect(page.locator('dialog img')).toHaveAttribute('src','/samples/summer.svg');
});

test('visible reset clears demo data and allows a fresh account selection',async({page})=>{
  await page.goto('/settings');await choose(page,'利用者として体験（Premium）');
  await page.getByRole('button',{name:'デモの全データを初期化',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('初期化しました');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await choose(page,'無料プランを体験');
});
