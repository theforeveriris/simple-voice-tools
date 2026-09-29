"""
PWA / OGP 图片资源生成脚本
运行：python scripts/generate-pwa-assets.py
输出到 public/：
  icon-192.png / icon-512.png   常规安装图标（圆角、透明四角）
  maskable-512.png              maskable 图标（全出血，内容居安全区）
  og-image.png                  1200x630 社交分享图（OGP）
视觉：山桃红渐变底 + 白色声波柱（与应用内主题色一致，hue 15）
"""

from PIL import Image, ImageDraw
import os

TOP = (179, 58, 80)    # #B33A50
BOT = (142, 39, 64)    # #8E2740
WHITE = (255, 250, 250)

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')


def gradient(size, top=TOP, bot=BOT):
    """垂直渐变底图（RGB）"""
    w, h = size
    img = Image.new('RGB', size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
        d.line([(0, y), (w - 1, y)], fill=c)
    return img


def draw_bars(img, heights, bar_w, gap, color=WHITE):
    """在图片中央绘制白色声波柱（圆角柱），heights 为相对高度（0-1）"""
    w, h = img.size
    d = ImageDraw.Draw(img, 'RGBA')
    n = len(heights)
    total = n * bar_w + (n - 1) * gap
    x = (w - total) / 2
    cy = h / 2
    for hf in heights:
        bh = h * hf
        y0, y1 = cy - bh / 2, cy + bh / 2
        d.rounded_rectangle([x, y0, x + bar_w, y1], radius=bar_w / 2, fill=color + (255,))
        x += bar_w + gap


def make_icon(size, maskable=False):
    """生成方形图标。常规：圆角 + 透明四角；maskable：全出血，柱形缩至安全区"""
    ss = size * 2  # 2x 超采样抗锯齿
    img = gradient((ss, ss))
    if maskable:
        draw_bars(img, [0.20, 0.33, 0.44, 0.33, 0.20], ss * 0.072, ss * 0.052)
        img = img.resize((size, size), Image.LANCZOS)
    else:
        draw_bars(img, [0.26, 0.46, 0.64, 0.46, 0.26], ss * 0.075, ss * 0.055)
        img = img.resize((size, size), Image.LANCZOS)
        # 圆角遮罩（透明四角）
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img.convert('RGBA')


def make_og():
    """1200x630 社交分享图"""
    size = (1200, 630)
    img = gradient(size)
    draw_bars(img, [0.24, 0.42, 0.58, 0.42, 0.24], 62, 46)
    return img.convert('RGBA')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_icon(192).save(os.path.join(OUT, 'icon-192.png'))
    make_icon(512).save(os.path.join(OUT, 'icon-512.png'))
    make_icon(512, maskable=True).save(os.path.join(OUT, 'maskable-512.png'))
    make_og().save(os.path.join(OUT, 'og-image.png'))
    print('generated:', ', '.join(sorted(os.listdir(OUT))))
