/**
 * 通用文件辅助
 * 下载触发与音频 MIME 映射（JSON/CSV 导出、ZIP 备份、GitHub 备份共用）
 */

/** 下载任意 Blob（a[download] 触发） */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // 挂到文档再点击：部分浏览器（Firefox / Safari）对游离节点会取消下载
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立即 revoke 会让同上的浏览器来不及取到数据，延后释放
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 音频文件名 → MIME（备份恢复时按扩展名重建 Blob） */
export function audioMimeOf(name: string): string {
  if (name.endsWith('.webm')) return 'audio/webm';
  if (name.endsWith('.m4a')) return 'audio/mp4';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}
