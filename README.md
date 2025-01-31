# Sprite Sheet Viewer and Converter

A web-based tool for viewing and converting sprite sheet atlas files. Supports both TexturePacker's JSON Hash format and Final Parsec's sprite sheet format, with export capabilities to Phaser-compatible JSON.

![Sprite Sheet Viewer Dark Mode](screenshot1.png)
*Dark mode view showing frame highlighting and dimensions*

![Sprite Sheet Viewer Light Mode](screenshot2.png)
*Light mode view with Final Parsec JSON loaded*

## Features

- View sprite sheet frames with interactive overlays
- Display frame dimensions and filenames on hover
- Convert Final Parsec JSON format to Phaser/TexturePacker format
- Dark/Light mode with system preference detection
- Runs entirely in browser - no server uploads
- Responsive design for all screen sizes

## Quick Start

### Using Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# Or build and run manually
docker build -t sprite-sheet-viewer .
docker run -p 4173:4173 sprite-sheet-viewer