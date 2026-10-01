# StockScanner: Institutional AAOIFI Shariah-Screening & Financial-Audit Engine
## Comprehensive System Architecture, Mathematical Formulations, Implementation Decisions, and Validation Specifications

---

## 1. Executive Overview and Core Directives

StockScanner is an institutional-grade financial analysis, balance-sheet reconciliation, and Shariah-compliance screening engine developed specifically for equities listed on the Dhaka Stock Exchange (DSE). The platform evaluates corporate filings under Accounting and Auditing Organization for Islamic Financial Institutions (AAOIFI) Shari'ah Standard No. 21 ("Financial Paper — Shares and Bonds").

The architecture is built upon five non-negotiable operational principles:

1. **Immutable Source of Truth**: The original PDF uploaded by an auditor or analyst is treated as an immutable primary record. Once uploaded, the file is hashed using cryptographic SHA-256 and stored in an append-only directory hierarchy. Every normalized fact stored in the database retains complete provenance linking back to the document hash, source page number, raw text string, bounding box coordinates, and extraction confidence score.
2. **Strict AI Boundary**: Large Language Model capabilities (via the Google GenAI SDK) are restricted exclusively to visual OCR, tabular layout interpretation, and semantic concept mapping. The AI model is strictly prohibited from executing arithmetic calculations, computing financial ratios, or rendering compliance decisions. All financial mathematics, threshold evaluations, and balance-sheet checks are computed deterministically in JavaScript.
3. **Zero Fallback / Explicit Halt Discipline**: The system rejects probabilistic imputation. If a mandatory accounting metric (such as Total Assets, Total Revenue, or Borrowings) cannot be identified with high confidence, the system halts execution and raises a descriptive error (`MISSING_REQUIRED_FACT`). It never defaults to zero, interpolates from industry averages, or skips missing items.
4. **Deterministic Accounting Verification**: Financial statements must reconcile according to core accounting principles before any Shariah screening ratios are evaluated. Specifically, the Balance Sheet must satisfy Assets = Liabilities + Equity within a strict rounding tolerance (1.00 BDT). Failure halts the pipeline immediately (`ACCOUNTING_EQUATION_MISMATCH`).
5. **Pure Node.js Runtime Architecture**: The entire stack operates within a unified Node.js / TypeScript environment. The platform avoids Python runtimes, external queue daemons (Celery, Redis), and complex multi-container requirements. It utilizes native Node.js libraries (`pdfjs-dist`, `@napi-rs/canvas`, `sharp`, `@google/genai`, Prisma ORM with SQLite, and React 19).

---

## 2. Technology Stack Evaluation and Architectural Decisions

### 2.1 Backend Runtime: Pure Node.js vs. Python

Financial extraction pipelines frequently default to Python due to libraries such as PyMuPDF (fitz), pdfplumber, and Pandas. During system design, a pure Node.js architecture was selected for several engineering reasons:

1. **Elimination of Multi-Runtime Overhead**: Deploying and maintaining Python microservices alongside a Node.js API requires inter-process communication (REST/gRPC), separate dependency trees (pip vs npm), separate virtual environments, and substantial Docker image bloat.
2. **Mozilla's Native PDF Engine (`pdfjs-dist`)**: Mozilla's `pdfjs-dist` is the production standard for rendering PDF specifications. When coupled with `@napi-rs/canvas` (Rust-based Skia canvas bindings), Node.js renders high-resolution raster images of complex accounting tables with identical fidelity and lower memory usage than Python's PyMuPDF.
3. **High-Performance Image Operations (`sharp`)**: `sharp` wraps the libvips C++ library, providing faster image resizing, format conversions, and metadata queries than Python's Pillow.
4. **Official Node.js Google GenAI SDK**: Google provides first-class support for Gemini models via `@google/genai`, offering full schema enforcement and streaming capabilities directly in Node.js.

### 2.2 Database and Queue: SQLite and Database-Driven Worker Loop

Rather than introducing Redis and BullMQ, StockScanner utilizes a SQLite database managed via Prisma ORM:

