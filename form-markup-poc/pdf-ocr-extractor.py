#!/usr/bin/env python3
"""
PDF OCR Text Extractor
Extracts text from PDF pages using EasyOCR (neural network-based) with bounding box coordinates.

Usage:
  python pdf-ocr-extractor.py <input.pdf>

Output: JSON with text regions and coordinates
  {
    "status": "success",
    "total_pages": 1,
    "pages": [
      {
        "page": 1,
        "text_regions": [
          {"text": "Resident", "x": 100, "y": 150, "width": 80, "height": 20, "confidence": 95}
        ]
      }
    ]
  }
"""

import sys
import json
import argparse
from pathlib import Path

try:
    import easyocr
    print("[ocr-extractor] Using EasyOCR for text extraction", file=sys.stderr)
except ImportError:
    print("[ocr-extractor] easyocr not found, attempting to install...", file=sys.stderr)
    import subprocess
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'easyocr', '--break-system-packages', '--quiet'])
        import easyocr
        print("[ocr-extractor] easyocr installed successfully", file=sys.stderr)
    except Exception as e:
        print(f"[ocr-extractor] ERROR: Could not install easyocr: {e}", file=sys.stderr)
        print(f"[ocr-extractor] Please install manually: pip install easyocr", file=sys.stderr)
        sys.exit(1)

try:
    from pdf2image import convert_from_path
except ImportError:
    print("[ocr-extractor] pdf2image not found, attempting to install...", file=sys.stderr)
    import subprocess
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pdf2image', '--quiet'])
        from pdf2image import convert_from_path
        print("[ocr-extractor] pdf2image installed successfully", file=sys.stderr)
    except Exception as e:
        print(f"[ocr-extractor] ERROR: Could not install pdf2image: {e}", file=sys.stderr)
        print(f"[ocr-extractor] Please install manually: pip install pdf2image", file=sys.stderr)
        sys.exit(1)


def extract_text_with_coordinates(pdf_path):
    """
    Extract text from PDF pages with bounding box coordinates.

    Args:
        pdf_path: Path to input PDF file

    Returns:
        dict: Pages with text regions containing text and coordinates
    """
    try:
        print(f"[ocr-extractor] Converting PDF to images: {pdf_path}", file=sys.stderr)

        # Explicitly specify Poppler path (Windows installation)
        poppler_path = r"C:\poppler\poppler-26.02.0\Library\bin"

        # Convert PDF to images (one image per page)
        # Pass poppler_path explicitly to avoid PATH issues
        images = convert_from_path(pdf_path, dpi=150, poppler_path=poppler_path)
        print(f"[ocr-extractor] Converted {len(images)} pages to images", file=sys.stderr)

        # Initialize EasyOCR reader (loads model on first use)
        print(f"[ocr-extractor] Initializing EasyOCR reader...", file=sys.stderr)
        reader = easyocr.Reader(['en'], gpu=False)

        pages = []

        for page_num, image in enumerate(images, start=1):
            print(f"[ocr-extractor] Extracting text from page {page_num}/{len(images)}...", file=sys.stderr)

            try:
                # Run EasyOCR on the image
                results = reader.readtext(image, detail=1)  # detail=1 gives us bounding boxes

                text_regions = []

                # Extract bounding boxes and text from EasyOCR results
                # Each result is (bbox, text, confidence) where bbox is [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                for (bbox, text, confidence) in results:
                    if not text or confidence < 0.3:
                        continue

                    # bbox is [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] - convert to x,y,width,height
                    x_coords = [point[0] for point in bbox]
                    y_coords = [point[1] for point in bbox]
                    x = min(x_coords)
                    y = min(y_coords)
                    width = max(x_coords) - x
                    height = max(y_coords) - y

                    region = {
                        'text': text.strip(),
                        'x': int(x),
                        'y': int(y),
                        'width': int(width),
                        'height': int(height),
                        'confidence': int(confidence * 100)  # Convert to 0-100 scale
                    }
                    text_regions.append(region)

                print(f"[ocr-extractor] Page {page_num}: Found {len(text_regions)} text regions", file=sys.stderr)

                pages.append({
                    'page': page_num,
                    'text_regions': text_regions
                })

            except Exception as e:
                import traceback
                error_msg = str(e)
                tb = traceback.format_exc()
                print(f"[ocr-extractor] Warning: Error extracting page {page_num}: {error_msg}", file=sys.stderr)
                print(f"[ocr-extractor] Traceback: {tb}", file=sys.stderr)
                pages.append({
                    'page': page_num,
                    'text_regions': []
                })

        return {
            'status': 'success',
            'total_pages': len(images),
            'pages': pages
        }

    except Exception as e:
        print(f"[ocr-extractor] ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {
            'status': 'error',
            'error': str(e)
        }


def main():
    parser = argparse.ArgumentParser(description='Extract text from PDF with coordinates using EasyOCR')
    parser.add_argument('pdf_path', help='Path to input PDF file')

    args = parser.parse_args()

    # Check if file exists
    pdf_path = args.pdf_path
    if not Path(pdf_path).exists():
        print(f"[ocr-extractor] ERROR: File not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[ocr-extractor] Starting OCR extraction: {pdf_path}", file=sys.stderr)

    result = extract_text_with_coordinates(pdf_path)

    # Output as JSON to stdout
    print(json.dumps(result, indent=2))

    if result.get('status') == 'success':
        print(f"[ocr-extractor] ✓ OCR extraction completed successfully", file=sys.stderr)
        sys.exit(0)
    else:
        print(f"[ocr-extractor] ✗ OCR extraction failed: {result.get('error')}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
