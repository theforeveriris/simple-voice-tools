"""
安卓图标全套生成（与 scripts/generate-pwa-assets.py 同一设计语言）
运行：python scripts/generate-android-icons.py
输出到 android/app/src/main/res/：
  mipmap-*dpi/ic_launcher.png            遗留方形启动图标（48/72/96/144/192）
  mipmap-*dpi/ic_launcher_round.png      遗留圆形（0.94 缩放防切角）
  mipmap-*dpi/ic_launcher_foreground.png 自适应前景：声纹（66dp 安全区，0.62 缩放）
  mipmap-*dpi/ic_launcher_background.png 自适应背景：底色 + 角部光溢 + 散景
  mipmap-*dpi/ic_launcher_monochrome.png 主题图标层：白色声纹（M3 themed icons，
                                          Android 13+ 启动器按壁纸染色）
设计：深玫瑰底 #943450 + 右上柔光 + 散景光斑 + 7 条色调分级声纹（详见
generate-pwa-assets.py 顶部说明）。
"""

from PIL import Image, ImageDraw, ImageFilter
import os
import random

RES = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', 'android', 'app', 'src', 'main', 'res'))

S = 2048
BG = (148, 52, 80)
TONES = [(236, 172, 188), (208, 116, 140), (255, 222, 230)]
ENVELOPE = [0.26, 0.46, 0.36, 0.66, 0.52, 0.84, 0.42]
PALETTE = [(255, 205, 222), (255, 189, 168), (222, 184, 244), (255, 226, 236)]
WHITE = (255, 255, 255)
DENSITIES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
ADAPT = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}


def bg_canvas():
    """深玫瑰底 + 右上柔光 + 散景光斑 + 星点（无 bars）"""
    rng = random.Random(4)
    img = Image.new('RGBA', (S, S), BG + (255,))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = S * 0.82, S * 0.16
    gd.ellipse([gx - S * 0.34, gy - S * 0.34, gx + S * 0.34, gy + S * 0.34], fill=(255, 196, 200, 34))
    gd.ellipse([gx - S * 0.18, gy - S * 0.18, gx + S * 0.18, gy + S * 0.18], fill=(255, 214, 224, 30))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * 0.07)))
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for _ in range(9):
        x = rng.uniform(0.35, 0.96) * S
        y = rng.uniform(0.04, 0.66) * S
        r = rng.uniform(0.024, 0.085) * S
        ld.ellipse([x - r, y - r, x + r, y + r],
                   fill=rng.choice(PALETTE) + (int(rng.uniform(22, 56)),))
    img = Image.alpha_composite(img, layer.filter(ImageFilter.GaussianBlur(S * 0.017)))
    d = ImageDraw.Draw(img)
    for _ in range(5):
        x, y = rng.uniform(0.4, 0.9) * S, rng.uniform(0.06, 0.6) * S
        r = rng.uniform(0.0035, 0.007) * S
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 235, 242, int(rng.uniform(90, 160))))
    return img


def bars_layer(scale=1.0, color_by_height=True):
    """透明画布上的声纹条；color_by_height=False 时全白（monochrome 层）"""
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bw = S * 0.062
    gap = S * 0.040
    n = len(ENVELOPE)
    total = n * bw + (n - 1) * gap
    x0 = (S - total) / 2
    cy = S / 2
    for i in range(n):
        h = S * ENVELOPE[i]
        hf = ENVELOPE[i]
        c = WHITE if not color_by_height else (
            TONES[0] if hf < 0.35 else TONES[1] if hf < 0.62 else TONES[2])
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, cy - h / 2, x + bw, cy + h / 2], radius=bw / 2, fill=c + (255,))
    if scale != 1.0:
        ns = int(S * scale)
        small = layer.resize((ns, ns), Image.LANCZOS)
        layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        layer.paste(small, ((S - ns) // 2, (S - ns) // 2))
    return layer


def compose(bars_scale=1.0):
    return Image.alpha_composite(bg_canvas(), bars_layer(bars_scale))


def round_crop(img):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, img.size[0], img.size[1]], fill=255)
    out = img.convert('RGBA')
    out.putalpha(mask)
    return out


def save_png(img, size, rel):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert('RGB').resize((size, size), Image.LANCZOS).save(path)
    print('saved', rel, size)


def save_rgba(img, size, rel):
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(path)
    print('saved', rel, size)


def main():
    for d, size in DENSITIES.items():
        save_png(compose(1.0), size, f'mipmap-{d}/ic_launcher.png')
        save_rgba(round_crop(compose(0.94)), size, f'mipmap-{d}/ic_launcher_round.png')
    bg_only = bg_canvas()
    fg = bars_layer(0.62)
    mono = bars_layer(0.62, color_by_height=False)
    for d, size in ADAPT.items():
        save_png(bg_only, size, f'mipmap-{d}/ic_launcher_background.png')
        save_rgba(fg, size, f'mipmap-{d}/ic_launcher_foreground.png')
        save_rgba(mono, size, f'mipmap-{d}/ic_launcher_monochrome.png')
    print('ALL DONE')


if __name__ == '__main__':
    main()
