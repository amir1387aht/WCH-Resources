"""Generate desktop/icon.ico (chip glyph, navy + amber). Needs Pillow: pip install pillow"""
import os
from PIL import Image, ImageDraw

S = 1024  # draw large, downscale for each icon size


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # rounded-square background with a vertical navy gradient
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    top, bot = (22, 58, 92), (8, 22, 38)
    for y in range(S):
        gd.line([(0, y), (S, y)], fill=lerp(top, bot, y / S) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=200, fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)

    amber, pin, body, edge = (240, 178, 74, 255), (200, 214, 226, 255), (17, 30, 44, 255), (62, 110, 150, 255)
    # pins on four sides
    c0, c1 = 300, S - 300
    n, pw, pl = 5, 34, 92
    for i in range(n):
        p = c0 + 40 + i * ((c1 - c0 - 80) / (n - 1))
        d.rounded_rectangle([p - pw / 2, c0 - pl, p + pw / 2, c0 + 10], 10, fill=pin)
        d.rounded_rectangle([p - pw / 2, c1 - 10, p + pw / 2, c1 + pl], 10, fill=pin)
        d.rounded_rectangle([c0 - pl, p - pw / 2, c0 + 10, p + pw / 2], 10, fill=pin)
        d.rounded_rectangle([c1 - 10, p - pw / 2, c1 + pl, p + pw / 2], 10, fill=pin)
    # chip body
    d.rounded_rectangle([c0, c0, c1, c1], 48, fill=body, outline=edge, width=14)
    # pin-1 dot and a "W" made of strokes (WCH) in amber
    d.ellipse([c0 + 40, c0 + 40, c0 + 92, c0 + 92], fill=amber)
    w = [(390, 440), (450, 610), (512, 480), (574, 610), (634, 440)]
    d.line(w, fill=amber, width=44, joint="curve")
    for x, y in (w[0], w[-1]):
        d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=amber)
    return img


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icon.ico")
    big = draw()
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    big.resize((256, 256), Image.LANCZOS).save(out, sizes=sizes)
    print("wrote", out)
