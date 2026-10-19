import { defineConfig } from '@playwright/test';

/**
 * E2E 冒烟测试配置
 * 用 Chromium + 假麦克风（--use-fake-device-for-media-capture）跑核心链路；
 * webServer 用 vite dev（源码服务，免构建；CI 上可换 vite preview）。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-capture',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    // 断言默认超时收紧
    actionTimeout: 10_000,
    // 时区钉死：快照里的日期/时间串必须跨机器、跨环境稳定（CI 与本地一致）
    timezoneId: 'Asia/Shanghai',
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    port: 5199,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
