"""
PWA / OGP 图片资源生成脚本（当前定稿设计：M3 声纹 + 角部光溢）
运行：python scripts/generate-pwa-assets.py
输出到 public/：
  icon-192.png / icon-512.png   常规安装图标（22% 圆角、透明四角）
  maskable-512.png              maskable 图标（全出血，声纹缩至 80% 安全区）
  og-image.png                  1200x630 社交分享图（OGP）
视觉：深玫瑰底（#943450）+ 右上柔光 + 玫瑰/蜜桃/丁香散景光斑 + 星点，
      7 根圆头声纹条不对称包络向右扬起，条色按高度三级分级（莫奈 hue 15 玫瑰系）。
      安卓自适应图标（mipmap 前景/背景层）为同一设计的位图，已直接入库；
      本脚本只负责 public/ 下的 Web 资产。
"""

from PIL import Image, ImageDraw, ImageFilter
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')

BG = (148, 52, 80)      # #943450 深玫瑰
TONES = [(236, 172, 188), (208, 116, 140), (255, 222, 230)]  # 短/中/高 三级
ENVELOPE = [0.26, 0.46, 0.36, 0.66, 0.52, 0.84, 0.42]
PALETTE = [(255, 205, 222), (255, 189, 168), (222, 184, 244), (255, 226, 236)]
GLOW_AT = (0.82, 0.16)  # 柔光中心（画布比例）


def bg_canvas(w, h, seed=4):
    """深玫瑰底 + 右上柔光 + 散景光斑 + 星点"""
    rng = random.Random(seed)
    img = Image.new('RGBA', (w, h), BG + (255,))
    unit = min(w, h)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = w * GLOW_AT[0], h * GLOW_AT[1]
    gd.ellipse([gx - unit * 0.34, gy - unit * 0.34, gx + unit * 0.34, gy + unit * 0.34],
               fill=(255, 196, 200, 34))
    gd.ellipse([gx - unit * 0.18, gy - unit * 0.18, gx + unit * 0.18, gy + unit * 0.18],
               fill=(255, 214, 224, 30))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(unit * 0.07)))
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for _ in range(9):
        x = rng.uniform(0.35, 0.96) * w
        y = rng.uniform(0.04, 0.66) * h
        r = rng.uniform(0.024, 0.085) * unit
        ld.ellipse([x - r, y - r, x + r, y + r],
                   fill=rng.choice(PALETTE) + (int(rng.uniform(22, 56)),))
    img = Image.alpha_composite(img, layer.filter(ImageFilter.GaussianBlur(unit * 0.017)))
    d = ImageDraw.Draw(img)
    for _ in range(5):
        x, y = rng.uniform(0.4, 0.9) * w, rng.uniform(0.06, 0.6) * h
        r = rng.uniform(0.0035, 0.007) * unit
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 235, 242, int(rng.uniform(90, 160))))
    return img


def draw_bars(img, unit):
    """声纹条：总宽 0.674*unit，居中；高度包络 × unit，色按高度分级"""
    d = ImageDraw.Draw(img)
    bw = unit * 0.062
    gap = unit * 0.040
    n = len(ENVELOPE)
    total = n * bw + (n - 1) * gap
    x0 = (img.size[0] - total) / 2
    cy = img.size[1] / 2
    for i in range(n):
        h = unit * ENVELOPE[i]
        c = TONES[0] if ENVELOPE[i] < 0.35 else TONES[1] if ENVELOPE[i] < 0.62 else TONES[2]
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, cy - h / 2, x + bw, cy + h / 2], radius=bw / 2, fill=c)
    return img


def master_icon():
    """2048 主渲染：满幅底 + 声纹"""
    s = 2048
    return draw_bars(bg_canvas(s, s), s)


def rounded(img, radius_frac=0.22):
    """圆角遮罩（透明四角）"""
    size = img.size[0]
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=int(size * radius_frac), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img.convert('RGB'), (0, 0), mask)
    return out


def make_icon(size):
    """常规图标：圆角 + 透明四角"""
    return rounded(master_icon().resize((size, size), Image.LANCZOS))


def make_maskable(size):
    """maskable：全出血，声纹缩进 80% 安全区（最远点 0.481 → 缩 0.82）"""
    img = bg_canvas(size, size)
    big = size * 2
    bars = draw_bars(Image.new('RGBA', (big, big), (0, 0, 0, 0)), big)
    ns = int(big * 0.82)
    small = bars.resize((ns, ns), Image.LANCZOS)
    bars = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    bars.paste(small, ((big - ns) // 2, (big - ns) // 2))
    return Image.alpha_composite(img, bars.resize((size, size), Image.LANCZOS))


def make_og():
    """1200x630 社交分享图：同设计横幅化（unit = 高）"""
    w, h = 1200, 630
    img = bg_canvas(w, h)
    return draw_bars(img, h).convert('RGB')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_icon(192).save(os.path.join(OUT, 'icon-192.png'))
    make_icon(512).save(os.path.join(OUT, 'icon-512.png'))
    make_maskable(512).save(os.path.join(OUT, 'maskable-512.png'))
    make_og().save(os.path.join(OUT, 'og-image.png'))
    print('generated:', ', '.join(sorted(os.listdir(OUT))))