1. **Prisma ORM with SQLite**: SQLite provides zero-configuration local persistence, ACID transaction guarantees, and sub-millisecond query performance for desktop and server workloads. Prisma delivers typed models and schema migrations.
2. **`ExtractionJob` Queue Pattern**: The background worker polls the `ExtractionJob` SQLite table every 3 seconds for pending records (`status = 'PENDING'`). Upon acquiring a job, the record is transitioned to `PROCESSING` with timestamp tracking and attempt counters. Completed tasks transition to `COMPLETED` or `FAILED`. This achieves asynchronous background processing without external infrastructure dependencies.

### 2.3 Frontend Framework: React 19, Vite, and Tailwind CSS

1. **React 19 with TypeScript**: Provides strict typing across all screening models, financial facts, and API responses.
2. **Vite**: Powers development with sub-second Hot Module Replacement (HMR) and production builds compiling in approximately 2 seconds.
3. **Tailwind CSS v4 & Lucide Icons**: Implements a dark, institutional-themed workstation featuring color-coded status badges, micro-animations, progress meters, and tabular layouts.

---

## 3. Data Model Architecture (Prisma Schema)

The database schema (`Backend/prisma/schema.prisma`) comprises 10 relational entities designed to preserve data provenance and calculation history:

### 3.1 `Company`
Stores company identities, exchange tickers, sector classifications, capital structure, and exchange metadata:
- `id`: CUID unique identifier.
- `dseSymbol`: Unique trading ticker on the Dhaka Stock Exchange (e.g., `GP`, `SQURPHARMA`, `MARICO`).
- `name`: Full legal corporate name.
- `sector`: Industrial sector (e.g., `PharmaChem`, `Telecom`, `FMCG`, `Engineering`).
- `fiscalYearEnd`: Month of fiscal year closure (`June`, `December`, `March`).
- `totalShares`: Total outstanding securities reported by DSE (stored as `BigInt`).
- `paidUpCapMn`: Paid-up capital in millions BDT.
- `authorizedCapMn`: Authorized capital in millions BDT.
- `faceValue`: Nominal value per share (default 10.00 BDT).
- `operationalStatus`: Exchange listing status (`Active`).

### 3.2 `FinancialPeriod`
Represents the temporal window of an accounting filing:
- `companyId`: Foreign key reference to `Company`.
- `periodType`: Statement duration (`ANNUAL`, `Q1`, `Q2`, `Q3`, `H1`).
- `periodMonths`: Duration in months (3, 6, 9, or 12).
- `isAudited`: Boolean indicating statutory audit status (true for Annual reports, false for quarterly filings).
- `periodStart` and `periodEnd`: Start and balance sheet reporting dates.
- `fiscalYear`: Financial year label (e.g., `2024-2025` or `2026-2027`).
- Unique compound constraint on `[companyId, periodType, periodEnd]`.

### 3.3 `Document`
Tracks uploaded physical PDF files:
- `storedFilePath`: Absolute server filesystem path (`uploads/reports/{symbol}/{year}/{hash}.pdf`).
- `fileHash`: Cryptographic SHA-256 digest of the PDF buffer, enforcing a unique constraint across all uploads to prevent duplicate processing.
- `totalPages`: Number of pages determined by `pdfjs-dist`.
- `status`: Lifecycle state (`UPLOADED`, `QUEUED`, `PROCESSING`, `EXTRACTED`, `FAILED`).
- `failureReason`: Explicit diagnostic message if processing encounters errors.

### 3.4 `DocumentPage`
Maintains page-level visual and content classification:
- `documentId`: Foreign key to `Document`.
- `pageNumber`: 1-indexed page sequence.
- `pageType`: Visual classification (`TEXT`, `SCANNED`, `MIXED`).
- `contentType`: Statement classification (`BALANCE_SHEET`, `INCOME_STATEMENT`, `CASH_FLOW`, `NOTES`, `OTHER`).
- `isRotated` & `rotationAngle`: Page rotation status (0, 90, 180, 270 degrees).
- `imagePath`: Filesystem path to the rendered 1.5x resolution PNG (`uploads/rendered/{docId}/page_{N}.png`).
- `rawTextPreview`: Initial text snippet extracted by `pdfjs-dist`.
- Compound unique constraint on `[documentId, pageNumber]`.

