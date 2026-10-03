#!/usr/bin/env python3
"""Render a 1080x1920 vertical cut of four real QAIQ runs: three attempts to
game the score, and the one that worked.

Every number on screen comes from a real run captured to
$SCRATCH/runs/*.txt — nothing here is mocked. Visual language matches
render-screencast.py / render-tiktok.py: deep near-black ground, monospace
throughout, hairline borders, restrained Tokyo Night accents.
"""
import os
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
FS = 29

SCRATCH = os.environ.get(
    "QAIQ_SCRATCH",
    "/tmp/claude-1000/-home-rafaella-Work-personal-qaiq/"
    "36c37c77-22de-4b2a-a2a6-9af18381d660/scratchpad",
)
FD = f"{SCRATCH}/fonts/fonts/ttf"
REG, MED, BLD, XBD = (
    f"{FD}/JetBrainsMono-{w}.ttf" for w in ("Regular", "Medium", "Bold", "ExtraBold")
)
RUNS = f"{SCRATCH}/runs"

BG, SURF = (12, 14, 16), (18, 21, 24)
HAIR = (255, 255, 255, 30)
TEXT, MUTED, FAINT = "#e6edf3", "#8b949e", "#4d545c"
CYAN, ORANGE, GREEN, RED, MAG = "#7dcfff", "#ff9e64", "#9ece6a", "#f7768e", "#bb9af7"

fr = ImageFont.truetype(REG, FS)
fb = ImageFont.truetype(BLD, FS)
CW = fr.getlength("M")
LH = int(FS * 1.5)
PAD_X, TOP = 34, 180
CARD_W, CARD_H = W - 56, H - 360
COLS = int((CARD_W - PAD_X * 2 - 8) / CW)

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


