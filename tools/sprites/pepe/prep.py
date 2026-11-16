"""Prepara lo sheet di Pepe per import-sheet.py: sfondo grigio -> nero e sagoma bianca.

    python3 tools/sprites/pepe/prep.py <sheet-originale.jpg>

Scrive sheet.png (sfondo nero) e mask.png (sagoma) accanto a questo file.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

here = os.path.dirname(os.path.abspath(__file__))
src = Image.open(sys.argv[1]).convert('RGB')
a = np.asarray(src, dtype=np.float32)
bg = np.median(a.reshape(-1, 3), axis=0)  # il colore più comune: lo sfondo
dist = np.abs(a - bg).max(-1)
alpha = np.clip((dist - 22) * 255 / 38, 0, 255).astype('uint8')
im = Image.fromarray(alpha)
# via il rumore del jpeg: apertura leggera, poi si colmano i buchi interni (occhi, guanti chiari)
im = im.filter(ImageFilter.MedianFilter(3))
m = np.asarray(im) > 100
# riempi i buchi: flood fill dello sfondo dai bordi
from collections import deque
h, w = m.shape
out = np.zeros_like(m)
q = deque([(0, 0)])
out[0, 0] = True
while q:
    y, x = q.popleft()
    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
        if 0 <= ny < h and 0 <= nx < w and not out[ny, nx] and not m[ny, nx]:
            out[ny, nx] = True
            q.append((ny, nx))
filled = ~out
sil = np.maximum(np.asarray(im), (filled * 255).astype('uint8') * 0 + (filled * 255).astype('uint8'))
sil = np.where(filled, 255, 0).astype('uint8')
Image.fromarray(sil).convert('RGB').save(os.path.join(here, 'mask.png'))
sheet = (a * (sil[..., None] / 255.0)).astype('uint8')
Image.fromarray(sheet).save(os.path.join(here, 'sheet.png'))
print('ok', bg)
