"""CLI entry point for nexus-memory."""

import argparse
import sys

def main():
    parser = argparse.ArgumentParser(prog="nexus-memory", description="Nexus decision memory server")
    subparsers = parser.add_subparsers(dest="command")
    
    init_parser = subparsers.add_parser("init", help="Initialize a new Nexus project")
    init_parser.add_argument("name", nargs="?", default=".", help="Project directory name")
    init_parser.add_argument("--port", type=int, default=3100, help="Server port")
    
    subparsers.add_parser("start", help="Start the Nexus server")
    subparsers.add_parser("stop", help="Stop the Nexus server")
    
    args = parser.parse_args()
    
    if args.command == "init":
        from .server import NexusServer
        server = NexusServer(port=args.port)
        print(f"Starting Nexus in {args.name}...")
        server.start()
        print(f"Nexus is running on http://localhost:{args.port}")
        print(f"API Key: {server.api_key}")
        try:
            server._process.wait()
        except KeyboardInterrupt:
            server.stop()
    elif args.command == "start":
        from .server import NexusServer
        server = NexusServer()
        server.start()
        print(f"Nexus started on http://localhost:{server.port}")
    elif args.command == "stop":
        print("Stop not implemented — use Ctrl+C on the running process")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
