import {test,expect} from '@playwright/test';

test('large window and fullscreen remain accessible',async({page})=>{
  await page.goto('/');
  const bounds=await page.locator('.scene').boundingBox();
  expect(bounds).not.toBeNull();expect(bounds!.width).toBeGreaterThan(900);
  await page.getByRole('button',{name:'全画面で表示'}).click();
  await expect(page.getByRole('button',{name:'全画面を終了'})).toBeVisible();
  await expect(page.getByRole('button',{name:/窓をノック/})).toBeVisible();
  await page.getByRole('button',{name:'全画面を終了'}).click();
  await expect(page.getByRole('button',{name:'全画面で表示'})).toBeVisible();
});

test('weather stays off until chosen and demo scenes are clearly labeled',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.scene')).toHaveClass(/weather-unknown/);
  await page.getByText('外の天候',{exact:true}).click();
  await page.getByRole('button',{name:'雨を試す',exact:true}).click();
  await expect(page.locator('.scene')).toHaveClass(/weather-rainy/);
  await expect(page.locator('.weather-art')).toHaveAttribute('src','/art/weather-rainy.png');
  expect(await page.locator('.room-art mask path').count()).toBe(2);
  expect(await page.locator('.outdoor-weather').evaluate(node => getComputedStyle(node).zIndex)).toBe('0');
  expect(await page.locator('.room-art').evaluate(node => getComputedStyle(node).zIndex)).toBe('1');
  await expect(page.getByText('模擬天候 · 雨（模擬）',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'天候連動を停止'}).click();
  await expect(page.locator('.scene')).toHaveClass(/weather-unknown/);
});

test('manual location search requests weather only after selecting a result',async({page})=>{
  let weatherCalls=0;
  await page.route('https://geocoding-api.open-meteo.com/**',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({results:[{name:'東京',latitude:35.68,longitude:139.69}]})}));
  await page.route('https://api.open-meteo.com/**',route=>{weatherCalls++;return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({current:{weather_code:71}})});});
  await page.goto('/');await page.getByText('外の天候',{exact:true}).click();
  await page.getByPlaceholder('例：東京').fill('東京');await page.getByRole('button',{name:'地域を検索'}).click();
  await expect(page.getByRole('button',{name:'東京',exact:true})).toBeVisible();expect(weatherCalls).toBe(0);
  await page.getByRole('button',{name:'東京',exact:true}).click();
  await expect(page.locator('.scene')).toHaveClass(/weather-snowy/);expect(weatherCalls).toBe(1);
});

test('current location is requested only after user action and coordinates are coarse',async({page,context})=>{
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:35.6812,longitude:139.7671});
  const sent:string[]=[];
  await page.route('https://api.open-meteo.com/**',route=>{sent.push(route.request().url());return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({current:{weather_code:3}})});});
  await page.goto('/');expect(sent).toHaveLength(0);
  await page.getByText('外の天候',{exact:true}).click();expect(sent).toHaveLength(0);
  await page.getByRole('button',{name:'現在地の天候を表示'}).click();
  await expect(page.locator('.scene')).toHaveClass(/weather-cloudy/);
  expect(sent).toHaveLength(1);const url=new URL(sent[0]);
  expect(url.searchParams.get('latitude')).toBe('35.7');expect(url.searchParams.get('longitude')).toBe('139.8');
});
