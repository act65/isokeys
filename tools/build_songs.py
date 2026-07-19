#!/usr/bin/env python3
"""Build js/songs.js from real MIDI files fetched off the web.

We don't ship MIDI or a runtime parser — instead this build step fetches curated
MIDI files (from bitmidi.com), extracts the melody line, quantises it to our
compact [midi, beats] format, and writes js/songs.js. Re-run to add songs.

Usage:  python3 tools/build_songs.py
Deps:   mido  (pip install mido)

Melody extraction is heuristic (pick the most monophonic, melodic-register track;
take its top voice; drop bass leaks; quantise; transpose into a playable octave).
It is not perfect — verify new additions by ear.
"""
import mido, urllib.request, urllib.parse, statistics, os, sys, math

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}
def GET(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read()

# Curated (name, bitmidi id, track override or None, max melody notes).
# Mix of fun/modern game & film themes and public-domain classics.
CURATED = [
    ("Tetris (Korobeiniki)",        100444, None, 48),
    ("Super Mario Bros.",            98192,  None, 48),
    ("Zelda's Lullaby",             112988, None, 40),
    ("Ode to Joy",                   34951,  None, 40),
    ("Für Elise",                    28362,  None, 44),
    ("Pachelbel's Canon",            83576,  None, 44),
    ("Final Fantasy Prelude",        46309,  None, 40),
    ("Pink Panther",                 103005, None, 40),
    ("James Bond Theme",             62216,  None, 36),
    ("He's a Pirate",                85261,  None, 48),
    ("Hall of the Mountain King",    28672,  None, 44),
    ("Smoke on the Water",           94710,  None, 40),
    ("Twinkle Twinkle",              35393,  None, 42),
]

GRID = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
def quant(b): return min(GRID, key=lambda g: abs(g - b)) if b > 0 else 0.25

def load(path):
    mid = mido.MidiFile(path); tpb = mid.ticks_per_beat; tempo = 500000; tracks = []
    for ti, tr in enumerate(mid.tracks):
        t = 0; on = {}; notes = []
        for msg in tr:
            t += msg.time
            if msg.type == 'set_tempo': tempo = msg.tempo
            if msg.type == 'note_on' and msg.velocity > 0:
                on.setdefault(msg.note, []).append(t)
            elif msg.type in ('note_off', 'note_on') and msg.note in on and on[msg.note]:
                s = on[msg.note].pop(0); notes.append((s, t, msg.note, getattr(msg, 'channel', 0)))
        if notes: tracks.append((ti, notes))
    return tpb, tempo, tracks

def ov_ratio(ns):
    ns = sorted(ns, key=lambda n: n[0]); ov = 0
    for i in range(1, len(ns)):
        if ns[i][0] < ns[i - 1][1] - 2: ov += 1
    return ov / max(1, len(ns))

def skyline(notes):  # keep the top voice
    notes = sorted(notes, key=lambda n: (n[0], -n[2])); res = []
    for s, e, p, c in notes:
        if res and s < res[-1][1] - 2:      # overlaps the current top note
            if p > res[-1][2]:
                res[-1][1] = s               # a higher note interrupts -> cut previous short
                if res[-1][1] - res[-1][0] < 4: res.pop()
            elif p == res[-1][2] and s <= res[-1][0] + 2:
                continue                     # exact same-pitch stack (chord voicing) -> drop
            else:
                continue                     # lower harmony note -> drop
        # NOTE: do NOT merge sequential same-pitch notes — real repeated notes
        # (e.g. Ode to Joy's opening F# F#) must be preserved.
        res.append([s, e, p, c])
    return res

def debass(mono):  # drop isolated notes an octave+ off from their neighbours
    if not mono: return mono
    med = statistics.median([n[2] for n in mono]); out = []
    for i, n in enumerate(mono):
        p = n[2]; pv = out[-1][2] if out else None; nx = mono[i + 1][2] if i + 1 < len(mono) else None
        refs = [x for x in (pv, nx) if x is not None]
        # bass leak: far below the register and below every neighbour
        if refs and p < med - 13 and all(p < r - 11 for r in refs): continue
        # high glitch (grace / wrong-octave note): more than an octave above every neighbour
        if refs and all(p > r + 12 for r in refs): continue
        out.append(n)
    return out

def extract(path, track_override, maxnotes):
    tpb, tempo, tracks = load(path)
    cand = []
    for ti, notes in tracks:
        ch = set(n[3] for n in notes)
        if ch == {9} or len(notes) < 8: continue
        reg = sum(1 for n in notes if 59 <= n[2] <= 88) / len(notes)
        cand.append((len(notes) * (reg + 0.15) / (1 + ov_ratio(notes) * 4), ti, notes))
    if not cand: return None
    if track_override is not None:
        cand = [c for c in cand if c[1] == track_override] or cand
    cand.sort(reverse=True, key=lambda c: c[0])
    notes = cand[0][2]
    mono = debass(skyline(notes))
    seq = []; prev = None; cnt = 0
    for s, e, p, c in mono:
        if prev is not None:
            g = (s - prev) / tpb
            if g >= 0.25: seq.append((None, quant(g)))
        seq.append((p, quant((e - s) / tpb))); prev = e; cnt += 1
        if cnt >= maxnotes: break
    # transpose by whole octaves so the melody's median sits near middle C (~D4),
    # a comfortable range for the grid. (floor(x+0.5) avoids banker's rounding.)
    pitches = [p for p, d in seq if p is not None]
    shift = int(math.floor((64 - statistics.median(pitches)) / 12 + 0.5)) * 12
    seq = [((p + shift if p is not None else None), d) for p, d in seq]
    seq = [(p, d) for p, d in seq if p is None or 24 <= p <= 100]
    while seq and seq[0][0] is None: seq.pop(0)  # no leading rest
    return round(60000000 / tempo), seq

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = []
    for name, mid_id, tr, mx in CURATED:
        try:
            data = GET('https://bitmidi.com/uploads/%d.mid' % mid_id)
            open('/tmp/_song.mid', 'wb').write(data)
            r = extract('/tmp/_song.mid', tr, mx)
            if not r: print("  SKIP (no melody):", name); continue
            bpm, seq = r
            n = len([1 for p, d in seq if p is not None])
            print("  OK  %-28s bpm=%3d notes=%d" % (name, bpm, n))
            body = ', '.join('[%s, %s]' % ('null' if p is None else p, d) for p, d in seq)
            out.append('    {\n      name: %r,\n      bpm: %d,\n      seq: [%s],\n    }' % (name, bpm, body))
        except Exception as e:
            print("  ERR", name, e)

    js = ("/* songs.js — GENERATED by tools/build_songs.py from real MIDI files.\n"
          " * Melodies extracted from curated MIDI (bitmidi.com) and quantised to\n"
          " * [midi, beats] ([null, beats] = rest). Do not edit by hand; re-run the tool.\n"
          " *\n"
          " * NOTE: several pieces are copyrighted compositions (game/film themes),\n"
          " * included here as short melodic excerpts for personal/educational use.\n"
          " */\n"
          "(function (KB) {\n  'use strict';\n\n"
          "  const SONGS = [\n" + ',\n'.join(out) + "\n  ];\n\n"
          "  // Expand a song into absolute-timed notes: [{midi, start(ms), dur(ms)}].\n"
          "  function schedule(song) {\n"
          "    const beatMs = 60000 / song.bpm;\n"
          "    let beat = 0;\n"
          "    const notes = [];\n"
          "    song.seq.forEach(([midi, dur]) => {\n"
          "      if (midi != null) notes.push({ midi, start: beat * beatMs, dur: dur * beatMs });\n"
          "      beat += dur;\n"
          "    });\n"
          "    return { notes, totalMs: beat * beatMs, beatMs };\n"
          "  }\n\n"
          "  KB.songs = { SONGS, schedule };\n"
          "})(window.KB = window.KB || {});\n")
    open(os.path.join(root, 'js', 'songs.js'), 'w').write(js)
    print("wrote js/songs.js with %d songs" % len(out))

if __name__ == '__main__':
    main()
