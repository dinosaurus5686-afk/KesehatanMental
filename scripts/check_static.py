from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
required_files = [
    ROOT / 'index.html',
    ROOT / 'src' / 'main.js',
    ROOT / 'src' / 'styles.css',
]

missing = [str(path.relative_to(ROOT)) for path in required_files if not path.exists()]
if missing:
    print(f"Missing required files: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)

class BasicHTMLValidator(HTMLParser):
    def error(self, message):
        raise AssertionError(message)

html = (ROOT / 'index.html').read_text(encoding='utf-8')
BasicHTMLValidator().feed(html)

required_html = ['id="check-in"', 'id="bantuan"', 'src/main.js', 'src/styles.css']
for marker in required_html:
    if marker not in html:
        print(f"Missing HTML marker: {marker}", file=sys.stderr)
        sys.exit(1)

js = (ROOT / 'src' / 'main.js').read_text(encoding='utf-8')
for marker in ['moodOptions', 'getCarePlan', 'initializeApp', 'layanan darurat setempat']:
    if marker not in js:
        print(f"Missing JavaScript marker: {marker}", file=sys.stderr)
        sys.exit(1)

css = (ROOT / 'src' / 'styles.css').read_text(encoding='utf-8')
for selector in ['.hero', '.mood-card', '.breath-circle.is-breathing', '@media (max-width: 800px)']:
    if selector not in css:
        print(f"Missing CSS selector: {selector}", file=sys.stderr)
        sys.exit(1)

if re.search(r'<script[^>]+src="https?://', html):
    print('External script URLs are not allowed for this static app.', file=sys.stderr)
    sys.exit(1)

print('Static app structure looks good.')
