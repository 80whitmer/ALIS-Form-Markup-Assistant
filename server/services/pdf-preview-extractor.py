#!/usr/bin/env python3
"""
PDF Preview Extractor
Extracts a cropped region from a PDF page and renders it as PNG.
Outputs base64-encoded PNG to stdout for embedding or storage.

Usage:
  python pdf-preview-extractor.py <pdf_path> <page_num> <crop_x> <crop_y> <crop_width> <crop_height>

Output: Base64-encoded PNG image data
"""

import sys
import subprocess
from pathlib import Path

# Try to import pdf2image
try:
    from pdf2image import convert_from_path
except ImportError:
    print("[preview] pdf2image not found, attempting to install...", file=sys.stderr)
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pdf2image', 'pillow', '--quiet'])
        from pdf2image import convert_from_path
        print("[preview] pdf2image installed successfully", file=sys.stderr)
    except Exception as e:
        print(f"[preview] ERROR: Could not install pdf2image: {e}", file=sys.stderr)
        sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("[preview] Pillow not found, attempting to install...", file=sys.stderr)
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pillow', '--quiet'])
        from PIL import Image
        print("[preview] Pillow installed successfully", file=sys.stderr)
    except Exception as e:
        print(f"[preview] ERROR: Could not install pillow: {e}", file=sys.stderr)
        sys.exit(1)

import base64
import io


def extract_preview(pdf_path, page_num, crop_x, crop_y, crop_width, crop_height, dpi=150):
    """
    Extract a cropped preview image from a PDF page.

    Args:
        pdf_path: Path to PDF file
        page_num: Page number (1-indexed)
        crop_x: X coordinate of crop region (points)
        crop_y: Y coordinate of crop region (points)
        crop_width: Width of crop region (points)
        crop_height: Height of crop region (points)
        dpi: DPI for rendering (default 150)

    Returns:
        str: Base64-encoded PNG image data
    """
    try:
        # Check if file exists
        if not Path(pdf_path).exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        # Set Poppler path for Windows if it exists
        poppler_path = None
        windows_poppler = Path('C:\\poppler\\poppler-26.02.0\\Library\\bin')
        if windows_poppler.exists():
            poppler_path = str(windows_poppler)
            print(f"[preview] Using Poppler at {poppler_path}", file=sys.stderr)

        # Convert PDF page to image at specified DPI
        print(f"[preview] Converting page {page_num} at {dpi} DPI...", file=sys.stderr)
        images = convert_from_path(
            pdf_path,
            first_page=page_num,
            last_page=page_num,
            dpi=dpi,
            poppler_path=poppler_path
        )

        if not images:
            raise ValueError(f"Could not render page {page_num}")

        image = images[0]
        print(f"[preview] Rendered image size: {image.size}", file=sys.stderr)

        # Convert points to pixels at the DPI we rendered at
        # 72 points per inch, we're rendering at `dpi` DPI
        scale = dpi / 72.0
        px_x = int(crop_x * scale)
        px_width = int(crop_width * scale)
        px_height = int(crop_height * scale)

        # PDF coordinates have origin at BOTTOM-LEFT, image coordinates at TOP-LEFT
        # Convert Y coordinate by inverting it based on the rendered image height
        # image_y_from_top = image_height_pixels - pdf_y_from_bottom - height
        px_y = int(image.height - (crop_y * scale) - px_height)

        # Ensure crop region is within image bounds
        px_x = max(0, px_x)
        px_y = max(0, px_y)
        px_width = min(px_width, image.width - px_x)
        px_height = min(px_height, image.height - px_y)

        print(f"[preview] PDF coords: x={crop_x:.0f}, y={crop_y:.0f}, w={crop_width:.0f}, h={crop_height:.0f}", file=sys.stderr)
        print(f"[preview] Pixel coords: x={px_x}, y={px_y}, w={px_width}, h={px_height} (image h={image.height})", file=sys.stderr)
        print(f"[preview] Cropping region: ({px_x}, {px_y}, {px_x + px_width}, {px_y + px_height})", file=sys.stderr)

        # Crop the image
        cropped = image.crop((px_x, px_y, px_x + px_width, px_y + px_height))

        # Convert to PNG and encode as base64
        png_buffer = io.BytesIO()
        cropped.save(png_buffer, format='PNG')
        png_data = png_buffer.getvalue()

        base64_encoded = base64.b64encode(png_data).decode('utf-8')
        print(f"[preview] Generated {len(base64_encoded)} bytes of base64 PNG data", file=sys.stderr)

        return base64_encoded

    except Exception as e:
        print(f"[preview] ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise


def main():
    if len(sys.argv) != 7:
        print("[preview] ERROR: Requires 6 arguments: pdf_path page_num crop_x crop_y crop_width crop_height", file=sys.stderr)
        sys.exit(1)

    try:
        pdf_path = sys.argv[1]
        page_num = int(sys.argv[2])
        crop_x = float(sys.argv[3])
        crop_y = float(sys.argv[4])
        crop_width = float(sys.argv[5])
        crop_height = float(sys.argv[6])

        base64_data = extract_preview(pdf_path, page_num, crop_x, crop_y, crop_width, crop_height)
        print(base64_data)
        sys.exit(0)

    except Exception as e:
        print(f"[preview] FATAL: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
