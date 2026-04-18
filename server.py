#!/usr/bin/env python3
"""
Local preview server for the Pyle Plan Builder static site.
Serves index.html, dashboard.html, samples/, and api/ stubs.

Usage: python3 .server.py [port]
  default port: 5173
"""
import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    # No-cache headers so edits are immediately visible on refresh
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    # Vercel-style cleanUrls: map /dashboard -> /dashboard.html
    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path and "." not in os.path.basename(path):
            candidate = path.lstrip("/") + ".html"
            if os.path.exists(os.path.join(ROOT, candidate)):
                self.path = "/" + candidate
        return super().do_GET()

    def log_message(self, format, *args):
        # Cleaner single-line logs to stdout
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), format % args))
        sys.stdout.flush()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Pyle Plan Builder preview server")
        print(f"Serving {ROOT}")
        print(f"http://127.0.0.1:{PORT}/")
        sys.stdout.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
