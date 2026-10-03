"""
Tauri 桌面图标生成（与 app 图标同一设计：深玫瑰底 + 角部光溢 + 7 条声纹）
运行：python scripts/generate-tauri-icons.py
输出到 src-tauri/icons/：icon.ico（16-256 多尺寸）/ 32x32.png / 128x128.png /
128x128@2x.png / icon.png（1024）。桌面图标为 22% 圆角磁贴 + 透明四角。
"""

from PIL import Image, ImageDraw, ImageFilter
import os
import random

S = 1024
OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                        '..', 'src-tauri', 'icons'))

BG = (148, 52, 80)
TONES = [(236, 172, 188), (208, 116, 140), (255, 222, 230)]
ENVELOPE = [0.26, 0.46, 0.36, 0.66, 0.52, 0.84, 0.42]
PALETTE = [(255, 205, 222), (255, 189, 168), (222, 184, 244), (255, 226, 236)]


def bg_canvas(w, h, seed=4):
    rng = random.Random(seed)
    img = Image.new('RGBA', (w, h), BG + (255,))
    unit = min(w, h)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gx, gy = w * 0.82, h * 0.16
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
    d = ImageDraw.Draw(img)
    bw = unit * 0.062
    gap = unit * 0.040
    n = len(ENVELOPE)
    total = n * bw + (n - 1) * gap
    x0 = (img.size[0] - total) / 2
    cy = img.size[1] / 2
    for i in range(n):
        h = unit * ENVELOPE[i]
        hf = ENVELOPE[i]
        c = TONES[0] if hf < 0.35 else TONES[1] if hf < 0.62 else TONES[2]
        x = x0 + i * (bw + gap)
        d.rounded_rectangle([x, cy - h / 2, x + bw, cy + h / 2], radius=bw / 2, fill=c)
    return img


def rounded_tile():
    img = draw_bars(bg_canvas(S, S), S)
    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=255)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(img.convert('RGB'), (0, 0), mask)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    tile = rounded_tile()
    # ico：多尺寸嵌入
    tile.resize((256, 256), Image.LANCZOS).save(
        os.path.join(OUT_DIR, 'icon.ico'),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    for name, size in [('32x32.png', 32), ('128x128.png', 128), ('128x128@2x.png', 256), ('icon.png', 1024)]:
        tile.resize((size, size), Image.LANCZOS).save(os.path.join(OUT_DIR, name))
    print('generated:', ', '.join(sorted(os.listdir(OUT_DIR))))


if __name__ == '__main__':
    main()
