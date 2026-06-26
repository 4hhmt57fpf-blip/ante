#!/usr/bin/env python3
"""
Ante local server: serves the static app AND proxies Canvas API calls.

Why the proxy: browsers block direct calls to a school's Canvas API (CORS).
The app calls our own origin (/__canvas) instead; this server forwards the
request to Canvas with the user's personal access token. The token travels
only from this machine to the user's own Canvas instance — never logged,
never sent anywhere else.
"""
import http.server, socketserver, urllib.request, urllib.parse, urllib.error, json, os, re, ssl

# macOS Python framework builds ship without loaded root CAs; use certifi's bundle
# so HTTPS to Canvas verifies properly.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl.create_default_context()

PORT = int(os.environ.get('PORT', 3847))  # honor an assigned PORT (preview autoPort); default to 3847
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CANVAS_STORE = os.path.join(DIRECTORY, '.canvas_data.json')  # local only, gitignored


def _load_canvas():
    try:
        with open(CANVAS_STORE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_canvas(data):
    try:
        with open(CANVAS_STORE, 'w') as f:
            json.dump(data, f)
    except Exception:
        pass


CANVAS_DATA = _load_canvas()  # latest snapshot pushed by the browser extension (persisted)


def parse_ics(raw):
    """Minimal RFC5545 VEVENT extractor: returns [{title, due}] for calendar items."""
    raw = raw.replace('\r\n', '\n').replace('\r', '\n')
    # unfold continuation lines (leading space/tab)
    lines = []
    for line in raw.split('\n'):
        if line[:1] in (' ', '\t') and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    events, cur = [], None
    for line in lines:
        if line == 'BEGIN:VEVENT':
            cur = {}
        elif line == 'END:VEVENT':
            if cur is not None and cur.get('title'):
                events.append(cur)
            cur = None
        elif cur is not None and ':' in line:
            key, val = line.split(':', 1)
            key = key.split(';', 1)[0]
            if key == 'SUMMARY':
                cur['title'] = val.replace('\\,', ',').replace('\\;', ';').strip()
            elif key == 'DTSTART':
                cur['due'] = val.strip()
            elif key == 'DTEND':
                cur.setdefault('due', val.strip())
    return events
HOST_RE = re.compile(r'^[A-Za-z0-9.-]+$')  # plain domain only — no scheme, no path

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRECTORY, **k)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'X-Canvas-Token, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/__canvas_ics'):
            return self.handle_ics()
        if self.path.startswith('/__canvas_data'):
            return self._json(CANVAS_DATA)
        if self.path.startswith('/__canvas'):
            return self.handle_canvas()
        return super().do_GET()

    def handle_ics(self):
        # Read assignment due-dates from the user's personal Canvas calendar feed (ICS).
        # No token, no extension re-run — the feed URL is a per-user secret captured at sync.
        try:
            q = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(q.query)
            ics_url = params.get('url', [''])[0].strip()
            if not ics_url:
                ics_url = (CANVAS_DATA.get('profile', {}).get('calendar', {}) or {}).get('ics', '')
            if not ics_url or not ics_url.startswith('https://'):
                return self._json({'error': 'No Canvas calendar feed yet — sync once with the extension.'}, 400)
            req = urllib.request.Request(ics_url, headers={'User-Agent': 'Ante'})
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
                raw = r.read().decode('utf-8', 'replace')
            self._json({'assignments': parse_ics(raw)})
        except Exception as e:
            self._json({'error': str(e)}, 502)

    def do_POST(self):
        # The browser extension posts the user's Canvas data here (no token needed —
        # it reads through the user's own logged-in Canvas session).
        if self.path.startswith('/__canvas_data'):
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length) if length else b'{}'
                data = json.loads(body or b'{}')
                global CANVAS_DATA
                CANVAS_DATA = data
                _save_canvas(data)
                return self._json({'ok': True})
            except Exception as e:
                return self._json({'error': str(e)}, 400)
        return self._json({'error': 'not found'}, 404)

    def handle_canvas(self):
        try:
            q = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(q.query)
            host = params.get('host', [''])[0].strip().replace('https://', '').replace('http://', '').strip('/')
            api = params.get('path', [''])[0].strip().lstrip('/')
            token = self.headers.get('X-Canvas-Token', '').strip()
            if not host or not api or not token:
                return self._json({'error': 'Missing Canvas URL, path, or token.'}, 400)
            if not HOST_RE.match(host):
                return self._json({'error': 'That doesn\'t look like a valid Canvas domain.'}, 400)
            url = f"https://{host}/api/v1/{api}"
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as r:
                body = r.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            msg = 'Token rejected by Canvas (check the token).' if e.code in (401, 403) else f'Canvas returned {e.code}.'
            self._json({'error': msg}, e.code)
        except urllib.error.URLError as e:
            self._json({'error': f'Could not reach Canvas: {e.reason}. Check the school URL.'}, 502)
        except Exception as e:
            self._json({'error': str(e)}, 502)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Keep logs quiet and never echo query strings (defensive — token is in a header, not the URL).
        return

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == '__main__':
    with Server(("", PORT), Handler) as httpd:
        print(f"Ante server + Canvas proxy running on http://localhost:{PORT}")
        httpd.serve_forever()
