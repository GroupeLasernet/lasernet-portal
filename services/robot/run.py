#!/usr/bin/env python3
"""
Elfin Cobot Studio – Launcher

Usage:
    python run.py                    # Start on default port 8080
    python run.py --port 9000        # Custom port
    python run.py --host 127.0.0.1   # Localhost only
"""
import argparse
import os
import sys
import webbrowser
import threading

# Ensure project root is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from config import SERVER_HOST, SERVER_PORT


def open_browser(port):
    """Open the default browser after a short delay."""
    import time
    time.sleep(1.5)
    webbrowser.open(f"http://127.0.0.1:{port}")


def main():
    parser = argparse.ArgumentParser(description="Elfin Cobot Studio")
    parser.add_argument("--host", default=SERVER_HOST, help="Bind address")
    parser.add_argument("--port", type=int, default=SERVER_PORT, help="Port number")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser")
    args = parser.parse_args()

    print(r"""
    ╔══════════════════════════════════════════════╗
    ║         ELFIN COBOT STUDIO  v1.0             ║
    ║         Elfin Pro E03 Controller             ║
    ╠══════════════════════════════════════════════╣
    ║  Open your browser at:                       ║
    ║  http://127.0.0.1:{:<5}                      ║
    ╚══════════════════════════════════════════════╝
    """.format(args.port))

    if not args.no_browser:
        threading.Thread(target=open_browser, args=(args.port,), daemon=True).start()

    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
