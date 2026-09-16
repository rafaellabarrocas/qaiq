#!/usr/bin/env python3
"""Render a 1080x1920 vertical cut of a real QAIQ run.

Visual language follows omarchy.org: deep near-black ground, monospace
throughout, hairline white-alpha borders, restrained Tokyo Night accents,
generous negative space, cross-fades rather than hard cuts.
"""
import subprocess, sys, textwrap, os
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
SCRATCH = "/tmp/claude-1000/-home-rafaella-Personal/baa2297b-6d15-4da9-befd-ccbbdd397b64/scratchpad"
FD = f"{SCRATCH}/fonts/fonts/ttf"
REG, MED, BLD, XBD = (f"{FD}/JetBrainsMono-{w}.ttf" for w in
                      ("Regular", "Medium", "Bold", "ExtraBold"))

BG       = (12, 14, 16)        # #0c0e10
SURFACE  = (22, 25, 28)
HAIRLINE = (255, 255, 255, 36) # #ffffff24
TEXT     = "#ffffff"
MUTED    = "#8b949e"
FAINT    = "#4d545c"
CYAN     = "#7dcfff"
ORANGE   = "#ff9e64"
GREEN    = "#9ece6a"
RED      = "#f7768e"

F = lambda p, s: ImageFont.truetype(p, s)

def base():
    """Deep ground with a barely-there vertical lift for depth."""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for y in range(0, H, 4):
        t = 1 - abs((y / H) - 0.42) * 1.5
        if t > 0:
            v = int(7 * t)
            d.rectangle([0, y, W, y + 4], fill=(BG[0] + v, BG[1] + v, BG[2] + v))
    return img

def statement(lines, size=76, color=TEXT, font=BLD, kicker=None, foot=None):
    img = base(); d = ImageDraw.Draw(img)
    f = F(font, size)
    wrapped = []
    for ln in lines:
        wrapped += textwrap.wrap(ln, width=max(8, int(W / (size * 0.62)))) or [""]
    lh = int(size * 1.42)
    y = (H - len(wrapped) * lh) // 2
    if kicker:
        fk = F(MED, 30)
        d.text((W // 2, y - 96), kicker.upper(), font=fk, fill=FAINT, anchor="ma")
    for ln in wrapped:
        d.text((W // 2, y), ln, font=f, fill=color, anchor="ma")
        y += lh
    if foot:
        ff = F(REG, 28)
        fy = H - 190
        for t in foot:
            d.text((W // 2, fy), t, font=ff, fill=FAINT, anchor="ma")
            fy += 42
    return img

def panel(rows, size=34, title="qaiq", kicker=None):
    img = base()
    lh = int(size * 1.62)
    pw = W - 96
    ph = len(rows) * lh + 132
    x0, y0 = 48, (H - ph) // 2 + 30
    card = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, pw - 1, ph - 1], 20, fill=SURFACE + (255,), outline=HAIRLINE, width=2)
    cd.line([(1, 62), (pw - 2, 62)], fill=HAIRLINE, width=2)
    fm, fb = F(REG, size), F(BLD, size)
    for i, c in enumerate((RED, ORANGE, GREEN)):
        cd.ellipse([30 + i * 32, 24, 30 + i * 32 + 15, 39], fill=c)
    cd.text((pw // 2, 20), title, font=F(MED, 26), fill=FAINT, anchor="ma")
    y = 96
    for txt, col, bold in rows:
        cd.text((38, y), txt, font=(fb if bold else fm), fill=col)
        y += lh
    img.paste(card, (x0, y0), card)
    if kicker:
        d = ImageDraw.Draw(img)
        d.text((W // 2, y0 - 108), kicker.upper(), font=F(MED, 30), fill=FAINT, anchor="ma")
    return img

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "demo/qaiq-tiktok.mp4"
    S = []  # (image, hold_seconds)

    S.append((statement(["A QA tool", "that refuses", "to say your tests", "are fine."],
                        size=82, kicker="open source"), 2.8))
    S.append((statement(["no pass", "no approved", "no green light"],
                        size=76, color=RED, font=MED), 2.4))
    S.append((statement(["An agent cannot", "read it as OK", "— the schema has", "no word for OK."],
                        size=58, color=TEXT, font=MED), 2.8))

    S.append((panel([("$ npx @rafaellabarrocas/qaiq .", GREEN, True), ("", TEXT, False),
                     ("  Hygiene Score  58/100", TEXT, True), ("", TEXT, False),
                     ("  Wait discipline     █████████░  92", GREEN, False),
                     ("  Locator quality     ██████░░░░  63", ORANGE, False),
                     ("  Test isolation      ███████░░░  66", ORANGE, False),
                     ("  Assertion strength  ████░░░░░░  38", RED, False),
                     ("  CI hygiene          ███░░░░░░░  34", RED, False)],
                    kicker="a real run"), 4.2))

    S.append((panel([("  FINDINGS (19)", ORANGE, True), ("", TEXT, False),
                     ("   WAIT-001  hardcoded wait", MUTED, False),
                     ("   LOC-001   css, not a role", MUTED, False),
                     ("   ISO-001   shared state", MUTED, False),
                     ("   ASR-001   no assertion", MUTED, False),
                     ("   CI-002    retries hiding a race", MUTED, False)],
                    kicker="what it found"), 3.6))

    S.append((panel([("  NOT MEASURED", CYAN, True),
                     ("  these need a human", CYAN, False), ("", TEXT, False),
                     ("   · did you test", MUTED, False),
                     ("     the right things", MUTED, False),
                     ("   · do assertions match", MUTED, False),
                     ("     real intent", MUTED, False),
                     ("   · is this safe", MUTED, False),
                     ("     to release", MUTED, False)],
                    kicker="and what it won't"), 4.4))

    S.append((statement(["It tells you", "what it did not", "measure.", "", "Every time."],
                        size=66, color=CYAN, font=MED), 3.0))
    S.append((statement(["It critiques", "what your agent", "writes.", "",
                         "It will not write it", "for you."], size=54, font=MED), 3.0))
    S.append((statement(["npx", "@rafaellabarrocas/qaiq"], size=52, color=GREEN,
                        foot=["apache-2.0", "github.com/rafaellabarrocas/qaiq"]), 3.4))

    ff = open(f"{SCRATCH}/ffmpeg-path.txt").read().strip()
    p = subprocess.Popen(
        [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
         "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "faststart", out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    FADE = 9  # frames of cross-dissolve between scenes
    total = 0
    for i, (img, secs) in enumerate(S):
        hold = int(secs * FPS) - (FADE if i else 0)
        raw = img.tobytes()
        for _ in range(hold):
            p.stdin.write(raw); total += 1
        if i + 1 < len(S):
            nxt = S[i + 1][0]
            for f in range(FADE):
                p.stdin.write(Image.blend(img, nxt, (f + 1) / (FADE + 1)).tobytes())
                total += 1
    p.stdin.close(); p.wait()
    print(f"{out}  {W}x{H}  {total/FPS:.1f}s  {total} frames  "
          f"{os.path.getsize(out)/1024:.0f} KB")

main()
