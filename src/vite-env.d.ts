/// <reference types="vite/client" />

/** 构建时由 vite define 注入（vite.config.ts 读取 package.json） */
declare const __APP_VERSION__: string;
/** 构建日期（ISO，取自构建时刻） */
declare const __BUILD_DATE__: string;
