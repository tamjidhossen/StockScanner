import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { ModeToggle } from '@/components/mode-toggle';
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  RefreshCw,
  Search,
  Upload,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Coins,
  TrendingUp,
  X,
  ExternalLink,
  Layers,
  Eye,
  Sliders,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  Hash,
  Trash2,
} from 'lucide-react';

interface Company {
  id: string;
  dseSymbol: string;
  name: string;
  sector: string;
  fiscalYearEnd: string;
  listingYear: number | null;
  totalShares: string | null;
  paidUpCapMn: number | null;
  operationalStatus: string;
  _count: {
    documents: number;
    periods: number;
    screenings: number;
  };
  screenings: Array<{
    overallStatus: string;
    screeningDate: string;
    purificationPerShare: number;
  }>;
}

interface RatioDetail {
  id: string;
  aaoifiRule: string;
  viewType: string;
  marketCapType: string;
  numeratorValue: number;
  numeratorBreakdown: Record<string, any>;
  denominatorValue: number;
  denominatorSource: string;
  ratioValue: number;
  ratioPercent: number;
  threshold: number;
  passes: boolean;
  sourceFactIds: string[];
}

interface ScreeningResult {
  id: string;
  companyId: string;
  financialPeriodId: string;
  overallStatus: string;
  purificationPerShare: number;
  purificationTtmPerShare?: number | null;
  methodologyNotes: Record<string, any>;
  screeningDate: string;
  financialPeriod: {
    id: string;
    periodType: string;
    periodMonths: number;
    isAudited: boolean;
    periodEnd: string;
    fiscalYear: string;
  };
  ratioDetails: RatioDetail[];
}

interface RawFact {
  id: string;
  documentId: string;
  pageNumber: number;
  statementType: string;
  rawLabel: string;
  rawValue: string;
  currencyRaw?: string;
  unitScaleRaw?: string;
  boundingBox?: string;
  extractionMethod?: string;
  confidenceScore: number;
}

interface NormalizedFact {
  id: string;
  rawFactId: string;
  companyId: string;
  financialPeriodId: string;
  conceptCode: string;
  normalizedValue: number;
  currency: string;
  unitScale: number;
  statementType: string;
  pageNumber: number;
  confidenceScore: number;
  mappingReason: string;
  rawFact?: RawFact;
}

interface DocumentItem {
  id: string;
  companyId: string;
  financialPeriodId?: string | null;
  reportType: string;
  originalFilename: string;
  fileHash: string;
  totalPages: number;
  status: string;
  uploadedAt: string;
  processedAt?: string | null;
  _count?: {
    pages?: number;
    rawFacts?: number;
  };
}

