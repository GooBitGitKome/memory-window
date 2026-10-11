import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, workers: 1,
  use: {headless:true},
  projects: [
    {name:'web',testIgnore:['**/demo.spec.ts','**/weather-window.spec.ts'],use:{baseURL:'http://127.0.0.1:4173'}},
    {name:'demo',testMatch:['**/demo.spec.ts','**/weather-window.spec.ts'],use:{baseURL:'http://127.0.0.1:4174'}},
  ],
  webServer: [
    {command:'npm run preview -w @memory-window/web -- --host 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:false},
    {command:'npm run demo:serve',url:'http://127.0.0.1:4174',reuseExistingServer:false},
  ],
});
