#!/usr/bin/env python3
"""
PDF OCR Text Extractor
Extracts text from PDF pages using Tesseract OCR with bounding box coordinates.

Usage:
  python pdf-ocr-extractor.py <input.pdf>

Output: JSON with text regions and coordinates
  {
    "pages": [
      {
        "page": 1,
        "text_regions": [
          {"text": "Resident", "x": 100, "y": 150, "width": 80, "height": 20}
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
    import pytesseract
    from pytesseract import Output
except ImportError:
    print("[ocr-extractor] pytesseract not found, attempting to install...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pytesseract', '--quiet'])
        import pytesseract
        from pytesseract import Output
        print("[ocr-extractor] pytesseract installed successfully")
    except Exception as e:
        print(f"[ocr-extractor] ERROR: Could not install pytesseract: {e}")
        print(f"[ocr-extractor] Please install manually: pip install pytesseract")
        print(f"[ocr-extractor] Also install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki")
        sys.exit(1)

try:
    from pdf2image import convert_from_path
except ImportError:
    print("[ocr-extractor] pdf2image not found, attempting to install...")
    import subprocess
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pdf2image', '--quiet'])
        from pdf2image import convert_from_path
        print("[ocr-extractor] pdf2image installed successfully")
    except Exception as e:
        print(f"[ocr-extractor] ERROR: Could not install pdf2image: {e}")
        print(f"[ocr-extractor] Please install manually: pip install pdf2image")
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
        print(f"[ocr-extractor] Converting PDF to images: {pdf_path}")

        # Convert PDF to images (one image per page)
        images = convert_from_path(pdf_path, dpi=150)
        print(f"[ocr-extractor] Converted {len(images)} pages to images")

        pages = []

        for page_num, image in enumerate(images, start=1):
            print(f"[ocr-extractor] Extracting text from page {page_num}/{len(images)}...")

            try:
                # Extract text with detailed data (includes coordinates)
                data = pytesseract.image_to_data(image, output_type=Output.DICT)

                text_regions = []

                # Extract bounding boxes and text
                for i in range(len(data['text'])):
                    text = data['text'][i].strip()
                    conf = int(data['conf'][i])

                    # Skip empty text or very low confidence
                    if not text or conf < 30:
                        continue

                    region = {
                        'text': text,
                        'x': int(data['left'][i]),
                        'y': int(data['top'][i]),
                        'width': int(data['width'][i]),
                        'height': int(data['height'][i]),
                        'confidence': conf
                    }
                    text_regions.append(region)

                print(f"[ocr-extractor] Page {page_num}: Found {len(text_regions)} text regions")

                pages.append({
                    'page': page_num,
                    'text_regions': text_regions
                })

            except Exception as e:
                print(f"[ocr-extractor] Warning: Error extracting page {page_num}: {e}")
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
        print(f"[ocr-extractor] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'status': 'error',
            'error': str(e)
        }


def main():
    parser = argparse.ArgumentParser(description='Extract text from PDF with coordinates using Tesseract OCR')
    parser.add_argument('pdf_path', help='Path to input PDF file')

    args = parser.parse_args()

    # Check if file exists
    pdf_path = args.pdf_path
    if not Path(pdf_path).exists():
        print(f"[ocr-extractor] ERROR: File not found: {pdf_path}")
        sys.exit(1)

    print(f"[ocr-extractor] Starting OCR extraction: {pdf_path}")

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
