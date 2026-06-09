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
import numpy as np
import concurrent.futures
from pathlib import Path

# ── Dependency bootstrap ──────────────────────────────────────────────────────
import subprocess

def _ensure(pkg, import_name=None):
    name = import_name or pkg
    try:
        return __import__(name)
    except ImportError:
        print(f"[ocr-extractor] {pkg} not found, attempting to install...", file=sys.stderr)
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', pkg, '--quiet'])
            return __import__(name)
        except Exception as e:
            print(f"[ocr-extractor] ERROR: Could not install {pkg}: {e}", file=sys.stderr)
            sys.exit(1)

_ensure('easyocr')
_ensure('pdf2image')
_ensure('pymupdf', 'fitz')

import easyocr
import fitz  # pymupdf — fast embedded-text extraction
from pdf2image import convert_from_path


# ── Embedded-text extraction (fast path) ─────────────────────────────────────

def _extract_embedded_text(pdf_path):
    """
    Extract text directly from the PDF's embedded text layer using pymupdf.
    Returns None if the PDF has no usable embedded text (i.e. it's a scanned image).
    Otherwise returns the same pages/text_regions structure that OCR would produce,
    with coordinates scaled to match 150 DPI image space.
    """
    DPI = 150
    SCALE = DPI / 72.0  # PDF points → pixel coords at 150 DPI

    try:
        doc = fitz.open(pdf_path)
        pages = []
        total_regions = 0

        for page_num, page in enumerate(doc, start=1):
            blocks = page.get_text("words")  # (x0, y0, x1, y1, word, block_no, line_no, word_no)
            text_regions = []
            for b in blocks:
                x0, y0, x1, y1, word = b[0], b[1], b[2], b[3], b[4]
                word = word.strip()
                if not word:
                    continue
                text_regions.append({
                    'text': word,
                    'x': int(x0 * SCALE),
                    'y': int(y0 * SCALE),
                    'width': int((x1 - x0) * SCALE),
                    'height': int((y1 - y0) * SCALE),
                    'confidence': 99,  # embedded text = effectively certain
                })
            total_regions += len(text_regions)
            pages.append({'page': page_num, 'text_regions': text_regions})

        doc.close()

        # If almost no text was found, this is likely a scanned PDF — fall back to OCR
        avg_regions_per_page = total_regions / max(len(pages), 1)
        if avg_regions_per_page < 2:
            print(f"[ocr-extractor] Embedded text too sparse ({total_regions} regions across {len(pages)} pages) — falling back to OCR", file=sys.stderr)
            return None

        print(f"[ocr-extractor] Embedded text extracted: {total_regions} regions across {len(pages)} pages (no OCR needed)", file=sys.stderr)
        return {'status': 'success', 'total_pages': len(pages), 'pages': pages, 'method': 'embedded'}

    except Exception as e:
        print(f"[ocr-extractor] Embedded text extraction failed ({e}), falling back to OCR", file=sys.stderr)
        return None


# ── Per-page OCR worker (runs in a subprocess worker process) ─────────────────

# Module-level reader cache so each worker process initialises EasyOCR only once
_reader_cache = None

def _ocr_page(args):
    """
    Worker function: OCR a single page image.
    args = (page_num, total_pages, image_array)
    Returns (page_num, text_regions).
    """
    global _reader_cache
    page_num, total_pages, image_array = args

    if _reader_cache is None:
        # Detect GPU once per worker
        try:
            import torch
            use_gpu = torch.cuda.is_available()
        except Exception:
            use_gpu = False
        _reader_cache = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)

    print(f"[ocr-extractor] Extracting text from page {page_num}/{total_pages}...", file=sys.stderr)
    results = _reader_cache.readtext(image_array, detail=1)

    text_regions = []
    for (bbox, text, confidence) in results:
        if not text or confidence < 0.3:
            continue
        x_coords = [p[0] for p in bbox]
        y_coords = [p[1] for p in bbox]
        x = min(x_coords)
        y = min(y_coords)
        text_regions.append({
            'text': text.strip(),
            'x': int(x),
            'y': int(y),
            'width': int(max(x_coords) - x),
            'height': int(max(y_coords) - y),
            'confidence': int(confidence * 100),
        })

    print(f"[ocr-extractor] Page {page_num}: Found {len(text_regions)} text regions", file=sys.stderr)
    return page_num, text_regions


