#!/usr/bin/env python3
"""Render a 1080x1920 TikTok cut of a real QAIQ run. Pillow + bundled ffmpeg.

  venv/bin/python demo/render-tiktok.py demo/qaiq-tiktok.mp4
"""
import subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
SANS  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANSB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO  = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONOB = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

BG, INK, DIM = "#15161e", "#c0caf5", "#565f89"
GREEN, YELLOW, RED = "#9ece6a", "#e0af68", "#f7768e"
CYAN, MAGENTA = "#7dcfff", "#bb9af7"

F = lambda p, s: ImageFont.truetype(p, s)

def card(lines, size=76, color=INK, font=SANSB, accent=None, accent_size=40):
    """Full-bleed text card, vertically centred."""
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    f = F(font, size)
    wrapped = []
    for ln in lines:
        wrapped += textwrap.wrap(ln, width=max(10, int(W / (size * 0.56)))) or [""]
    lh = int(size * 1.34)
    y = (H - len(wrapped) * lh) // 2
    for ln in wrapped:
        d.text((W // 2, y), ln, font=f, fill=color, anchor="ma")
        y += lh
    if accent:
        fa = F(SANS, accent_size)
        # shrink until the longest line fits inside the frame with a margin
        parts = accent.split(" \u00b7 ")
        while any(fa.getlength(t) > W - 120 for t in parts) and accent_size > 18:
            accent_size -= 2
            fa = F(SANS, accent_size)
        ay = H - 200 - (len(parts) - 1) * int(accent_size * 1.4)
        for t in parts:
            d.text((W // 2, ay), t, font=fa, fill=DIM, anchor="ma")
            ay += int(accent_size * 1.4)
    return img

def term(lines, size=30, title="qaiq", highlight=None):
    """Terminal panel, centred, large enough to read on a phone."""
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    fm, fb = F(MONO, size), F(MONOB, size)
    cw = fm.getlength("M"); lh = int(size * 1.5)
    pw = W - 80
    ph = len(lines) * lh + 120
    x0, y0 = 40, (H - ph) // 2
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], 22, fill="#1a1b26")
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + 54], 22, fill="#1f2130")
    for i, c in enumerate((RED, YELLOW, GREEN)):
        d.ellipse([x0 + 26 + i * 30, y0 + 20, x0 + 26 + i * 30 + 15, y0 + 35], fill=c)
    d.text((x0 + pw // 2, y0 + 14), title, font=fm, fill=DIM, anchor="ma")
    y = y0 + 86
    for ln, col, bold in lines:
        d.text((x0 + 34, y), ln, font=(fb if bold else fm), fill=col)
        y += lh
    if highlight:
        hy = y0 + 86 + highlight * lh - 8
        d.rounded_rectangle([x0 + 18, hy, x0 + pw - 18, hy + lh], 8,
                            outline=MAGENTA, width=3)
    return img

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "demo/qaiq-tiktok.mp4"
    scenes = []

    scenes.append((card(["I built a QA tool", "that REFUSES to say", "your tests are fine."],
                        size=82), 2.6))
    scenes.append((card(["No “pass” field.", "No “approved”.", "No green light."],
                        size=88, color=RED), 2.2))
    scenes.append((card(["An AI agent cannot", "tell you the tests", "are OK — because the",
                         "schema has no word", "for OK."], size=58, color=INK), 3.0))

    score = [("$ npx @rafaellabarrocas/qaiq .", GREEN, True), ("", INK, False),
             ("  Hygiene Score  58/100", INK, True), ("", INK, False),
             ("  Wait discipline     █████████░  92", GREEN, False),
             ("  Locator quality     ██████░░░░  63", YELLOW, False),
             ("  Test isolation      ███████░░░  66", YELLOW, False),
             ("  Assertion strength  ████░░░░░░  38", RED, False),
             ("  CI hygiene          ███░░░░░░░  34", RED, False)]
    scenes.append((term(score, size=30), 4.0))

    finds = [("  FINDINGS (19)", YELLOW, True),
             ("   WAIT-001  Hardcoded wait", INK, False),
             ("   LOC-001   CSS selector, not a role", INK, False),
             ("   LOC-002   Positional selector", INK, False),
             ("   ISO-001   Shared state across tests", INK, False),
             ("   ASR-001   Test with no assertion", INK, False),
             ("   CI-002    Retries hiding a real race", INK, False)]
    scenes.append((term(finds, size=30), 3.6))

    nm = [("  NOT MEASURED — these need a human", CYAN, True), ("", INK, False),
          ("   · whether you tested", DIM, False),
          ("     the right things", DIM, False),
          ("   · whether your assertions", DIM, False),
          ("     match real intent", DIM, False),
          ("   · whether this is", DIM, False),
          ("     safe to release", DIM, False)]
    scenes.append((term(nm, size=32), 4.2))

    scenes.append((card(["It tells you what", "it did NOT measure.", "Every single time.",
                         "Even at 100."], size=68, color=CYAN), 3.0))
    scenes.append((card(["It critiques", "what your agent writes.", "",
                         "It will not", "write it for you."], size=66), 3.0))
    scenes.append((card(["npx", "@rafaellabarrocas/qaiq"], size=54, color=GREEN,
                        accent="open source · Apache-2.0 · github.com/rafaellabarrocas/qaiq"), 3.2))

    ff = open("/tmp/claude-1000/-home-rafaella-Personal/baa2297b-6d15-4da9-befd-ccbbdd397b64/scratchpad/ffmpeg-path.txt").read().strip()
    p = subprocess.Popen(
        [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
         "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "faststart", out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    total = 0
    for img, secs in scenes:
        raw = img.tobytes()
        for _ in range(int(secs * FPS)):
            p.stdin.write(raw); total += 1
    p.stdin.close(); p.wait()
    print(f"{out}  {W}x{H}  {total/FPS:.1f}s  {total} frames")

main()