def statement(lines, size=74, color=TEXT, font=BLD, kicker=None, foot=None):
    img = base()
    d = ImageDraw.Draw(img)
    f = F(font, size)
    wrapped = []
    for ln in lines:
        wrapped += textwrap.wrap(ln, width=max(8, int(W / (size * 0.62)))) or [""]
    lh = int(size * 1.42)
    y = (H - len(wrapped) * lh) // 2
    if kicker:
        d.text((W // 2, y - 104), kicker.upper(), font=F(MED, 30), fill=FAINT, anchor="ma")
    for ln in wrapped:
        d.text((W // 2, y), ln, font=f, fill=color, anchor="ma")
        y += lh
    if foot:
        fy = H - 200
        for t in foot:
            d.text((W // 2, fy), t, font=F(REG, 28), fill=FAINT, anchor="ma")
            fy += 42
    return img


def colour(s):
    t = s.strip()
    if t.startswith("Hygiene Score"):
        return TEXT, True
    if t.startswith("FINDINGS"):
        return ORANGE, True
    if "SUP-001" in t:
        return RED, False
    if "n/a" in t:
        return CYAN, False
    if "█" in s or "░" in s:
        try:
            return (GREEN if int(t.split()[-1]) >= 85 else ORANGE if int(t.split()[-1]) >= 60 else RED), False
        except Exception:
            return TEXT, False
    return MUTED, False


def terminal(visible, typed, cursor=False, badge=None, badge_col=ORANGE, rows=None,
             reserve=False):
    """One terminal frame: chrome, the typed command, then output lines.

    The card is sized to its content (``rows`` pins a height so a streaming
    sequence does not resize frame to frame) and the whole composition —
    card plus optional badge — is centred vertically.
    """
    img = base()
    n_rows = rows if rows is not None else len(visible)
    body_h = 96 + LH * len(typed) + int(LH * 0.4) + LH * n_rows + 40
    card_h = max(260, body_h)
    badge_h = 156 if (badge or reserve) else 0
    top = max(120, (H - card_h - badge_h) // 2)

    card = Image.new("RGBA", (CARD_W, card_h), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, CARD_W - 1, card_h - 1], 20, fill=SURF + (255,), outline=HAIR, width=2)
    cd.line([(1, 64), (CARD_W - 2, 64)], fill=HAIR, width=2)
    for i, c in enumerate((RED, ORANGE, GREEN)):
        cd.ellipse([28 + i * 32, 25, 28 + i * 32 + 16, 41], fill=c)
    cd.text((CARD_W // 2, 20), "zsh", font=F(REG, 25), fill=FAINT, anchor="ma")

    y = 96
    for cmdline in typed:
        cd.text((PAD_X, y), "$", font=fb, fill=GREEN)
        cd.text((PAD_X + CW * 2, y), cmdline, font=fr, fill=TEXT)
        y += LH
    if cursor:
        last = typed[-1] if typed else ""
        cd.rectangle(
            [PAD_X + CW * (2 + len(last)), y - LH + 3, PAD_X + CW * (3 + len(last)), y - LH + FS + 6],
            fill=TEXT,
        )
    y += int(LH * 0.4)
    for txt, col, bold in visible:
        cd.text((PAD_X, y), txt, font=(fb if bold else fr), fill=col)
        y += LH

    img.paste(card, (28, top), card)

    if badge:
        d = ImageDraw.Draw(img)
        bf = F(XBD, 92)
        bw = d.textlength(badge, font=bf)
        bx, by = W // 2, top + card_h + 30
        d.rounded_rectangle([bx - bw // 2 - 44, by, bx + bw // 2 + 44, by + 126], 24,
                            fill=SURF, outline=HAIR, width=2)
        d.text((bx, by + 14), badge, font=bf, fill=badge_col, anchor="ma")
    return img


def block(name, extra_prefixes=()):
    """Pull the score + dimension block (and any extra lines) from a real run."""
    raw = open(f"{RUNS}/{name}.txt").read().split("\n")
    out, seen_score = [], False
    for ln in raw:
        t = ln.strip()
        if t.startswith("Hygiene Score"):
            seen_score = True
        if seen_score and (t.startswith("Hygiene Score") or "█" in ln or "░" in ln or "n/a" in t):
            out.append(ln.rstrip())
        elif any(t.startswith(p) or p in t for p in extra_prefixes):
            out.append(ln.rstrip())

    rows = []
    for l in out:
        txt = l[2:] if l.startswith("  ") else l
        if len(txt) > COLS:  # clip cleanly rather than letting it run off the card
            txt = txt[: COLS - 1].rstrip() + "…"
        rows.append((txt, *colour(l)))
    return rows


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "demo/qaiq-gaming.mp4"
    ff = open(f"{SCRATCH}/ffmpeg-path.txt").read().strip()
    p = subprocess.Popen(
        [ff, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-shortest", "-c:a", "aac", "-b:a", "128k", "-c:v", "libx264", "-preset", "slow",
         "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "faststart", out],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    n = 0
    def emit(img, k=1):
        nonlocal n
        b = img.tobytes()
        for _ in range(k):
            p.stdin.write(b)
            n += 1

    def hold(img, seconds):
        emit(img, int(FPS * seconds))

    def xfade(a, b, frames=7):
        for i in range(1, frames + 1):
            emit(Image.blend(a, b, i / (frames + 1)))

    # ---- open: one card, not three. Autoplay is silent and the first
    # three seconds decide whether anyone stays. -------------------------
    s1 = statement(["I built a score", "that is hard to game.", "", "So I tried to cheat it."],
                   size=64, kicker="qaiq")
    hold(s1, 3.2)

    CMD = "npx @rafaellabarrocas/qaiq ."

    # ---- baseline ---------------------------------------------------------
    bl = block("baseline", extra_prefixes=("FINDINGS",))
    R = len(bl)
    blank = terminal([], [CMD], cursor=True, rows=R)
    xfade(s1, blank); hold(blank, 0.4)
    for i in range(1, R + 1):
        emit(terminal(bl[:i], [CMD], rows=R), 10 if i == 1 else 5)
    base_f = terminal(bl, [CMD], rows=R)
    hold(base_f, 2.4)

    # ---- cheat 1: junk suppressions --------------------------------------
    c1 = statement(["CHEAT 1", "Suppress every finding."], size=64,
                   foot=["// qaiq-disable-next-line WAIT-001 -- x"])
    xfade(base_f, c1); hold(c1, 2.0)
    j = block("junk2", extra_prefixes=("FINDINGS", "SUP-001"))[:10]
    CM1 = ["# add  -- x  to every finding", CMD]
    f1 = terminal(j, CM1, rows=len(j), reserve=True)
    xfade(c1, f1); hold(f1, 1.0)
    f1b = terminal(j, CM1, rows=len(j), badge="-6", badge_col=GREEN)
    hold(f1b, 2.4)
    c1b = statement(["Worse.", "Every fake reason", "earns its own finding."], size=58, color=GREEN)
    xfade(f1b, c1b); hold(c1b, 2.0)

    # ---- cheat 2: delete tests -------------------------------------------
    c2 = statement(["CHEAT 2", "Delete half the tests."], size=64)
    xfade(c1b, c2); hold(c2, 1.8)
    h = block("half-the-tests", extra_prefixes=("FINDINGS",))
    CM2 = ["rm tests/checkout.spec.ts", CMD]
    f2 = terminal(h, CM2, rows=len(h), reserve=True)
    xfade(c2, f2); hold(f2, 1.0)
    f2b = terminal(h, CM2, rows=len(h), badge="-7", badge_col=GREEN)
    hold(f2b, 2.4)
    c2b = statement(["Worse.", "Scoring is weighted", "by opportunity."], size=58, color=GREEN)
    xfade(f2b, c2b); hold(c2b, 1.8)

    # ---- cheat 3: delete the config --------------------------------------
    c3 = statement(["CHEAT 3", "Delete the config", "it is judging."], size=62)
    xfade(c2b, c3); hold(c3, 2.2)
    nc = block("no-ci-config", extra_prefixes=("FINDINGS",))
    CM3 = ["rm playwright.config.ts", CMD]
    f3 = terminal(nc, CM3, rows=len(nc), reserve=True)
    xfade(c3, f3); hold(f3, 1.6)
    f3b = terminal(nc, CM3, rows=len(nc), badge="+6", badge_col=RED)
    hold(f3b, 4.0)

    # ---- the turn ---------------------------------------------------------
    t1 = statement(["That one worked."], size=92, color=RED)
    t2 = statement(["Being unmeasurable", "scores better than", "being measurably bad."],
                   size=60, color=ORANGE)
    xfade(f3b, t1); hold(t1, 2.0)
    xfade(t1, t2); hold(t2, 2.8)

    # ---- the coda: same cheat, after the fix ------------------------------
    k1 = statement(["So I fixed it."], size=84, color=GREEN)
    xfade(t2, k1); hold(k1, 1.8)
    fx = block("fixed", extra_prefixes=("FINDINGS", "CI-005"))
    CM4 = ["rm playwright.config.ts", CMD]
    f4 = terminal(fx, CM4, rows=len(fx), reserve=True)
    xfade(k1, f4); hold(f4, 1.6)
    f4b = terminal(fx, CM4, rows=len(fx), badge="-7", badge_col=GREEN)
    hold(f4b, 3.4)
    k2 = statement(["Absence is a finding,", "not an exemption."], size=62, color=GREEN,
                   kicker="qaiq 0.2.0")
    xfade(f4b, k2); hold(k2, 2.8)

    # ---- the ask ----------------------------------------------------------
    t3 = statement(["npx", "@rafaellabarrocas/qaiq ."], size=56, color=CYAN, font=BLD,
                   kicker="find a route I missed",
                   foot=["open source · Apache-2.0"])
    xfade(k2, t3); hold(t3, 3.6)

    p.stdin.close()
    p.wait()
    print(f"{out}  {W}x{H}  {n/FPS:.1f}s  {n} frames  {os.path.getsize(out)/1024:.0f} KB")


main()
