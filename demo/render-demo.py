#!/usr/bin/env python3
"""Render a terminal-style animated GIF of a QAIQ run. Pillow only.

  python3 demo/render-demo.py <target-dir> <output.gif> [--width N]
"""
import subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FS, PAD, LH = 14, 26, 19
BG, CHROME = "#15161e", "#1f2130"

C = {
    "dim": "#565f89", "text": "#a9b1d6", "white": "#c0caf5",
    "green": "#9ece6a", "yellow": "#e0af68", "red": "#f7768e",
    "cyan": "#7dcfff", "magenta": "#bb9af7", "prompt": "#9ece6a",
}

def colorize(line):
    """(color, bold) for a line of QAIQ output."""
    s = line.strip()
    if s.startswith("Hygiene Score"): return C["white"], True
    if s.startswith("FINDINGS"):      return C["yellow"], True
    if s.startswith("SUPPRESSED"):    return C["yellow"], True
    if s.startswith("SKIPPED"):       return C["yellow"], True
    if s.startswith("NOT MEASURED"):  return C["cyan"], True
    if s.startswith("Questions for a human"): return C["magenta"], True
    if s.startswith("?"):             return C["magenta"], False
    if s.startswith("·"):             return C["dim"], False
    if s.startswith("~ ="):           return C["dim"], False
    if s.startswith("QAIQ scores"):   return C["dim"], False
    if "n/a" in s:                    return C["dim"], False
    for dim, col in (("100", C["green"]), ("9", C["green"]), ("8", C["green"])):
        pass
    if "█" in line or "░" in line:
        try:
            v = int(s.split()[-1])
            return (C["green"] if v >= 85 else C["yellow"] if v >= 60 else C["red"]), False
        except Exception:
            return C["text"], False
    if any(s.startswith(p) or f" {p}" in s for p in
           ("WAIT-", "LOC-", "CI-", "ISO-", "ASR-", "SUP-")):
        return C["text"], False
    return C["text"], False

def frame(lines, typed, cols, rows, fr, fb):
    w = PAD * 2 + int(cols * fr.getlength("M"))
    h = PAD * 2 + (rows + 3) * LH + 34
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 30], fill=CHROME)
    for i, c in enumerate(("#f7768e", "#e0af68", "#9ece6a")):
        d.ellipse([PAD + i * 20, 11, PAD + i * 20 + 10, 21], fill=c)
    d.text((w // 2 - 40, 8), "qaiq", font=fr, fill=C["dim"])
    y = 34 + PAD
    d.text((PAD, y), "$", font=fb, fill=C["prompt"])
    d.text((PAD + int(fr.getlength("$ ")), y), typed, font=fr, fill=C["white"])
    y += LH * 2
    cw = fr.getlength("M")
    for ln in lines:
        ln = ln.rstrip("\n")
        if "\u2588" in ln or "\u2591" in ln or "\u00b7\u00b7" in ln:
            # label | filled track | empty track | number, each its own colour
            i = min((ln.index(c) for c in "\u2588\u2591\u00b7" if c in ln), default=len(ln))
            j = len(ln.rstrip())
            while j > i and ln[j-1] not in "\u2588\u2591\u00b7":
                j -= 1
            label, bar, tail = ln[:i], ln[i:j], ln[j:]
            try:
                v = int(tail.strip()); col = C["green"] if v >= 85 else C["yellow"] if v >= 60 else C["red"]
            except Exception:
                v, col = None, C["dim"]
            d.text((PAD, y), label, font=fr, fill=C["text"])
            x = PAD + i * cw
            for ch in bar:
                d.text((x, y), ch, font=fr, fill=(col if ch == "\u2588" else C["dim"]))
                x += cw
            d.text((PAD + j * cw, y), tail, font=fb, fill=col)
        else:
            c2, bold = colorize(ln)
            d.text((PAD, y), ln, font=(fb if bold else fr), fill=c2)
        y += LH
    return img

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    out = sys.argv[2] if len(sys.argv) > 2 else "demo/qaiq.gif"
    cmd = f"npx @rafaellabarrocas/qaiq {target}"
    raw = subprocess.run(["node", "dist/surfaces/cli/index.js", target],
                         capture_output=True, text=True).stdout
    lines = [l for l in raw.split("\n")]
    while lines and not lines[0].strip(): lines.pop(0)
    while lines and not lines[-1].strip(): lines.pop()
    cols = max(len(cmd) + 4, max((len(l) for l in lines), default=80)) + 2
    rows = len(lines)
    fr, fb = ImageFont.truetype(FONT, FS), ImageFont.truetype(BOLD, FS)

    frames, durs = [], []
    # 1. type the command
    step = 3
    for i in range(0, len(cmd) + 1, step):
        frames.append(frame([], cmd[:i] + "█", cols, rows, fr, fb)); durs.append(45)
    frames.append(frame([], cmd, cols, rows, fr, fb)); durs.append(420)
    # 2. reveal output in chunks
    chunk = max(3, rows // 12)
    for i in range(chunk, rows + 1, chunk):
        frames.append(frame(lines[:i], cmd, cols, rows, fr, fb)); durs.append(95)
    # 3. hold on the full result
    frames.append(frame(lines, cmd, cols, rows, fr, fb)); durs.append(5200)

    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=128) for f in frames]
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=durs,
                loop=0, optimize=True, disposal=2)
    print(f"{out}  {frames[0].size[0]}x{frames[0].size[1]}  "
          f"{len(frames)} frames  {os.path.getsize(out)/1024:.0f} KB")

main()
