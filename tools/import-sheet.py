"""Importa uno sprite sheet disegnato a parte (es. "Micio") nel formato di Spintoni.

    python3 tools/import-sheet.py tools/sprites/micio/map.json

Il file di mappa indica:
  sheet       immagine con i fotogrammi in una griglia (sfondo nero va bene)
  silhouette  stessa griglia: sagoma bianca del personaggio su nero, dettagli colorabili in un colore acceso
  grid        colonne e righe della griglia di origine
  anchor      punto d'appoggio dei piedi dentro una cella di origine (in pixel)
  anims       per ogni animazione, gli indici dei fotogrammi di origine da usare, nell'ordine
Il risultato (PNG, maschera dei dettagli e JSON) va in public/spintoni/sprites/, nello stesso schema
degli altri lottatori: cella 250x212, 1,25 pixel per unità di gioco, animazioni nell'ordine standard.
Richiede Pillow.
"""
import json
import os
import sys

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'spintoni', 'sprites')
TEMPLATE = os.path.join(OUT, 'gilda.json')  # numero di fotogrammi, fasi e velocità delle animazioni
CELL = (250, 212)
SCALE = 1.25
COLS = 10
BORDER = 2  # pixel di bordo azzerati in ogni cella di origine


def lin(img, lo, hi):
    """Rampa lineare su un'immagine in scala di grigi: <=lo -> 0, >=hi -> 255."""
    return img.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * 255 / (hi - lo)))


def main(map_path):
    base_dir = os.path.dirname(os.path.abspath(map_path))
    cfg = json.load(open(map_path))
    tpl = json.load(open(TEMPLATE))
    name = cfg['name']

    silhouette = Image.open(os.path.join(base_dir, cfg['silhouette'])).convert('RGB')
    sheet = Image.open(os.path.join(base_dir, cfg['sheet'])).convert('RGB').resize(silhouette.size, Image.LANCZOS)
    cols, rows = cfg['grid']['cols'], cfg['grid']['rows']
    cw, ch = silhouette.width / cols, silhouette.height / rows
    fx, fy = CELL[0] / cw, CELL[1] / ch

    order = sorted(tpl['anims'].items(), key=lambda kv: kv[1]['start'])
    total = sum(a['frames'] for _, a in order)
    out_rows = -(-total // COLS)
    full = Image.new('RGBA', (CELL[0] * COLS, CELL[1] * out_rows), (0, 0, 0, 0))
    mask = Image.new('RGBA', full.size, (0, 0, 0, 0))

    def cell(idx):
        c, r = idx % cols, idx // cols
        return (round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch))

    anims = {}
    k = 0
    for anim, a in order:
        src = cfg['anims'][anim]
        if len(src) != a['frames']:
            sys.exit(f'{anim}: servono {a["frames"]} fotogrammi, la mappa ne ha {len(src)}')
        anims[anim] = {key: a[key] for key in a if key != 'start'}
        anims[anim]['start'] = k
        for idx in src:
            box = cell(idx)
            rgb = sheet.crop(box)
            sil = silhouette.crop(box)
            # trasparenza: la sagoma tiene pieno il corpo (anche le zone scure),
            # la rimozione del nero recupera ciò che la sagoma non copre (spada, scudo)
            r, g, b = rgb.split()
            key = lin(ImageChops.lighter(ImageChops.lighter(r, g), b), 10, 38)
            alpha = ImageChops.lighter(lin(sil.convert('L'), 25, 90), key)
            # bordo della cella pulito: niente pezzi dei fotogrammi vicini
            border = Image.new('L', alpha.size, 0)
            border.paste(255, (BORDER, BORDER, alpha.width - BORDER, alpha.height - BORDER))
            alpha = ImageChops.multiply(alpha, border)
            frame = rgb.copy()
            frame.putalpha(alpha)
            # dettagli colorabili: le zone colorate (non grigie) della sagoma
            sr, sg, sb = sil.split()
            acc = lin(ImageChops.subtract(sr, sg), 18, 45)
            acc = ImageChops.multiply(acc, lin(sr, 70, 110))
            lum = rgb.convert('L')
            vals = [v for v, m in zip(lum.tobytes(), acc.tobytes()) if m > 200]
            ref = max(1, sorted(vals)[len(vals) * 3 // 4]) if vals else 255
            grey = lum.point(lambda v: min(255, int(v * 255 / ref)))
            det = Image.merge('RGBA', (grey, grey, grey, ImageChops.multiply(acc, alpha)))

            col, row = k % COLS, k // COLS
            dst = (col * CELL[0], row * CELL[1])
            size = CELL
            full.alpha_composite(frame.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA'), dst)
            mask.alpha_composite(det.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA'), dst)
            k += 1

    if cfg.get('face', 1) < 0:
        sys.exit('i fotogrammi devono guardare a destra')
    meta = {
        'char': name, 'scale': SCALE, 'cell': {'w': CELL[0], 'h': CELL[1]},
        'anchor': {'x': round(cfg['anchor']['x'] * fx), 'y': round(cfg['anchor']['y'] * fy)},
        'cols': COLS, 'frames': total, 'mask': f'{name}-mask.png', 'anims': anims,
        'source': os.path.relpath(map_path, ROOT),
    }
    for img, fname in ((full, f'{name}.png'), (mask, f'{name}-mask.png')):
        q = img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(os.path.join(OUT, fname), optimize=True)
        print(fname, os.path.getsize(os.path.join(OUT, fname)) // 1024, 'KB')
    json.dump(meta, open(os.path.join(OUT, f'{name}.json'), 'w'))
    print(f'{name}.json: {total} fotogrammi, punto d\'appoggio {meta["anchor"]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'sprites', 'micio', 'map.json'))