### 3.5 `ExtractionJob`
Coordinates asynchronous background processing:
- `documentId`: Target document reference.
- `status`: Job state (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
- `attempts`: Retry counter.
- `pagesProcessed`: Real-time page counter.
- `factsExtracted`: Total financial facts written to database.
- `startedAt` & `completedAt`: Process runtime tracking.

### 3.6 `RawFact`
Represents literal, unprocessed strings extracted from the PDF:
- `rawLabel`: Exact printed row description (e.g., "Cash and cash equivalents", "Revenue from contracts with customers").
- `rawValue`: Literal printed value string (e.g., `"1,743,186,382"`, `"(1,234.50)"`, `"১২,৩৪৫"`, `"-."`).
- `currencyRaw`: Currency symbol printed on page header (`BDT`, `Taka`, `৳`).
- `unitScaleRaw`: Unit magnitude printed on table header (`in thousands`, `in millions`, `crores`, `units`).
- `boundingBox`: JSON coordinates `{x, y, w, h}` locating the item on the rendered page canvas.
- `extractionMethod`: Extraction mechanism (`VISION_JSON_SCHEMA`, `TEXT_PARSE`).
- `confidenceScore`: Model confidence score (0.00 to 1.00).

### 3.7 `NormalizedFact`
Stores clean, scaled numerical amounts mapped to standard accounting concept codes:
- `rawFactId`: One-to-one foreign key to the originating `RawFact`.
- `conceptCode`: Normalized accounting identifier (e.g., `TOTAL_ASSETS`, `SHORT_TERM_LOANS_ON_INTEREST`, `OPERATING_REVENUE`).
- `normalizedValue`: Float amount scaled to base Bangladeshi Taka (BDT).
- `unitScale`: Numerical multiplier applied (1, 1000, 1000000, 10000000).
- `isFlaggedForReview`: Boolean flag raised when extraction confidence is below 0.80.
- `flagReason`: Diagnostic note explaining why manual verification is recommended.

### 3.8 `MarketData`
Tracks pricing and capitalization data points:
- `priceDate`: Timestamp of recorded quote.
- `closingPrice`: Stock price in BDT.
- `sharesOutstanding`: Total issued securities.
- `marketCap`: Calculated market capitalization (closingPrice * sharesOutstanding).
- `marketCap12mAvg`: 12-month rolling average market capitalization.
- `source`: Data origin (`DSE_LIVE`, `DSE_SCRAPED`, `MANUAL`).

### 3.9 `ScreeningResult`
Encapsulates an overall Shariah compliance determination:
- `overallStatus`: Final compliance verdict (`COMPLIANT`, `NON_COMPLIANT`, `INSUFFICIENT_DATA`).
- `purificationPerShare`: Mandatory dividend/share purification amount in BDT for the period.
- `purificationTtmPerShare`: Annualized Trailing Twelve Month purification figure.
- `methodologyNotes`: JSON-encoded documentation detailing data sources, accounting reconciliations, and rule decisions.

### 3.10 `ScreeningRatioDetail`
Maintains individual rule audit calculations:
- `aaoifiRule`: Standard rule reference (`3/4/2`, `3/4/3`, `3/4/4`).
- `viewType`: Calculation conservatism (`STRICT_AAOIFI` vs. `CONSERVATIVE`).
- `marketCapType`: Denominator basis (`PERIOD_DATE`, `SCREENING_DATE`, `AVERAGE_12M`).
- `numeratorValue`: Sum of qualifying items in base BDT.
- `numeratorBreakdown`: JSON dictionary detailing every contributing line item.
- `denominatorValue`: Applied denominator in base BDT.
- `denominatorSource`: Origin of denominator figure.
- `ratioValue`: Decimal ratio value (e.g., 0.0189).
- `ratioPercent`: Percentage ratio (e.g., 1.89%).
- `threshold`: Maximum permitted percentage (30.00% or 5.00%).
- `passes`: Boolean compliance result (`ratioPercent <= threshold`).
- `sourceFactIds`: JSON array of `NormalizedFact` IDs providing audit provenance.

---

## 4. Ingestion, PDF Inspection, and Rasterization Pipeline

The document ingestion workflow (`storage.service.js` and `pdf-inspector.service.js`) validates, inspects, and prepares PDF files through the following stages:

### 4.1 Storage and Deduplication
1. **Magic Byte Verification**: Inspects the first 5 bytes of the upload buffer to ensure they equal `%PDF-`. Files with misleading `.pdf` extensions that do not adhere to PDF specification are rejected before disk writes.
2. **Cryptographic Checksum**: Computes an SHA-256 hash across the entire buffer.
3. **Database Deduplication**: Queries `Document` for the computed hash. If found, ingestion terminates with an explicit duplicate notification, preventing duplicate records.
4. **Immutable Filesystem Storage**: Writes the file to `uploads/reports/{symbol}/{year}/{fileHash}.pdf` with write-exclusive flags (`wx`).

### 4.2 Page Inspection and High-Resolution Rasterization
1. **Loading PDF Context**: The buffer is loaded into `pdfjsLib.getDocument()`. The standard font URL parameter (`standardFontDataUrl`) is passed pointing to `node_modules/pdfjs-dist/standard_fonts/` to resolve TrueType font metrics without runtime warnings.
2. **Text Extraction & Classification**:
   - `page.getTextContent()` extracts raw text strings.
   - If extracted text length is less than 15 characters, the page is classified as `SCANNED`.
   - If between 15 and 80 characters, it is classified as `MIXED`.
   - If greater than 80 characters, it is classified as `TEXT`.
3. **Statement Classification**: Regular expression patterns scan page text for keywords:
   - Balance Sheet: matches "statement of financial position" or "balance sheet".
   - Income Statement: matches "profit or loss", "statement of comprehensive income", or "income statement".
   - Cash Flow: matches "cash flows" or "statement of cash flow".
   - Notes: matches "notes to the financial statements" or "summary of significant accounting".
4. **Orientation and Canvas Rendering**:
   - Mozilla's `pdfjs-dist` applies rotation transformations within `page.getViewport({ scale: 1.5 })`.
   - The system avoids secondary rotation in `sharp`, preventing double-rotation errors that turn upright portrait documents into landscape orientations.
   - The page is rendered at 1.5x resolution to an in-memory canvas using `@napi-rs/canvas` and saved as PNG (`uploads/rendered/{documentId}/page_{N}.png`).
5. **Job Queueing**: If financial pages are detected, an `ExtractionJob` is created with status `PENDING`, and the document status updates to `QUEUED`.

---

## 5. AI Semantic Extraction and Fact Normalization Engine

### 5.1 Gemini Model Selection and Configuration
The extraction engine (`config/gemini.js`) uses Google's `@google/genai` Node.js SDK configured with model `gemini-3.5-flash-lite`:
1. **Rationale**: Gemini 3.5 Flash-Lite provides multimodal visual processing capable of reading rendered table structures, merged headers, and fine notes print while operating within a 15 RPM / 500 RPD quota tier.
2. **Strict JSON Schema Enforcement**: The API call specifies `responseMimeType: "application/json"` with an explicit `responseSchema` defining required fields:
   - `pageClassification`: Enum (`BALANCE_SHEET`, `INCOME_STATEMENT`, `CASH_FLOW`, `NOTES`, `OTHER`).
   - `reportingDate`: String date representation.
   - `isConsolidated`: Boolean indicator.
   - `unitScale`: Enum (`units`, `thousands`, `millions`, `crores`).
   - `currency`: String (e.g., `BDT`).
   - `items`: Array of objects containing `rawLabel`, `rawText`, `suggestedConcept`, `isInterestBearing`, `confidenceScore`, `mappingReason`, and optional `boundingBox`.

### 5.2 Fact Normalization (`fact-normalizer.service.js`)
Extracted raw strings are converted into clean base-BDT numbers through deterministic rules:

1. **Bengali Numeral Conversion**: Characters `০` through `৯` are converted to standard ASCII characters `0` through `9`.
2. **Accounting Negatives**: Parentheses enclosing numbers (e.g., `(1,234.50)`) are converted to standard negative numbers (`-1234.50`).
3. **Accounting Zero / Nil Representations**:
   - In corporate reporting, absent or zero values are printed as dashes, dots, or nil indicators: `-`, `-.`, `—`, `–`, `- -`, `nil`, `None`, `N/A`.
   - If a string contains no numerical digits and matches zero/nil tokens, the normalizer resolves the value to `0.00` BDT instead of failing parsing.
4. **Currency and Punctuation Stripping**: Currency strings (`BDT`, `Tk`, `Taka`, `৳`, `$`) and formatting commas are stripped.
5. **Scale Multiplication**:
   - `crores` / `crore` / `কোটি` -> multiplied by 10,000,000.
   - `millions` / `million` / `mn` / `মিলিয়ন` -> multiplied by 1,000,000.
   - `lakhs` / `lakh` / `lac` / `লাখ` -> multiplied by 100,000.
   - `thousands` / `thousand` / `k` / `হাজার` -> multiplied by 1,000.
   - `units` -> multiplied by 1.
6. **Concept Code Dictionary**: Normalized items map to standard enumeration keys:
   - Assets: `TOTAL_ASSETS`, `CURRENT_ASSETS`, `NON_CURRENT_ASSETS`, `CASH_AND_EQUIVALENTS`, `FIXED_DEPOSITS`, `TERM_DEPOSITS`.
   - Liabilities: `TOTAL_LIABILITIES`, `CURRENT_LIABILITIES`, `NON_CURRENT_LIABILITIES`, `SHORT_TERM_LOANS_ON_INTEREST`, `LONG_TERM_LOANS_ON_INTEREST`, `FINANCE_LEASE_LIABILITIES`, `OPERATING_LEASE_LIABILITIES`.
   - Equity: `TOTAL_EQUITY`, `SHARE_CAPITAL`, `RETAINED_EARNINGS`.
   - Revenue & Income: `OPERATING_REVENUE`, `TOTAL_REVENUE`, `FINANCE_INCOME`, `INTEREST_INCOME`, `OTHER_INCOME`.

---

## 6. Deterministic Accounting Verification Layer

Before Shariah screening, data integrity is verified using the fundamental accounting equation (`accounting-equation.js`):

$$\text{Total Assets} = \text{Total Liabilities} + \text{Total Equity}$$

### 6.1 Validation Rules
1. **Absolute Difference Check**:
   $$\Delta = |\text{Total Assets} - (\text{Total Liabilities} + \text{Total Equity})|$$
   If $\Delta > 1.00\text{ BDT}$, the validation fails with `ACCOUNTING_EQUATION_MISMATCH`.
2. **Row Order Disambiguation**: In Bangladeshi corporate reports, `Retained earnings` frequently appears directly above `Total Equity`. When multiple equity components are parsed, the engine checks for explicit rows matching `conceptCode == 'TOTAL_EQUITY'` with labels containing "total equity". If ambiguous, it evaluates whether the maximum value reconciles the balance sheet.
3. **Subtotal Verification**: Where sub-items are extracted, the engine verifies that Current Assets + Non-Current Assets equals Total Assets within a 1% margin.
4. **Execution Gate**: If balance sheet reconciliation fails, screening aborts. Compliance determinations are never calculated on unreconciled financial facts.

---

## 7. AAOIFI Standard No. 21 Screening Formulas

AAOIFI Standard No. 21 sets financial ratios to screen conventional practices in non-financial corporations:

### 7.1 Threshold Interpretation: "Should Not Exceed"
Standard No. 21 states that conventional debt and interest deposits "does not exceed 30%" ("أن لا يتجاوز"). Mathematically:
- $\text{Ratio} \le 30.000\% \implies \mathbf{COMPLIANT}$
- $\text{Ratio} > 30.000\% \implies \mathbf{NON\_COMPLIANT}$

An exact value of 30.000% passes; any fraction above (e.g., 30.001%) fails. Similarly, for prohibited income:
- $\text{Income Ratio} \le 5.000\% \implies \mathbf{COMPLIANT}$
- $\text{Income Ratio} > 5.000\% \implies \mathbf{NON\_COMPLIANT}$

### 7.2 Rule 3/4/2: Debt on Interest Screen
AAOIFI Rule 3/4/2 mandates that conventional interest-bearing loans must not exceed 30% of market capitalization:

$$\text{Strict Debt Ratio} = \frac{\text{Short-Term Interest Loans} + \text{Long-Term Interest Loans} + \text{Conventional Bonds}}{\text{Market Capitalization}} \le 30.00\%$$

$$\text{Conservative Debt Ratio} = \frac{\text{Strict Numerator} + \text{Finance Lease Liabilities} + \text{Operating Lease Liabilities}}{\text{Market Capitalization}} \le 30.00\%$$

The conservative view includes lease contracts recognized under IFRS 16 (Right-of-Use assets and corresponding lease liabilities).

### 7.3 Rule 3/4/3: Interest-Taking Deposits Screen
AAOIFI Rule 3/4/3 mandates that interest-bearing deposits and investments must not exceed 30% of market capitalization:

$$\text{Strict Deposits Ratio} = \frac{\text{Fixed Deposits} + \text{Term Deposits} + \text{Treasury Bills} + \text{Interest-Bearing Savings}}{\text{Market Capitalization}} \le 30.00\%$$

$$\text{Conservative Deposits Ratio} = \frac{\text{Strict Numerator} + \text{Total Cash and Cash Equivalents}}{\text{Market Capitalization}} \le 30.00\%$$

The conservative view includes total cash and cash equivalents to address cases where unsegregated operational accounts generate minor bank interest.

### 7.4 Rule 3/4/4: Prohibited Revenue Screen
AAOIFI Rule 3/4/4 mandates that non-permissible earnings must not exceed 5% of total corporate revenues:

$$\text{Prohibited Income Ratio} = \frac{\text{Finance Income} + \text{Interest on Bank Deposits} + \text{Late Fees} + \text{Prohibited Gains}}{\text{Operating Revenue} + \text{Other Income} + \text{Finance Income}} \le 5.00\%$$

This ratio evaluates the operational revenue mix rather than market capitalization.

### 7.5 Rule 3/4/6: Share Purification
Under Rule 3/4/6/1, investors who own shares at the close of an accounting period are obligated to purify (donate to charity without expectation of reward) the non-permissible income component earned by the corporation:

$$\text{Purification Per Share} = \frac{\text{Total Prohibited Income for the Period}}{\text{Total Outstanding Shares}}$$

$$\text{Purification Payable} = \text{Purification Per Share} \times \text{Number of Shares Owned}$$

For quarterly statements (Q1, Q2, Q3), the system calculates both:
1. **Period Purification**: Purification per share for the specific quarter (applicable to investors holding the security during that quarter).
2. **TTM Purification**: Trailing twelve-month annualized purification rate.

### 7.6 Triple-View Market Capitalization Denominators
AAOIFI Standard No. 21 Rule 3/4/5 refers to the "last budget or verified financial position" for ratio denominators. Because share prices fluctuate daily on the exchange, StockScanner computes three denominator perspectives:

1. **Report-Date Market Capitalization**:
   $$\text{MCap}_{\text{Report}} = \text{Closing Price at Balance Sheet Date} \times \text{Total Outstanding Shares}$$
   Provides strict compliance with Rule 3/4/5 by evaluating the financial position on the reporting date.
2. **Current Live DSE Market Capitalization**:
   $$\text{MCap}_{\text{Live}} = \text{Live Last Traded Price (LTP)} \times \text{Total Outstanding Shares}$$
   Provides an up-to-date view for immediate capital deployment.
3. **12-Month Average Market Capitalization**:
   $$\text{MCap}_{\text{12M Avg}} = \text{Rolling 12-Month Average Price} \times \text{Total Outstanding Shares}$$
   Mitigates market volatility and pricing anomalies, aligning with methodologies used by major Islamic index providers.

---

## 8. Direct DSE Integration Architecture

Rather than relying on third-party data providers, StockScanner integrates directly with the Dhaka Stock Exchange (`dse.com.bd`):

### 8.1 Live Price Endpoint (`/api/live/prices`)
- Returns real-time pricing for all 634+ listed DSE securities.
- Extracted metrics include `ltp` (Last Traded Price), `close`, `ycp` (Yesterday's Closing Price), `high`, `low`, `volume`, and `category`.

### 8.2 Fundamentals Scraper (`/company/{symbol}`)
- Connects to official company profiles on `dse.com.bd`.
- Parses the server-rendered DOM and React Server Component (RSC) hydration payloads to extract:
  - Total Outstanding Securities (e.g., `31,500,000` for Marico, `1,350,300,022` for GP).
  - Paid-Up Capital and Authorized Capital.
  - 52-Week Price Range.
  - Fiscal Year-End Month.
  - Short-Term and Long-Term bank borrowings declared to the exchange.

### 8.3 Live Sync Pipeline (`dse-market.service.js`)
Triggered via `POST /api/market-data/sync/:symbol`, this service retrieves updated figures, updates the `Company` model, creates a timestamped `MarketData` entry, and can re-evaluate active screening results using the updated live denominator.

---

## 9. Background Worker Architecture (`extraction.worker.js`)

Background processing operates via an asynchronous polling loop running in the primary Node.js process:

1. **Worker Tick**: Executes every 3000ms. An in-memory boolean flag (`isWorkerRunning`) prevents concurrent tick executions.
2. **Job Acquisition**: Retrieves the oldest job where `status = 'PENDING'`.
3. **State Transition**: Sets job status to `PROCESSING`, increments the attempt counter, and updates the parent document status to `PROCESSING`.
4. **Target Page Filtering**: Evaluates pages classified as `BALANCE_SHEET`, `INCOME_STATEMENT`, `CASH_FLOW`, or `NOTES`.
5. **Sequential Page Processing**:
   - For each target page, invokes `processPageExtraction()`.
   - Sends the rendered PNG buffer to Gemini Multimodal Vision.
   - Parses the JSON response and stores `RawFact` records with bounding boxes and confidence metrics.
   - Converts facts to base BDT via `normalizeFactItem()` and persists `NormalizedFact` records.
   - Enforces a 1500ms delay between pages to manage Gemini API rate limits.
6. **Auto-Screening Trigger**:
   - Upon completing all financial pages, the job updates to `COMPLETED` and the document to `EXTRACTED`.
   - The worker looks up the associated `financialPeriodId`.
   - If present, it executes `runAaoifiScreening()`.
   - The screening engine validates the balance sheet equation, computes all ratios, and records the `ScreeningResult` and `ScreeningRatioDetail` rows in SQLite.

---

## 10. Frontend Workstation Architecture

The frontend (`Frontend/src/App.tsx`) is an institutional-grade single-page workstation structured around three operational panels:

### 10.1 Global Metrics and Universe Overview
- **System Metric Cards**: Display Tracked Equities count, Compliant Equities count, DSE Live API status, and Accounting Equation verification status.
- **Equities Universe Table**: Displays all pre-screened halal companies with real-time search filtering across tickers, legal names, and sectors. Each row displays DSE share counts, compliance badges (`COMPLIANT`, `NON-COMPLIANT`, `UNSCREENED`), purification amounts, and action buttons.

### 10.2 Company Inspection Drawer (Three Operational Tabs)
When an equity is selected, an inspector drawer opens with three tabs:

1. **Tab 1: AAOIFI Compliance Ratios**:
   - **Verdict Banner**: Displays compliance status, filing period (`Q1`, `Annual`), audit status, verification badges, and calculated purification per share.
   - **Market Cap Denominator Selector**: Toggle between Report-Date, Live DSE, and 12-Month Average denominators.
   - **Screening Cards**: Three ratio breakdown cards for Rule 3/4/2 (Debt), Rule 3/4/3 (Liquid Deposits), and Rule 3/4/4 (Prohibited Income). Each card includes a colored progress meter, compliance badge, strict vs. conservative metrics, and numerator/denominator values.
   - **Interactive Actions**: "Run Screening" (triggers calculation) and "Sync DSE Live" (updates quotes).

2. **Tab 2: Source Evidence & Audit Trail**:
   - Displays all extracted accounting facts in a searchable table.
   - Columns include Concept Code, Printed Label, Raw Printed Value, Normalized BDT Amount, Statement Type, Page Number, and Model Confidence Score.
   - Clicking **"Proof"** opens the visual evidence modal.

3. **Tab 3: Uploaded Documents & Archive**:
   - Lists uploaded filings with original filenames, page counts, processing states, upload dates, and cryptographic SHA-256 hashes.
   - Provides shortcuts to jump directly to rendered Balance Sheet or Income Statement pages.

### 10.3 Visual Page Proof Modal
- Displays high-resolution raster images of the original PDF page (`/api/documents/:id/pages/:pageNum/image`).
- Supports zoom control (60% to 250%) and page navigation (Previous / Next).
- An overlay panel displays the concept code, confidence score, raw printed text, and normalized base BDT value alongside the rendered source page.

### 10.4 PDF Upload Modal
- Accessible via global and per-company buttons.
- Features company selector, statement period selector (Quarterly vs Annual), and file input.
- Submitting uploads the file to `POST /api/documents/upload`, runs magic byte verification, calculates SHA-256 digests, renders pages, and initiates background extraction.

---

## 11. Error Handling Discipline and Failure Modes

The platform enforces strict error handling:

1. **`MISSING_REQUIRED_FACT`**: Raised if a required accounting concept (e.g., Total Assets, Total Revenue) cannot be mapped from the document. The calculation halts; it does not substitute zeros.
2. **`ACCOUNTING_EQUATION_MISMATCH`**: Raised if Assets does not equal Liabilities + Equity within 1.00 BDT. Prevents screening on corrupt or misaligned balance sheet extractions.
3. **`MISSING_MARKET_CAP`**: Raised if market capitalization is zero or unavailable. The platform will not evaluate ratios without a verified market cap denominator.
4. **`LOW_CONFIDENCE_FLAG`**: Triggered when a fact extraction confidence score falls below 0.80. The record is flagged (`isFlaggedForReview = true`) with diagnostic reasons for review.
5. **Non-Numeric / Nil Parsing**: Text strings containing dashes, dots, or nil indicators (`-`, `-.`, `—`, `nil`) resolve to `0.00` BDT. Other non-numeric strings raise parsing exceptions rather than silently converting to zero.
6. **API Rate Limiting Politeness**: The background extraction loop enforces 1500ms intervals between page requests to adhere to model rate limits.

---

## 12. Verification and Empirical Audit Results

The end-to-end system was validated against audited financial reports uploaded to the workspace:

### 12.1 Marico Bangladesh Ltd. (`MARICO`) — Q1 FY 2026-27 (39-Page PDF)
- **Ingestion & Pages**: 39 pages rendered to high-resolution PNGs.
- **Extracted Facts**: 35 individual accounting line items extracted from Page 7 (Balance Sheet) and Page 8 (Income Statement).
- **Balance Sheet Verification**:
  $$\text{Assets } (9,446,825,502) = \text{Liabilities } (4,843,330,274) + \text{Equity } (4,603,495,228)$$
  $$\Delta = 0.00\text{ BDT} \implies \mathbf{PASSED}$$
- **DSE Market Capitalization**:
  $$\text{Share Count } (31,500,000) \times \text{LTP } (2,661.20) = \text{BDT } 83,827,800,000\ (83,827.80\text{M})$$
- **AAOIFI Ratios**:
  - **Rule 3/4/2 (Debt)**: Strict = 0.00% (BDT 0 borrowings) $\le 30.00\%$ (**PASS**). Conservative (with leases BDT 134.25M) = 0.16% $\le 30.00\%$ (**PASS**).
  - **Rule 3/4/3 (Liquid Deposits)**: Strict = 1.89% (BDT 1,585.00M fixed deposits) $\le 30.00\%$ (**PASS**). Conservative (with cash BDT 3,328.19M) = 3.97% $\le 30.00\%$ (**PASS**).
  - **Rule 3/4/4 (Prohibited Income)**: Interest Income BDT 46.88M / Total Income BDT 4,792.05M = 0.98% $\le 5.00\%$ (**PASS**).
  - **Rule 3/4/6 (Purification)**: BDT 46,882,605 / 31,500,000 shares = **BDT 1.6560 per share**.
- **Final Verdict**: **`COMPLIANT`**.

### 12.2 Square Pharmaceuticals PLC (`SQURPHARMA`)
- **Ingestion & Extraction**: 7 financial pages processed; 111 individual facts extracted and normalized into database records.
- **Screening Execution**: Balance sheet verified and AAOIFI screening completed automatically.
- **API Response**: `GET /api/screening/results/SQURPHARMA` returns 200 OK with full ratio breakdowns; `GET /api/facts/period/:id` returns 111 provenance facts.

### 12.3 Unit Test Suite
- Test runner: `vitest`.
- Total unit tests: **26 passing (100% pass rate)**.
- Coverage includes Bengali digit conversion, accounting parentheses, nil/dash string normalization, accounting equation zero-tolerance validation, strict and conservative ratio bounds, threshold edge cases (30.000% pass vs 30.001% fail), and missing fact halt conditions.
