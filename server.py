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

PORT = 3847
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
HOST_RE = re.compile(r'^[A-Za-z0-9.-]+$')  # plain domain only — no scheme, no path

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=DIRECTORY, **k)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'X-Canvas-Token')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/__canvas'):
            return self.handle_canvas()
        return super().do_GET()

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
