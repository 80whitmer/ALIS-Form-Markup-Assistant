# ALIS Form Markup - Smart Detection PoC

A Node.js proof-of-concept for intelligently detecting form fields in Tungsten/Kofax-marked PDFs, extracting nearby text labels via OCR, matching them to ALIS field codes, and generating complete property suggestions.

---

## 🚩 Problem Statement
Currently, when clients submit pre-marked PDFs (with text boxes and signature fields already drawn), the ALIS markup automation requires manual clicking into each field to set properties:
* **Field name** (ALIS code)
* **Hover text**
* **Read-only status**
* **Required status**
* **Font, color, size**

This is **tedious and error-prone** for 20+ field forms. This PoC automates the detection and suggestion process to reduce manual work from **20+ minutes to 5-10 minutes**.

---

## 🏗 Architecture

### Four-Phase Pipeline

[Image of a flowchart showing PDF Input leading to Field Detection, Label Extraction, Code Matching, and Property Suggestion]

```mermaid
graph TD
    A[PDF Input] --> B[Phase 1: Field Detection]
    B -->|pdf-lib| C[Phase 2: Label Extraction]
    C -->|Tesseract.js OCR| D[Phase 3: Code Matching]
    D -->|Fuse.js fuzzy matching| E[Phase 4: Property Suggestion]
    E --> F[JSON Output + User Review]