# ── OCR extraction (slow path, parallel) ─────────────────────────────────────

def _extract_ocr(pdf_path):
    """
    Convert PDF pages to images and run EasyOCR in parallel across all pages.
    Uses a ThreadPoolExecutor — EasyOCR releases the GIL during torch inference,
    giving meaningful parallelism without the overhead of spawning new processes.
    """
    POPPLER_PATH = r"C:\poppler\poppler-26.02.0\Library\bin"
    DPI = 100  # 100 dpi is plenty for signer-label words; 150 was unnecessarily slow

    print(f"[ocr-extractor] Converting PDF to images (dpi={DPI})...", file=sys.stderr)
    images = convert_from_path(pdf_path, dpi=DPI, poppler_path=POPPLER_PATH)
    total = len(images)
    print(f"[ocr-extractor] Converted {total} pages to images", file=sys.stderr)

    # Detect GPU once in the main process for logging
    try:
        import torch
        use_gpu = torch.cuda.is_available()
    except Exception:
        use_gpu = False

    print(f"[ocr-extractor] Initializing EasyOCR reader (gpu={use_gpu})...", file=sys.stderr)
    reader = easyocr.Reader(['en'], gpu=use_gpu, verbose=False)

    # Build task list — convert images to numpy arrays up-front
    tasks = [(i + 1, total, np.array(img)) for i, img in enumerate(images)]

    # Run pages in parallel with threads (EasyOCR/torch releases GIL during inference)
    max_workers = min(4, total)
    print(f"[ocr-extractor] Processing {total} pages with {max_workers} parallel workers...", file=sys.stderr)

    page_results = [None] * total

    def _run_page(args):
        page_num, total_pages, image_array = args
        print(f"[ocr-extractor] Extracting text from page {page_num}/{total_pages}...", file=sys.stderr)
        results = reader.readtext(image_array, detail=1)
        text_regions = []
        for (bbox, text, confidence) in results:
            if not text or confidence < 0.3:
                continue
            x_coords = [p[0] for p in bbox]
            y_coords = [p[1] for p in bbox]
            x = min(x_coords)
            y = min(y_coords)
            text_regions.append({
                'text': text.strip(),
                'x': int(x),
                'y': int(y),
                'width': int(max(x_coords) - x),
                'height': int(max(y_coords) - y),
                'confidence': int(confidence * 100),
            })
        print(f"[ocr-extractor] Page {page_num}: Found {len(text_regions)} text regions", file=sys.stderr)
        return page_num, text_regions

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_run_page, t): t[0] for t in tasks}
        for future in concurrent.futures.as_completed(futures):
            try:
                page_num, regions = future.result()
                page_results[page_num - 1] = {'page': page_num, 'text_regions': regions}
            except Exception as e:
                pn = futures[future]
                print(f"[ocr-extractor] Warning: Error on page {pn}: {e}", file=sys.stderr)
                page_results[pn - 1] = {'page': pn, 'text_regions': []}

    pages = [p for p in page_results if p is not None]
    return {'status': 'success', 'total_pages': total, 'pages': pages, 'method': 'ocr'}


# ── Main entry point ──────────────────────────────────────────────────────────

def extract_text_with_coordinates(pdf_path):
    """
    Extract text from PDF pages with bounding box coordinates.

    Fast path: if the PDF has an embedded text layer (most digital forms do),
    pymupdf reads it directly in milliseconds — no image conversion, no OCR.

    Slow path: if the PDF is a scanned image, fall back to parallel EasyOCR
    at 100 DPI with up to 4 concurrent page workers.
    """
    # Fast path — try embedded text first
    result = _extract_embedded_text(pdf_path)
    if result is not None:
        return result

    # Slow path — parallel OCR
    try:
        return _extract_ocr(pdf_path)
    except Exception as e:
        print(f"[ocr-extractor] ERROR: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return {'status': 'error', 'error': str(e)}


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
