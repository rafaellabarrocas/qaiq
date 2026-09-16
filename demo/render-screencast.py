#!/usr/bin/env python3
"""A real terminal session, recorded vertically. QAIQ actually running.

Not slides: the command is typed, output streams in line by line, the view
scrolls as it fills, and it pauses where a viewer needs to read.
"""
import subprocess, sys, os, textwrap
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
FS = 29
SCRATCH = "/tmp/claude-1000/-home-rafaella-Personal/baa2297b-6d15-4da9-befd-ccbbdd397b64/scratchpad"
FD = f"{SCRATCH}/fonts/fonts/ttf"
REG, BLD = f"{FD}/JetBrainsMono-Regular.ttf", f"{FD}/JetBrainsMono-Bold.ttf"

BG, SURF = (12, 14, 16), (18, 21, 24)
HAIR = (255, 255, 255, 30)
TEXT, MUTED, FAINT = "#e6edf3", "#8b949e", "#4d545c"
CYAN, ORANGE, GREEN, RED, MAG = "#7dcfff", "#ff9e64", "#9ece6a", "#f7768e", "#bb9af7"

fr = ImageFont.truetype(REG, FS); fb = ImageFont.truetype(BLD, FS)
CW = fr.getlength("M"); LH = int(FS * 1.5)
PAD_X, TOP = 34, 300
# derive the column count from the real card width so nothing clips at the edge
CARD_W = W - 56
COLS = int((CARD_W - PAD_X * 2 - 8) / CW)
ROWS = (H - TOP - 200) // LH

def colour(s):
    t = s.strip()
    if t.startswith("Hygiene Score"):      return TEXT, True
    if t.startswith("FINDINGS"):           return ORANGE, True
    if t.startswith("NOT MEASURED"):       return CYAN, True
    if t.startswith("Questions for a"):    return MAG, True
    if t.startswith("?"):                  return MAG, False
    if t.startswith("·"):                  return MUTED, False
    if t.startswith("~ ="):                return FAINT, False
    if t.startswith("QAIQ scores"):        return FAINT, False
    if "n/a" in t:                         return FAINT, False
    if "█" in s or "░" in s:
        try:
            v = int(t.split()[-1])
            return (GREEN if v >= 85 else ORANGE if v >= 60 else RED), False
        except Exception: return TEXT, False
    return MUTED, False

def wrap(raw):
    out = []
    for ln in raw.split("\n"):
        col, bold = colour(ln)
        if len(ln) <= COLS:
            out.append((ln, col, bold)); continue
        ind = len(ln) - len(ln.lstrip())
        for i, piece in enumerate(textwrap.wrap(ln, COLS, subsequent_indent=" " * (ind + 2))):
            out.append((piece, col, bold and i == 0))
    return out

def frame(visible, typed, cursor):
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img)
    card = Image.new("RGBA", (W - 56, H - 360), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0, 0, card.width - 1, card.height - 1], 20,
                         fill=SURF + (255,), outline=HAIR, width=2)
    cd.line([(1, 64), (card.width - 2, 64)], fill=HAIR, width=2)
    for i, c in enumerate((RED, ORANGE, GREEN)):
        cd.ellipse([28 + i * 32, 25, 28 + i * 32 + 16, 41], fill=c)
    cd.text((card.width // 2, 20), "zsh", font=ImageFont.truetype(REG, 25), fill=FAINT, anchor="ma")
    y = 96
    cd.text((PAD_X, y), "$", font=fb, fill=GREEN)
    cd.text((PAD_X + CW * 2, y), typed, font=fr, fill=TEXT)
    if cursor:
        cd.rectangle([PAD_X + CW * (2 + len(typed)), y + 3,
                      PAD_X + CW * (3 + len(typed)), y + FS + 6], fill=TEXT)
    y += LH
    for txt, col, bold in visible:
        cd.text((PAD_X, y), txt, font=(fb if bold else fr), fill=col)
        y += LH
    img.paste(card, (28, 180), card)
    return img

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "demo/qaiq-screencast.mp4"
    raw = subprocess.run(["node", "dist/surfaces/cli/index.js", "demo/sample-suite"],
                         capture_output=True, text=True).stdout.strip("\n")
    lines = wrap(raw)
    cmd = "npx @rafaellabarrocas/qaiq ."

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
        for _ in range(k): p.stdin.write(b); n += 1

    # 1. prompt, blinking, then typing
    for i in range(14): emit(frame([], "", i % 8 < 5))
    for i in range(1, len(cmd) + 1):
        emit(frame([], cmd[:i], True), 2)
    for i in range(20): emit(frame([], cmd, i % 10 < 6))

    # 2. output streams in; view scrolls once it fills
    for i in range(1, len(lines) + 1):
        vis = lines[max(0, i - ROWS):i]
        txt = lines[i - 1][0].strip()
        hold = 2
        if txt.startswith("Hygiene Score"):   hold = 26
        elif "█" in lines[i-1][0] or "n/a" in txt: hold = 9
        elif txt.startswith("FINDINGS"):      hold = 16
        elif txt.startswith("NOT MEASURED"):  hold = 22
        elif txt.startswith("·"):             hold = 13
        elif txt.startswith("Questions for"): hold = 18
        elif txt.startswith("?"):             hold = 10
        elif txt.startswith("QAIQ scores"):   hold = 30
        emit(frame(vis, cmd, False), hold)

    # 3. land on the closing frame, cursor back
    tail = lines[-ROWS:]
    for i in range(70): emit(frame(tail, cmd, i % 10 < 6))

    p.stdin.close(); p.wait()
    print(f"{out}  {W}x{H}  {n/FPS:.1f}s  {n} frames  {os.path.getsize(out)/1024:.0f} KB")

main()
