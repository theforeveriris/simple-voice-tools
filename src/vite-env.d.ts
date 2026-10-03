/// <reference types="vite/client" />

/** 构建时由 vite define 注入（vite.config.ts 读取 package.json） */
declare const __APP_VERSION__: string;
/** 构建日期（ISO，取自构建时刻） */
declare const __BUILD_DATE__: string;
/** 构建时间戳（毫秒，与产物 version.json 的 builtAt 同源同值；检查更新比对用） */
declare const __BUILD_AT__: number;
