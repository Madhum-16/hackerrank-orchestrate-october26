#!/usr/bin/env python3
"""
Ghost Data Still Exists — AI-powered Deletion Audit Agent (Python Entry Point)
"""

import os
import subprocess
import sys

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js_main = os.path.join(repo_root, "code", "main.js")
    
    # Run the Node.js audit engine
    try:
        res = subprocess.run(["node", js_main], cwd=repo_root, check=True)
        sys.exit(res.returncode)
    except Exception as e:
        print(f"Error executing Node.js audit runner: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
