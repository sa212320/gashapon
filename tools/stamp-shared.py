"""全站共用的 CSS / JS 網址帶內容雜湊(?v=sha1 前 8 碼)。GitHub Pages 對 CSS/JS 快取 10 分鐘,
沒帶版本號的話,改了 tokens.css 手機要等十分鐘才看得到(2026-10-02:修雙擊放大時撞到)。
改完 shared/css/tokens.css 或 shared/js/no-zoom.js 之後跑一次:python3 tools/stamp-shared.py
test/shared-stamp.test.js 會檢查雜湊跟檔案內容一致。"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ['shared/css/tokens.css', 'shared/js/no-zoom.js']
PAGES = ['index.html', 'gashapon/index.html', 'gashapon3d/index.html',
         'ichiban/index.html', 'ghostleg/index.html', 'smash/index.html']


def digest(rel):
    return hashlib.sha1((ROOT / rel).read_bytes()).hexdigest()[:8]


for page in PAGES:
    path = ROOT / page
    text = path.read_text()
    for rel in ASSETS:
        text = re.sub(re.escape(rel) + r'(\?v=[0-9a-f]{8})?(?=")', f'{rel}?v={digest(rel)}', text)
    path.write_text(text)
    print(page)
