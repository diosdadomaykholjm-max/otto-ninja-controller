"""
Servidor HTTP simple para Otto Controller
Requiere Python 3.x
"""

import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Habilitar CORS para permitir conexiones al ESP32
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        # Personalizar logs
        print(f"[{self.log_date_time_string()}] {format % args}")

# Cambiar al directorio del script
os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
    print("=" * 40)
    print("OTTO NINJA Controller - Servidor Python")
    print("=" * 40)
    print(f"Servidor corriendo en: http://localhost:{PORT}")
    print("Presiona Ctrl+C para detener")
    print("=" * 40)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
