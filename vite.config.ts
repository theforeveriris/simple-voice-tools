import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
  },
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      // SW 自动更新：新版本下载完成后下次加载生效
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'og-image.png'],
      manifest: {
        name: 'Simple Voice Tool',
        short_name: 'Simple Voice Tool',
        description: '基于 Web Audio API 的语音测试与分析工具：YIN 音高检测、LPC 共振峰提取、能量分析。',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FBF2F2',
        theme_color: '#FBF2F2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // 长按图标快捷入口：hash 深链直达历史 / 设置页（App 启动时解析 location.hash）
        shortcuts: [
          {
            name: '历史记录',
            short_name: '历史',
            url: './index.html#/history',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: '设置',
            short_name: '设置',
            url: './index.html#/settings',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // 系统分享入口：录音/语音文件「分享到」本应用后走离线分析管线
        // POST 由 public/sw-custom.js 拦截暂存并重定向回应用（?share-target=1）
        share_target: {
          action: './index.html?share-target=1',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'file',
                accept: ['audio/*', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.webm', '.amr', '.3gp'],
              },
            ],
          },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,md}'],
        navigateFallback: 'index.html',
        // Share Target 拦截（注册顺序先于 workbox 路由，POST 分享优先命中）
        importScripts: ['sw-custom.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