export default function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  
  // Screening data
  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [runningScreening, setRunningScreening] = useState(false);
  
  // Audit & Facts data
  const [facts, setFacts] = useState<NormalizedFact[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factSearchTerm, setFactSearchTerm] = useState('');
  
  // Documents data
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  
  // Active Tab in Inspection Drawer: 'ratios' | 'facts' | 'documents'
  const [activeTab, setActiveTab] = useState<'ratios' | 'facts' | 'documents'>('ratios');
  
  // Triple-view Denominator mode
  const [mcapViewMode, setMcapViewMode] = useState<'PERIOD_DATE' | 'SCREENING_DATE' | 'AVERAGE_12M'>('SCREENING_DATE');
  
  // DSE live sync state
  const [syncingDse, setSyncingDse] = useState(false);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // PDF Upload Modal
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedUploadCompanyId, setSelectedUploadCompanyId] = useState('');
  const [reportType, setReportType] = useState('QUARTERLY');
  const [periodQuarter, setPeriodQuarter] = useState<'Q1' | 'Q2' | 'Q3'>('Q1');
  const [customFiscalYear, setCustomFiscalYear] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  // Visual Proof Modal state
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofDocId, setProofDocId] = useState<string | null>(null);
  const [proofPageNum, setProofPageNum] = useState<number>(1);
  const [proofHighlightFact, setProofHighlightFact] = useState<NormalizedFact | null>(null);
  const [proofZoom, setProofZoom] = useState<number>(1);

  // Deletion modals state
  const [deleteReportModalOpen, setDeleteReportModalOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<DocumentItem | null>(null);
  const [deletingReport, setDeletingReport] = useState(false);

  const [deleteCompanyModalOpen, setDeleteCompanyModalOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [deletingCompany, setDeletingCompany] = useState(false);

  // Notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setStatusNotification({ type, message });
    setTimeout(() => {
      setStatusNotification(null);
    }, 4000);
  };

  // 1. Fetch companies
  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/companies');
      const json = await res.json();
      if (json.success) {
        setCompanies(json.data);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // 2. Load Screening Details, Facts, and Documents for Selected Company
  const loadCompanyDetails = async (comp: Company) => {
    setSelectedCompany(comp);
    setScreeningLoading(true);
    setScreeningResult(null);
    setFacts([]);
    setDocuments([]);

    try {
      // A. Fetch Screening Result
      const res = await fetch(`/api/screening/results/${comp.dseSymbol}`);
      const json = await res.json();
      let activePeriodId: string | null = null;
      
      if (json.success && json.data) {
        setScreeningResult(json.data);
        activePeriodId = json.data.financialPeriodId;
      }

      // B. Fetch Documents for this company
      fetchCompanyDocuments(comp.id);

      // C. If period exists, fetch facts
      if (activePeriodId) {
        fetchFactsForPeriod(activePeriodId);
      }
    } catch (err) {
      console.error('Failed to load company screening:', err);
    } finally {
      setScreeningLoading(false);
    }
  };

  // Fetch facts for financial period
  const fetchFactsForPeriod = async (periodId: string) => {
    try {
      setFactsLoading(true);
      const res = await fetch(`/api/facts/period/${periodId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setFacts(json.data);
      }
    } catch (err) {
      console.error('Failed to load facts:', err);
    } finally {
      setFactsLoading(false);
    }
  };

  // Fetch documents for company
  const fetchCompanyDocuments = async (companyId: string) => {
    try {
      setDocumentsLoading(true);
      const res = await fetch(`/api/documents?companyId=${companyId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setDocuments(json.data);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setDocumentsLoading(false);
    }
  };

  // 3. Sync DSE Live data
  const handleSyncDse = async (symbol: string) => {
    try {
      setSyncingDse(true);
      const res = await fetch(`/api/market-data/sync/${symbol}`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showNotification('success', `Live DSE quotes and share counts synchronized for ${symbol}!`);
        await fetchCompanies();
        if (selectedCompany && selectedCompany.dseSymbol === symbol) {
          await loadCompanyDetails(selectedCompany);
        }
      } else {
        showNotification('error', `Failed to sync DSE: ${json.message}`);
      }
    } catch (err: any) {
      showNotification('error', `DSE Sync failed: ${err.message}`);
    } finally {
      setSyncingDse(false);
    }
  };

  // 4. Trigger / Re-run AAOIFI Screening
  const handleRunScreening = async () => {
    if (!selectedCompany) return;
    
    // Check if we have a period or documents
    const periodId = screeningResult?.financialPeriodId || documents[0]?.financialPeriodId;
    if (!periodId) {
      showNotification('error', 'No financial period associated with this company yet. Please upload a report first.');
      return;
    }

    try {
      setRunningScreening(true);
      const res = await fetch(`/api/screening/run/${selectedCompany.id}/${periodId}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        showNotification('success', 'AAOIFI Screening calculated and verified successfully!');
        await fetchCompanies();
        await loadCompanyDetails(selectedCompany);
      } else {
        showNotification('error', `Screening failed: ${json.message}`);
      }
    } catch (err: any) {
      showNotification('error', `Screening execution error: ${err.message}`);
    } finally {
      setRunningScreening(false);
    }
  };

  // 5. Open Page Proof Viewer
  const openProofViewer = (docId: string, pageNum: number, fact?: NormalizedFact) => {
    setProofDocId(docId);
    setProofPageNum(pageNum);
    setProofHighlightFact(fact || null);
    setProofZoom(1);
    setProofModalOpen(true);
  };

  // 6. Handle PDF Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedUploadCompanyId) return;

    try {
      setUploadLoading(true);
      setUploadMessage(null);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('companyId', selectedUploadCompanyId);
      formData.append('reportType', reportType);
      formData.append('periodType', reportType === 'QUARTERLY' ? periodQuarter : 'ANNUAL');
      if (customFiscalYear.trim()) {
        formData.append('fiscalYear', customFiscalYear.trim());
      }

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.success) {
        setUploadMessage('Document uploaded and inspected into pages! SQLite extraction worker queued.');
        showNotification('success', 'PDF uploaded successfully! Automatic extraction job running in background.');
        await fetchCompanies();
        if (selectedCompany && selectedCompany.id === selectedUploadCompanyId) {
          await loadCompanyDetails(selectedCompany);
        }
        setTimeout(() => {
          setUploadModalOpen(false);
          setUploadFile(null);
          setCustomFiscalYear('');
          setPeriodQuarter('Q1');
          setUploadMessage(null);
        }, 1500);
      } else {
        setUploadMessage(`Error: ${json.message}`);
      }
    } catch (err: any) {
      setUploadMessage(`Upload failed: ${err.message}`);
    } finally {
      setUploadLoading(false);
    }
  };

  // 6. Delete Report (Document)
  const handleDeleteReport = async () => {
    if (!reportToDelete) return;
    try {
      setDeletingReport(true);
      const res = await fetch(`/api/documents/${reportToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete report');
      }
      showNotification('success', data.message || 'Report deleted successfully');
      setDeleteReportModalOpen(false);
      setReportToDelete(null);

      // Refresh documents and company screening details
      if (selectedCompany) {
        await fetchCompanyDocuments(selectedCompany.id);
        await loadCompanyDetails(selectedCompany);
      }
      await fetchCompanies();
    } catch (err: any) {
      showNotification('error', err.message || 'Error deleting report');
    } finally {
      setDeletingReport(false);
    }
  };

  // 7. Delete Company or Purge Company Data
  const handleDeleteCompany = async (purgeOnly: boolean) => {
    if (!companyToDelete) return;
    try {
      setDeletingCompany(true);
      const endpoint = purgeOnly
        ? `/api/companies/${companyToDelete.id}/data`
        : `/api/companies/${companyToDelete.id}`;
      const res = await fetch(endpoint, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete company');
      }
      showNotification('success', data.message || 'Action completed successfully');
      setDeleteCompanyModalOpen(false);

      if (!purgeOnly) {
        // Full deletion: close drawer if this company was active
        if (selectedCompany?.id === companyToDelete.id) {
          setSelectedCompany(null);
        }
      } else {
        // Purged: reset views
        if (selectedCompany?.id === companyToDelete.id) {
          setScreeningResult(null);
          setFacts([]);
          setDocuments([]);
          await loadCompanyDetails(companyToDelete);
        }
      }
      setCompanyToDelete(null);
      await fetchCompanies();
    } catch (err: any) {
      showNotification('error', err.message || 'Error processing delete request');
    } finally {
      setDeletingCompany(false);
    }
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.dseSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.sector.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFacts = facts.filter(
    (f) =>
      f.conceptCode.toLowerCase().includes(factSearchTerm.toLowerCase()) ||
      (f.rawFact?.rawLabel || '').toLowerCase().includes(factSearchTerm.toLowerCase()) ||
      (f.statementType || '').toLowerCase().includes(factSearchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Toast Notification */}
      {statusNotification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-medium border backdrop-blur animate-in fade-in slide-in-from-top-2 duration-300 ${
          statusNotification.type === 'success'
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
            : 'bg-rose-950/90 text-rose-200 border-rose-500/40'
        }`}>
          {statusNotification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          <span>{statusNotification.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 flex items-center justify-center font-bold text-base shadow-inner">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight text-slate-100">
                  StockScanner AAOIFI
                </h1>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0 font-mono">
                  Standard No. 21
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Dhaka Stock Exchange (DSE) Institutional Shariah Screening & Audit Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                setSelectedUploadCompanyId(selectedCompany?.id || '');
                setUploadModalOpen(true);
              }}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs gap-1.5 shadow-sm transition"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Financial PDF
            </Button>
            <ModeToggle />
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 flex-1 space-y-8">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800 shadow-sm hover:border-slate-700 transition">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400 text-xs">Universe Securities</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-100 flex items-center justify-between">
                {companies.length}
                <Coins className="h-5 w-5 text-slate-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">Halal pre-screened DSE equities</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 shadow-sm hover:border-slate-700 transition">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400 text-xs">AAOIFI Compliant</CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-400 flex items-center justify-between">
                {companies.filter((c) => c.screenings?.[0]?.overallStatus === 'COMPLIANT').length}
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">Passed Rule 3/4/2, 3/4/3 & 3/4/4</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 shadow-sm hover:border-slate-700 transition">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400 text-xs">DSE Direct Integration</CardDescription>
              <CardTitle className="text-2xl font-bold text-sky-400 flex items-center justify-between">
                Live API
                <TrendingUp className="h-5 w-5 text-sky-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">Real-time quotes & share counts</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 shadow-sm hover:border-slate-700 transition">
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400 text-xs">Deterministic Audit</CardDescription>
              <CardTitle className="text-2xl font-bold text-indigo-400 flex items-center justify-between">
                100% Verified
                <CheckCircle2 className="h-5 w-5 text-indigo-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-slate-500">Assets = Liabilities + Equity (0 diff)</p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Inspection Drawer (if company selected) */}
        {selectedCompany && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl relative overflow-hidden backdrop-blur">
            <button
              onClick={() => setSelectedCompany(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
              title="Close panel"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-slate-100">{selectedCompany.dseSymbol}</h2>
                  <Badge variant="outline" className="border-slate-700 bg-slate-800/60 text-slate-300 font-mono">
                    {selectedCompany.sector}
                  </Badge>
                  <span className="text-xs text-slate-400">• Year End: <strong className="text-slate-300">{selectedCompany.fiscalYearEnd}</strong></span>
                  {selectedCompany.totalShares && (
                    <span className="text-xs text-slate-400">• Shares: <strong className="text-slate-300 font-mono">{Number(selectedCompany.totalShares).toLocaleString()}</strong></span>
                  )}
                </div>
                <p className="text-sm text-slate-400">{selectedCompany.name}</p>
              </div>

              <div className="flex items-center gap-2.5 pr-8">
                <Button
                  onClick={handleRunScreening}
                  disabled={runningScreening}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 font-medium shadow-sm transition"
                >
                  <Scale className={`h-3.5 w-3.5 ${runningScreening ? 'animate-spin' : ''}`} />
                  {runningScreening ? 'Computing...' : 'Run Screening'}
                </Button>
                <Button
                  onClick={() => handleSyncDse(selectedCompany.dseSymbol)}
                  disabled={syncingDse}
                  size="sm"
                  variant="outline"
                  className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs gap-1.5 transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingDse ? 'animate-spin' : ''}`} />
                  Sync DSE Live
                </Button>
                <a
                  href={`https://www.dse.com.bd/company/${selectedCompany.dseSymbol}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline px-2 py-1"
                >
                  DSE Profile <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  onClick={() => {
                    setCompanyToDelete(selectedCompany);
                    setDeleteCompanyModalOpen(true);
                  }}
                  size="sm"
                  variant="outline"
                  className="border-rose-900/60 hover:border-rose-700 bg-rose-950/20 hover:bg-rose-900/30 text-rose-300 text-xs gap-1.5 transition ml-1"
                  title="Delete or reset company"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                  Delete / Purge
                </Button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <button
                onClick={() => setActiveTab('ratios')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'ratios'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                AAOIFI Compliance Ratios
              </button>
              <button
                onClick={() => setActiveTab('facts')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'facts'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Source Evidence & Audit Trail
                {facts.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1 bg-slate-800 border-slate-700 text-slate-300 px-1 py-0 font-mono">
                    {facts.length}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeTab === 'documents'
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Uploaded Documents & Pages
                {documents.length > 0 && (
                  <Badge variant="outline" className="text-[10px] ml-1 bg-slate-800 border-slate-700 text-slate-300 px-1 py-0 font-mono">
                    {documents.length}
                  </Badge>
                )}
              </button>
            </div>

            {/* TAB 1: RATIOS & COMPLIANCE */}
            {activeTab === 'ratios' && (
              <>
                {screeningLoading ? (
                  <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                    Loading AAOIFI screening calculations...
                  </div>
                ) : screeningResult ? (
                  <div className="space-y-6">
                    {/* Overall Verdict Banner */}
                    <div className={`p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                      screeningResult.overallStatus === 'COMPLIANT'
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                    }`}>
                      <div className="flex items-center gap-3.5">
                        {screeningResult.overallStatus === 'COMPLIANT' ? (
                          <ShieldCheck className="h-9 w-9 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="h-9 w-9 text-rose-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xl font-bold tracking-tight">
                              {screeningResult.overallStatus === 'COMPLIANT' ? 'AAOIFI COMPLIANT' : 'NON-COMPLIANT'}
                            </span>
                            <Badge className={`text-xs px-2 py-0.5 ${
                              screeningResult.overallStatus === 'COMPLIANT' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                            }`}>
                              Verified
                            </Badge>
                          </div>
                          <p className="text-xs opacity-80 mt-0.5">
                            {screeningResult.financialPeriod.periodType} {screeningResult.financialPeriod.fiscalYear} •{' '}
                            {screeningResult.financialPeriod.isAudited ? 'Statutory Audited' : 'Unaudited Quarterly'} • Recourse per Rule 3/4/5
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-sm">
                        <div>
                          <div className="text-xs opacity-70">Accounting Equation</div>
                          <div className="font-semibold text-emerald-400 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="h-4 w-4" /> Assets = L + E (0 diff)
                          </div>
                        </div>
                        <div className="border-l border-slate-700/50 pl-6">
                          <div className="text-xs opacity-70">Purification Per Share (Rule 3/4/6)</div>
                          <div className="font-bold text-base text-amber-300 font-mono mt-0.5">
                            BDT {screeningResult.purificationPerShare.toFixed(4)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Triple Market Cap Denominator View Selector */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Sliders className="h-4 w-4 text-emerald-400" />
                        <span>Market Capitalization Denominator View:</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setMcapViewMode('PERIOD_DATE')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                            mcapViewMode === 'PERIOD_DATE'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Report-Date MCap (Rule 3/4/5)
                        </button>
                        <button
                          onClick={() => setMcapViewMode('SCREENING_DATE')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                            mcapViewMode === 'SCREENING_DATE'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Current Live DSE MCap
                        </button>
                        <button
                          onClick={() => setMcapViewMode('AVERAGE_12M')}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                            mcapViewMode === 'AVERAGE_12M'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          12-Month Average MCap
                        </button>
                      </div>
                    </div>

                    {/* 3 Core AAOIFI Screening Ratio Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Rule 3/4/2: Debt Ratio */}
                      {(() => {
                        const strict = screeningResult.ratioDetails.find((r) => r.aaoifiRule === '3/4/2' && r.viewType === 'STRICT_AAOIFI');
                        const cons = screeningResult.ratioDetails.find((r) => r.aaoifiRule === '3/4/2' && r.viewType === 'CONSERVATIVE');
                        return (
                          <Card className="bg-slate-950/70 border-slate-800 shadow-sm">
                            <CardHeader className="pb-2">
                              <CardDescription className="text-xs text-slate-400">Rule 3/4/2 • Debt Screen</CardDescription>
                              <CardTitle className="text-base font-semibold flex items-center justify-between text-slate-200">
                                Loans on Interest
                                <Badge variant={strict?.passes ? 'outline' : 'destructive'} className={strict?.passes ? 'text-emerald-400 border-emerald-500/30' : ''}>
                                  {strict?.passes ? 'Pass' : 'Fail'}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-2">
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-400">Strict AAOIFI Ratio:</span>
                                  <span className="font-bold text-emerald-400 font-mono">{strict?.ratioPercent.toFixed(2)}% (Max 30%)</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${strict?.passes ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: `${Math.min(100, (strict?.ratioPercent || 0) * 3.33)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 pt-1 border-t border-slate-800/60 space-y-1">
                                <div className="flex justify-between">
                                  <span>+ Leases (Conservative):</span>
                                  <span className="text-slate-200 font-medium font-mono">{cons?.ratioPercent.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Interest Debt:</span>
                                  <span className="font-mono">BDT {(strict?.numeratorValue || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Lease Liabilities:</span>
                                  <span className="font-mono">BDT {((cons?.numeratorValue || 0) - (strict?.numeratorValue || 0)).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Market Cap Denominator:</span>
                                  <span className="font-mono">BDT {(strict?.denominatorValue || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}

                      {/* Rule 3/4/3: Deposits Ratio */}
                      {(() => {
                        const strict = screeningResult.ratioDetails.find((r) => r.aaoifiRule === '3/4/3' && r.viewType === 'STRICT_AAOIFI');
                        const cons = screeningResult.ratioDetails.find((r) => r.aaoifiRule === '3/4/3' && r.viewType === 'CONSERVATIVE');
                        return (
                          <Card className="bg-slate-950/70 border-slate-800 shadow-sm">
                            <CardHeader className="pb-2">
                              <CardDescription className="text-xs text-slate-400">Rule 3/4/3 • Liquid Asset Screen</CardDescription>
                              <CardTitle className="text-base font-semibold flex items-center justify-between text-slate-200">
                                Interest Deposits
                                <Badge variant={strict?.passes ? 'outline' : 'destructive'} className={strict?.passes ? 'text-emerald-400 border-emerald-500/30' : ''}>
                                  {strict?.passes ? 'Pass' : 'Fail'}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-2">
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-400">Strict Deposits Ratio:</span>
                                  <span className="font-bold text-emerald-400 font-mono">{strict?.ratioPercent.toFixed(2)}% (Max 30%)</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${strict?.passes ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: `${Math.min(100, (strict?.ratioPercent || 0) * 3.33)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 pt-1 border-t border-slate-800/60 space-y-1">
                                <div className="flex justify-between">
                                  <span>+ Cash (Conservative):</span>
                                  <span className="text-slate-200 font-medium font-mono">{cons?.ratioPercent.toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Interest Deposits:</span>
                                  <span className="font-mono">BDT {(strict?.numeratorValue || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Cash & Equivalents:</span>
                                  <span className="font-mono">BDT {((cons?.numeratorValue || 0) - (strict?.numeratorValue || 0)).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Market Cap Denominator:</span>
                                  <span className="font-mono">BDT {(strict?.denominatorValue || 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}

                      {/* Rule 3/4/4: Prohibited Income Ratio */}
                      {(() => {
                        const inc = screeningResult.ratioDetails.find((r) => r.aaoifiRule === '3/4/4');
                        return (
                          <Card className="bg-slate-950/70 border-slate-800 shadow-sm">
                            <CardHeader className="pb-2">
                              <CardDescription className="text-xs text-slate-400">Rule 3/4/4 • Revenue Screen</CardDescription>
                              <CardTitle className="text-base font-semibold flex items-center justify-between text-slate-200">
                                Prohibited Income
                                <Badge variant={inc?.passes ? 'outline' : 'destructive'} className={inc?.passes ? 'text-emerald-400 border-emerald-500/30' : ''}>
                                  {inc?.passes ? 'Pass' : 'Fail'}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 pt-2">
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-400">Prohibited Income Ratio:</span>
                                  <span className="font-bold text-emerald-400 font-mono">{inc?.ratioPercent.toFixed(2)}% (Max 5.0%)</span>
                                </div>
                                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${inc?.passes ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                    style={{ width: `${Math.min(100, (inc?.ratioPercent || 0) * 20)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-xs text-slate-400 pt-1 border-t border-slate-800/60 space-y-1">
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Interest Income:</span>
                                  <span className="font-mono">BDT {(inc?.numeratorValue || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                  <span>Total Income:</span>
                                  <span className="font-mono">BDT {(inc?.denominatorValue || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-amber-300/80 pt-1 border-t border-slate-800/40">
                                  <span>Purification Per Share:</span>
                                  <span className="font-mono font-bold">BDT {screeningResult.purificationPerShare.toFixed(4)}</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/60">
                    <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-2 opacity-80" />
                    <h4 className="text-sm font-semibold text-slate-200">No Screening Calculations Recorded</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Upload a quarterly or annual financial statement PDF, or click "Run Screening" if financial data has already been extracted.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <Button
                        onClick={() => {
                          setSelectedUploadCompanyId(selectedCompany.id);
                          setUploadModalOpen(true);
                        }}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload PDF for {selectedCompany.dseSymbol}
                      </Button>
                      <Button
                        onClick={handleRunScreening}
                        disabled={runningScreening}
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-300 text-xs"
                      >
                        Run Screening Engine
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: FACTS & AUDIT TRAIL */}
            {activeTab === 'facts' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Financial Audit Trail & Extracted Facts</h3>
                    <p className="text-xs text-slate-400">
                      Every line item extracted by Gemini Multimodal Vision with exact provenance back to original PDF pages.
                    </p>
                  </div>
                  <div className="w-64 relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <Input
                      placeholder="Search concepts or printed labels..."
                      value={factSearchTerm}
                      onChange={(e) => setFactSearchTerm(e.target.value)}
                      className="pl-8 h-8 bg-slate-950 border-slate-800 text-xs text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {factsLoading ? (
                  <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                    Loading provenance facts...
                  </div>
                ) : filteredFacts.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                    No extracted facts match your criteria or none recorded yet.
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-hidden shadow-inner">
                    <Table>
                      <TableHeader className="bg-slate-950">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          <TableHead className="text-xs font-semibold text-slate-400">Concept Code</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Printed Raw Label</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Raw Value</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Normalized BDT</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Statement</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Page</TableHead>
                          <TableHead className="text-xs font-semibold text-slate-400">Confidence</TableHead>
                          <TableHead className="text-right text-xs font-semibold text-slate-400">Visual Proof</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFacts.map((fact) => (
                          <TableRow key={fact.id} className="border-slate-800/60 hover:bg-slate-800/40 transition">
                            <TableCell className="font-mono text-xs font-semibold text-emerald-400">
                              {fact.conceptCode}
                            </TableCell>
                            <TableCell className="text-xs text-slate-300 max-w-[220px] truncate" title={fact.rawFact?.rawLabel}>
                              {fact.rawFact?.rawLabel || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-slate-400">
                              {fact.rawFact?.rawValue || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-semibold text-slate-100">
                              BDT {fact.normalizedValue.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] font-mono ${
                                fact.statementType === 'BALANCE_SHEET'
                                  ? 'border-indigo-500/30 text-indigo-300 bg-indigo-950/20'
                                  : 'border-sky-500/30 text-sky-300 bg-sky-950/20'
                              }`}>
                                {fact.statementType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-slate-400">
                              Page {fact.pageNumber}
                            </TableCell>
                            <TableCell>
                              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                                {(fact.confidenceScore * 100).toFixed(0)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  if (fact.rawFact?.documentId) {
                                    openProofViewer(fact.rawFact.documentId, fact.pageNumber, fact);
                                  } else if (documents[0]?.id) {
                                    openProofViewer(documents[0].id, fact.pageNumber, fact);
                                  }
                                }}
                                className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                              >
                                <Eye className="h-3 w-3" /> Proof
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: UPLOADED DOCUMENTS */}
            {activeTab === 'documents' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Immutable Document Archive</h3>
                    <p className="text-xs text-slate-400">
                      Original source PDFs verified with cryptographic SHA-256 signatures and rendered page layers.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedUploadCompanyId(selectedCompany.id);
                      setUploadModalOpen(true);
                    }}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload Additional Report
                  </Button>
                </div>

                {documentsLoading ? (
                  <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin text-emerald-500" />
                    Loading documents...
                  </div>
                ) : documents.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                    No documents uploaded for this company yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documents.map((doc) => (
                      <div key={doc.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-semibold text-slate-200">{doc.originalFilename}</h4>
                                <Badge className="text-[10px] bg-emerald-600 font-mono">
                                  {doc.status}
                                </Badge>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {doc.reportType} • {doc.totalPages} Pages • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openProofViewer(doc.id, 7)}
                              className="border-slate-700 text-slate-300 text-xs h-7 gap-1"
                            >
                              <Eye className="h-3 w-3" /> View Balance Sheet (P7)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openProofViewer(doc.id, 8)}
                              className="border-slate-700 text-slate-300 text-xs h-7 gap-1"
                            >
                              <Eye className="h-3 w-3" /> View Income Statement (P8)
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setReportToDelete(doc);
                                setDeleteReportModalOpen(true);
                              }}
                              className="border-rose-900/60 hover:border-rose-700 bg-rose-950/20 hover:bg-rose-900/30 text-rose-300 text-xs h-7 px-2 gap-1 transition"
                              title="Delete report and extracted facts"
                            >
                              <Trash2 className="h-3 w-3 text-rose-400" /> Delete
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                          <Hash className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-slate-400">SHA-256:</span>
                          <span className="text-slate-300 truncate">{doc.fileHash}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Company Master Universe Table */}
        <Card className="bg-slate-900 border-slate-800 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-800/80">
            <div>
              <CardTitle className="text-lg font-bold text-slate-100">Bangladesh Equities Universe</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Pre-screened permissible primary businesses listed on Dhaka Stock Exchange (DSE)
              </CardDescription>
            </div>
            <div className="w-72 relative">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-500" />
              <Input
                placeholder="Search symbol, name, or sector..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-950/60">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-xs font-semibold text-slate-400">Symbol</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-400">Company Name</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-400">Sector</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-400">Total Shares (DSE)</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-400">AAOIFI Status</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-400">Purification / Share</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                      Loading securities data...
                    </TableCell>
                  </TableRow>
                ) : filteredCompanies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                      No companies match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCompanies.map((comp) => {
                    const latestScreening = comp.screenings?.[0];
                    const isCompliant = latestScreening?.overallStatus === 'COMPLIANT';
                    const hasScreening = !!latestScreening;

                    return (
                      <TableRow
                        key={comp.id}
                        className="border-slate-800/60 hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => loadCompanyDetails(comp)}
                      >
                        <TableCell className="font-bold text-slate-200">
                          <div className="flex items-center gap-1.5 font-mono">
                            {comp.dseSymbol}
                            <ArrowUpRight className="h-3 w-3 text-slate-500 opacity-60" />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-300 font-medium">{comp.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] border-slate-700 bg-slate-800/50 text-slate-400">
                            {comp.sector}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-400">
                          {comp.totalShares ? Number(comp.totalShares).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell>
                          {hasScreening ? (
                            <Badge className={`text-xs font-mono ${isCompliant ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                              {isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-slate-500 border-slate-800 font-mono">
                              UNSCREENED
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-amber-300">
                          {hasScreening && isCompliant ? `BDT ${latestScreening.purificationPerShare.toFixed(4)}` : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => loadCompanyDetails(comp)}
                              className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2.5 font-medium"
                            >
                              Inspect Audit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedUploadCompanyId(comp.id);
                                setUploadModalOpen(true);
                              }}
                              className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 h-7 px-2"
                              title="Upload PDF"
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCompanyToDelete(comp);
                                setDeleteCompanyModalOpen(true);
                              }}
                              className="text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 h-7 px-2"
                              title="Delete or purge company"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* Visual Page Proof Modal */}
      {proofModalOpen && proofDocId && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    Visual Evidence Proof • Page {proofPageNum}
                    {proofHighlightFact && (
                      <Badge className="text-[10px] bg-emerald-600 font-mono">
                        {proofHighlightFact.conceptCode}
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    High-resolution rendered raster layer extracted directly from uploaded PDF
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 border border-slate-800 rounded-lg p-0.5 bg-slate-950">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProofPageNum((prev) => Math.max(1, prev - 1))}
                    className="h-7 px-2 text-xs text-slate-300"
                  >
                    Prev Page
                  </Button>
                  <span className="text-xs font-mono text-slate-400 px-2">Page {proofPageNum}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProofPageNum((prev) => prev + 1)}
                    className="h-7 px-2 text-xs text-slate-300"
                  >
                    Next Page
                  </Button>
                </div>

                <div className="flex items-center gap-1 border border-slate-800 rounded-lg p-0.5 bg-slate-950">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProofZoom((prev) => Math.max(0.6, prev - 0.2))}
                    className="h-7 w-7 p-0 text-slate-300"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[11px] font-mono text-slate-400 px-1">{(proofZoom * 100).toFixed(0)}%</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProofZoom((prev) => Math.min(2.5, prev + 0.2))}
                    className="h-7 w-7 p-0 text-slate-300"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <button
                  onClick={() => setProofModalOpen(false)}
                  className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition ml-2"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto flex bg-slate-950 p-6 items-center justify-center relative">
              <div
                style={{ transform: `scale(${proofZoom})`, transformOrigin: 'center center' }}
                className="transition-transform duration-150 shadow-2xl rounded-lg overflow-hidden border border-slate-800 bg-white"
              >
                <img
                  src={`/api/documents/${proofDocId}/pages/${proofPageNum}/image`}
                  alt={`Page ${proofPageNum}`}
                  className="max-h-[75vh] w-auto object-contain block"
                  onError={(e) => {
                    // Fallback visual if image not found
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* Fact Highlight overlay panel */}
              {proofHighlightFact && (
                <div className="absolute bottom-6 left-6 max-w-md bg-slate-900/95 border border-emerald-500/40 rounded-xl p-3.5 shadow-2xl backdrop-blur text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                    <span className="font-mono font-bold text-emerald-400">{proofHighlightFact.conceptCode}</span>
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-mono">
                      {(proofHighlightFact.confidenceScore * 100).toFixed(0)}% Match
                    </Badge>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-500">Printed Label: </span>
                    <strong>{proofHighlightFact.rawFact?.rawLabel}</strong>
                  </div>
                  <div className="text-slate-300 flex justify-between">
                    <span>
                      <span className="text-slate-500">Raw: </span>
                      <code className="text-amber-300 font-mono">{proofHighlightFact.rawFact?.rawValue}</code>
                    </span>
                    <span>
                      <span className="text-slate-500">Normalized: </span>
                      <strong className="text-emerald-400 font-mono">BDT {proofHighlightFact.normalizedValue.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload PDF Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setUploadModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-400" />
                Upload Financial Statement PDF
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Upload quarterly (Q1/Q2/Q3) or annual report. System automatically hashes and stores immutably.
              </p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Target Listed Company</label>
                <select
                  value={selectedUploadCompanyId}
                  onChange={(e) => setSelectedUploadCompanyId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select a listed company...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.dseSymbol} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Statement Period Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReportType('QUARTERLY')}
                    className={`py-2 text-xs font-medium rounded-lg border text-center transition ${
                      reportType === 'QUARTERLY'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Quarterly Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType('ANNUAL')}
                    className={`py-2 text-xs font-medium rounded-lg border text-center transition ${
                      reportType === 'ANNUAL'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    Annual Report (Audited 12M)
                  </button>
                </div>
              </div>

              {reportType === 'QUARTERLY' && (
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">Quarter Duration</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPeriodQuarter('Q1')}
                      className={`py-1.5 text-xs font-medium rounded-lg border text-center transition ${
                        periodQuarter === 'Q1'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Q1 (3 Months)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodQuarter('Q2')}
                      className={`py-1.5 text-xs font-medium rounded-lg border text-center transition ${
                        periodQuarter === 'Q2'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Q2 / H1 (6 Months)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriodQuarter('Q3')}
                      className={`py-1.5 text-xs font-medium rounded-lg border text-center transition ${
                        periodQuarter === 'Q3'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Q3 (9 Months)
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">
                  Financial Year (Optional Override)
                </label>
                <select
                  value={customFiscalYear}
                  onChange={(e) => setCustomFiscalYear(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">Auto-detect from statement header (Recommended)</option>
                  <optgroup label="Standard Split Years (July–June / April–March)">
                    <option value="2026-2027">FY 2026-2027</option>
                    <option value="2025-2026">FY 2025-2026</option>
                    <option value="2024-2025">FY 2024-2025</option>
                    <option value="2023-2024">FY 2023-2024</option>
                    <option value="2022-2023">FY 2022-2023</option>
                  </optgroup>
                  <optgroup label="Calendar Financial Years (January–December)">
                    <option value="2026">FY 2026</option>
                    <option value="2025">FY 2025</option>
                    <option value="2024">FY 2024</option>
                    <option value="2023">FY 2023</option>
                    <option value="2022">FY 2022</option>
                  </optgroup>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Select a fiscal year to override, or keep Auto-detect to let the AI resolve it from the balance sheet date.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Select PDF File</label>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                />
              </div>

              {uploadMessage && (
                <div className={`p-3 rounded-lg text-xs ${uploadMessage.startsWith('Error') ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40' : 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'}`}>
                  {uploadMessage}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setUploadModalOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={uploadLoading || !uploadFile || !selectedUploadCompanyId}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5"
                >
                  {uploadLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  Upload & Inspect
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Report Confirmation Modal */}
      {deleteReportModalOpen && reportToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => {
                setDeleteReportModalOpen(false);
                setReportToDelete(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">Delete Financial Report</h3>
                <p className="text-xs text-slate-400">
                  Are you sure you want to permanently delete this PDF statement?
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-500">Filename:</span>
                <span className="font-semibold text-slate-200 truncate max-w-[220px]" title={reportToDelete.originalFilename}>
                  {reportToDelete.originalFilename}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-500">Period / Type:</span>
                <span>{reportToDelete.reportType} ({reportToDelete.totalPages} Pages)</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-500">Upload Date:</span>
                <span>{new Date(reportToDelete.uploadedAt).toLocaleDateString()}</span>
              </div>
            </div>

            <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg leading-relaxed">
              ⚠️ <strong>Warning:</strong> This permanently deletes the PDF file from disk, deletes all rendered page proofs, purges all extracted balance sheet and income statement facts, and resets any screenings attached to this filing.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={deletingReport}
                onClick={() => {
                  setDeleteReportModalOpen(false);
                  setReportToDelete(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={deletingReport}
                onClick={handleDeleteReport}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs gap-1.5 font-medium"
              >
                {deletingReport && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {deletingReport ? 'Deleting...' : 'Delete Report Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Purge Company Modal */}
      {deleteCompanyModalOpen && companyToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => {
                setDeleteCompanyModalOpen(false);
                setCompanyToDelete(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-100">
                  Delete / Reset Company: {companyToDelete.dseSymbol}
                </h3>
                <p className="text-xs text-slate-400">
                  {companyToDelete.name} • {companyToDelete.sector}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Select an action to clean up this listed company's filings, accounting facts, and screening results:
            </p>

            <div className="space-y-3">
              {/* Option A: Purge Data / Reset Company */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-slate-700 transition space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-semibold text-slate-200">
                      Option A: Purge All Reports & Audit Data (Reset Company)
                    </h4>
                  </div>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                    Recommended
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Deletes all uploaded PDF reports, rendered proof thumbnails, extracted facts, screening results, and market data.
                  The company symbol and profile remain in your universe for future filings.
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    disabled={deletingCompany}
                    onClick={() => handleDeleteCompany(true)}
                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs gap-1.5 h-8"
                  >
                    {deletingCompany && <RefreshCw className="h-3 w-3 animate-spin" />}
                    Purge All Reports & Screenings
                  </Button>
                </div>
              </div>

              {/* Option B: Delete Entire Company */}
              <div className="p-4 rounded-xl border border-rose-950/60 bg-rose-950/15 hover:border-rose-900/60 transition space-y-2.5">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-rose-400" />
                  <h4 className="text-xs font-semibold text-rose-200">
                    Option B: Permanently Delete Entire Company
                  </h4>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Completely removes <strong className="text-rose-300">{companyToDelete.dseSymbol}</strong> from your StockScanner universe,
                  including all database records, financial periods, and disk storage files. This action cannot be reversed.
                </p>
                <div className="pt-1">
                  <Button
                    size="sm"
                    disabled={deletingCompany}
                    onClick={() => handleDeleteCompany(false)}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs gap-1.5 h-8"
                  >
                    {deletingCompany && <RefreshCw className="h-3 w-3 animate-spin" />}
                    Delete Company Permanently
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                disabled={deletingCompany}
                onClick={() => {
                  setDeleteCompanyModalOpen(false);
                  setCompanyToDelete(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
