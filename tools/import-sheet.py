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
Oltre ai dettagli segnati con un colore acceso nella sagoma, la mappa può elencare `color_rules`: zone da rendere
colorabili riconoscendole dal colore (es. il mantello crema). Ogni regola ha intervalli di tinta (hue, gradi),
saturazione (sat) e luminosità (val), più, se serve, `behind`, `below` e `far_behind` (pixel rispetto alla testa: la zona sta
dietro e sotto di essa, o molto dietro a qualsiasi altezza). Si tiene la macchia più grande (almeno min_area pixel) e quelle entro `near`
pixel da essa, più quelle grandi almeno `rel` volte: così si scartano i puntini e gli oggetti lontani dello stesso colore.
Richiede Pillow e numpy.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageFilter

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


def hsv(rgb):
    """Tinta (gradi), saturazione e luminosità (0..1) di un'immagine RGB, come array."""
    a = np.asarray(rgb, dtype=np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    safe = np.maximum(d, 1e-6)
    h = np.where(mx == r, (g - b) / safe % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) * 60
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    return h % 360, s, mx


def keep_main_blobs(mask, min_area, near, rel):
    """Tiene la macchia più grande (se almeno min_area pixel) e quelle vicine, scarta le altre.

    Una macchia si tiene se è grande almeno `rel` volte la più grande, oppure se sta entro `near` pixel da essa
    (così un mantello spezzato da un braccio resta intero, mentre le ginocchiere lontane si scartano).
    """
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    areas = [0]
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or labels[y, x]:
                continue
            n = len(areas)
            labels[y, x] = n
            stack, count = [(y, x)], 0
            while stack:
                cy, cx = stack.pop()
                count += 1
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = n
                        stack.append((ny, nx))
            areas.append(count)
    if len(areas) == 1 or max(areas) < min_area:
        return np.zeros_like(mask, dtype=bool)
    main = int(np.argmax(areas))
    zone = Image.fromarray(((labels == main) * 255).astype('uint8')).filter(ImageFilter.MaxFilter(2 * near + 1))
    zone = np.asarray(zone) > 127
    keep = np.zeros_like(mask, dtype=bool)
    for n in range(1, len(areas)):
        blob = labels == n
        if n == main or areas[n] >= rel * areas[main] or (areas[n] >= 6 and (blob & zone).any()):
            keep |= blob
    return keep


def rule_mask(rgb, body, rule, anchor=None):
    """Zona colorabile riconosciuta dal colore: soglie, vincolo di posizione, poi pulizia.

    anchor = (x, y) della testa (centro delle orecchie) nel fotogramma. Con `behind` la zona deve stare dietro la
    testa (x <= x_testa + behind) e con `below` sotto di essa (y >= y_testa + below): serve a non confondere il
    mantello con il pelo del viso, lo scudo o la spada, che stanno davanti.
    """
    h, s, v = hsv(rgb)
    lo, hi = rule['hue']
    cond = (h >= lo) & (h <= hi) & (s >= rule['sat'][0]) & (s <= rule['sat'][1]) & (v >= rule['val'][0]) & (v <= rule['val'][1])
    cond &= np.asarray(body) > 60
    if 'behind' in rule or 'below' in rule:
        if anchor is None:
            return Image.new('L', rgb.size, 0)
        yy, xx = np.mgrid[0:cond.shape[0], 0:cond.shape[1]]
        if 'behind' in rule:
            cond &= xx <= anchor[0] + rule['behind']
        if 'below' in rule:
            ok = yy >= anchor[1] + rule['below']
            # il mantello che vola all'indietro può stare più in alto della testa: lo si ammette se è ben dietro di essa
            if 'far_behind' in rule:
                ok |= xx <= anchor[0] - rule['far_behind']
            cond &= ok
    m = Image.fromarray((cond * 255).astype('uint8'))
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))        # apertura: via le linee sottili
    keep = keep_main_blobs(np.asarray(m) > 127, rule.get('min_area', 25), rule.get('near', 5), rule.get('rel', 0.4))
    m = Image.fromarray((keep * 255).astype('uint8'))
    m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))        # chiusura: colma i buchi
    m = m.filter(ImageFilter.MaxFilter(3))                                         # copre la frangia chiara del bordo
    return ImageChops.multiply(m, body.point(lambda x: 255 if x > 60 else 0))


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

    # prima passata: per ogni fotogramma, immagine, trasparenza, dettagli acuti e zone riconosciute dal colore
    frames = []
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
            # dettagli colorabili segnati con un colore acceso nella sagoma
            sr, sg, sb = sil.split()
            acc = lin(ImageChops.subtract(sr, sg), 18, 45)
            acc = ImageChops.multiply(acc, lin(sr, 70, 110))
            body = lin(sil.convert('L'), 25, 90)
            # riferimento per la posizione: centro delle orecchie (la zona colorata acuta nella sagoma)
            ys, xs = np.nonzero(np.asarray(acc) > 200)
            anchor = (float(xs.mean()), float(ys.mean())) if xs.size else None
            rules = [rule_mask(rgb, body, rule, anchor) for rule in cfg.get('color_rules', [])]
            frames.append({'rgb': rgb, 'alpha': alpha, 'acc': acc, 'rules': rules})
            k += 1

    # luminosità di riferimento per ogni regola, uguale per tutto lo sheet (niente sfarfallio da un fotogramma all'altro)
    refs = []
    for i in range(len(cfg.get('color_rules', []))):
        vals = []
        for f in frames:
            lum = np.asarray(f['rgb'].convert('L'))
            vals.append(lum[np.asarray(f['rules'][i]) > 200])
        vals = np.concatenate(vals) if vals else np.array([255])
        refs.append(max(1.0, float(np.percentile(vals, 85))) if vals.size else 255.0)

    # seconda passata: compone sprite e maschera
    for k, f in enumerate(frames):
        rgb, alpha, acc = f['rgb'], f['alpha'], f['acc']
        frame = rgb.copy()
        frame.putalpha(alpha)
        lum = rgb.convert('L')
        vals = [v for v, m in zip(lum.tobytes(), acc.tobytes()) if m > 200]
        ref = max(1, sorted(vals)[len(vals) * 3 // 4]) if vals else 255
        grey = np.minimum(255, np.asarray(lum, dtype=np.float32) * 255 / ref)
        cover = np.asarray(acc, dtype=np.float32)
        for rule, rref in zip(f['rules'], refs):
            m = np.asarray(rule, dtype=np.float32)
            take = m > cover
            grey = np.where(take, np.minimum(255, np.asarray(lum, dtype=np.float32) * 255 / rref), grey)
            cover = np.maximum(cover, m)
        det_alpha = ImageChops.multiply(Image.fromarray(cover.astype('uint8')), alpha)
        g8 = Image.fromarray(grey.astype('uint8'))
        det = Image.merge('RGBA', (g8, g8, g8, det_alpha))

        col, row = k % COLS, k // COLS
        dst = (col * CELL[0], row * CELL[1])
        full.alpha_composite(frame.convert('RGBa').resize(CELL, Image.LANCZOS).convert('RGBA'), dst)
        mask.alpha_composite(det.convert('RGBa').resize(CELL, Image.LANCZOS).convert('RGBA'), dst)

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
