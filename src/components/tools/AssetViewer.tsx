import { useState, useEffect, useMemo } from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import { assetConfig } from "@/config/assets";
import Modal from "@/components/shared/Modal";

interface Props {
  locale: AppLocale;
}

interface S3File {
  key: string;
  size: number;
  lastModified: string;
}

interface UnifiedItem {
  type: "folder" | "file";
  name: string;
  key: string;
  size?: number;
  lastModified?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Icons as SVG components
const FolderIcon = () => (
  <svg className="h-6 w-6 text-[var(--mn-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    <path d="M2 10h20" />
  </svg>
);

const ImageIcon = () => (
  <svg className="h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const AudioIcon = () => (
  <svg className="h-5 w-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const FileTextIcon = () => (
  <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

const CodeIcon = () => (
  <svg className="h-5 w-5 text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const FileIcon = () => (
  <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const ListIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
  </svg>
);

const GridIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

export default function AssetViewer({ locale }: Props) {
  const [currentFiles, setCurrentFiles] = useState<S3File[]>([]);
  const [currentFolders, setCurrentFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Navigation & Search State
  const [currentPath, setCurrentPath] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<S3File | null>(null);

  // File Preview dynamic loading state
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Copy and download button states for header
  const [copyState, setCopyState] = useState<"idle" | "copying" | "success" | "error">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success">("idle");

  // View mode state
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const bucketUrl = assetConfig.sources.main;

  // Fetch S3 list files for current directory only (using Prefix and Delimiter)
  const fetchDirectory = async (path: string) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null); // Clear selected preview on folder change
    setSearchQuery(""); // Clear search filter on directory shift

    let allFiles: S3File[] = [];
    let allFolders: string[] = [];
    let token: string | null = null;
    let pageCount = 0;
    const maxPages = 5; // Safe guard for very large directories
    const prefix = path ? path + "/" : "";

    try {
      do {
        pageCount++;
        const queryParams = new URLSearchParams({
          "list-type": "2",
          "delimiter": "/",
          "prefix": prefix
        });
        if (token) {
          queryParams.set("continuation-token", token);
        }
        
        const response = await fetch(`${bucketUrl}?${queryParams.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch S3 bucket. Status: ${response.status}`);
        }
        
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Check for S3 error
        const errorNode = xmlDoc.getElementsByTagName("Error")[0];
        if (errorNode) {
          const errMsg = errorNode.getElementsByTagName("Message")[0]?.textContent || "S3 Error";
          throw new Error(errMsg);
        }

        // Parse CommonPrefixes (direct subdirectories)
        const commonPrefixes = Array.from(xmlDoc.getElementsByTagName("CommonPrefixes"));
        const folders = commonPrefixes.map(item => {
          const prefixVal = item.getElementsByTagName("Prefix")[0]?.textContent || "";
          const clean = prefixVal.replace(/\/$/, "");
          const lastSlash = clean.lastIndexOf("/");
          return lastSlash === -1 ? clean : clean.slice(lastSlash + 1);
        }).filter(Boolean);

        allFolders = [...allFolders, ...folders];

        // Parse Contents (direct files)
        const contents = Array.from(xmlDoc.getElementsByTagName("Contents"));
        const files: S3File[] = contents.map(item => {
          const key = item.getElementsByTagName("Key")[0]?.textContent || "";
          const size = parseInt(item.getElementsByTagName("Size")[0]?.textContent || "0", 10);
          const lastModified = item.getElementsByTagName("LastModified")[0]?.textContent || "";
          return { key, size, lastModified };
        }).filter(f => f.key !== prefix && !f.key.endsWith("/")); // Filter directory marker objects

        allFiles = [...allFiles, ...files];
        
        const isTruncated = xmlDoc.getElementsByTagName("IsTruncated")[0]?.textContent === "true";
        token = isTruncated ? (xmlDoc.getElementsByTagName("NextContinuationToken")[0]?.textContent || null) : null;
        
      } while (token && pageCount < maxPages);

      setCurrentFolders(allFolders.sort((a, b) => a.localeCompare(b)));
      setCurrentFiles(allFiles.sort((a, b) => a.key.localeCompare(b.key)));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to load directory contents.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath]);

  // Fetch text file preview content when selected file changes
  useEffect(() => {
    if (!selectedFile) {
      setPreviewContent(null);
      setPreviewError(null);
      return;
    }

    const ext = selectedFile.key.split(".").pop()?.toLowerCase();
    const isTextReadable = ["txt", "json", "xml", "csv", "md", "js", "ts", "yml", "yaml", "html", "css"].includes(ext || "");

    if (!isTextReadable) {
      setPreviewContent(null);
      setPreviewError(null);
      return;
    }

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewContent(null);
      try {
        const fileUrl = `${bucketUrl}/${selectedFile.key}`;
        const res = await fetch(fileUrl);
        if (!res.ok) {
          throw new Error(`Failed to load file preview (${res.status})`);
        }
        const text = await res.text();
        
        // Attempt JSON pretty printing if it ends in .json
        if (ext === "json") {
          try {
            const parsed = JSON.parse(text);
            setPreviewContent(JSON.stringify(parsed, null, 2));
          } catch {
            setPreviewContent(text);
          }
        } else {
          setPreviewContent(text);
        }
      } catch (err: any) {
        setPreviewError(err?.message || "Could not load preview.");
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [selectedFile]);

  // Merge folders and files into a single, folder-first sorted list (Unified List)
  const unifiedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // Map folder strings to UnifiedItem
    const foldersMapped: UnifiedItem[] = currentFolders.map(folder => ({
      type: "folder",
      name: folder,
      key: currentPath ? `${currentPath}/${folder}` : folder
    }));

    // Map file metadata to UnifiedItem
    const filesMapped: UnifiedItem[] = currentFiles.map(file => {
      const filename = file.key.slice(currentPath ? currentPath.length + 1 : 0);
      return {
        type: "file",
        name: filename,
        key: file.key,
        size: file.size,
        lastModified: file.lastModified
      };
    });

    // Apply local query filter if needed
    let filteredFolders = foldersMapped;
    let filteredFiles = filesMapped;
    if (query) {
      filteredFolders = foldersMapped.filter(f => f.name.toLowerCase().includes(query));
      filteredFiles = filesMapped.filter(f => f.name.toLowerCase().includes(query));
    }

    // Sort folders alphabetically, files alphabetically, and join them folder-first
    const sortedFolders = filteredFolders.sort((a, b) => a.name.localeCompare(b.name));
    const sortedFiles = filteredFiles.sort((a, b) => a.name.localeCompare(b.name));

    return [...sortedFolders, ...sortedFiles];
  }, [currentFolders, currentFiles, currentPath, searchQuery]);

  // Breadcrumbs paths
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const parts = currentPath.split("/");
    return parts.map((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      return { name: part, path };
    });
  }, [currentPath]);

  // Helper to determine file icon
  const getFileIcon = (key: string) => {
    const ext = key.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].includes(ext)) {
      return <ImageIcon />;
    }
    if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) {
      return <AudioIcon />;
    }
    if (["json"].includes(ext)) {
      return <CodeIcon />;
    }
    if (["txt", "md", "csv", "xml", "html", "css"].includes(ext)) {
      return <FileTextIcon />;
    }
    return <FileIcon />;
  };

  // Copy target key URL
  const handleCopy = async () => {
    if (!selectedFile) return;
    setCopyState("copying");
    try {
      const url = `${bucketUrl}/${selectedFile.key}`;
      await navigator.clipboard.writeText(url);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  };

  // Download target key binary
  const handleDownload = async () => {
    if (!selectedFile) return;
    setDownloadState("downloading");
    const fileUrl = `${bucketUrl}/${selectedFile.key}`;
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = selectedFile.key.split("/").pop() || "download";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setDownloadState("success");
    } catch {
      window.open(fileUrl, "_blank");
      setDownloadState("success");
    }
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  // Header Actions configuration for Modal
  const previewActions = selectedFile ? (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloadState === "downloading"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
        title="Download File"
      >
        {downloadState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {downloadState === "downloading" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {downloadState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint-deep)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>

      <button
        type="button"
        onClick={handleCopy}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
        title="Copy URL"
      >
        {copyState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {copyState === "copying" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {copyState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint-deep)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {copyState === "error" && <svg className="h-4 w-4 text-[var(--mn-rose)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </button>
    </>
  ) : null;

  return (
    <div className="relative min-h-[500px]">
      {/* Search and Navigation Bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Path Breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-[var(--mn-text)]">
          <button
            onClick={() => { setCurrentPath(""); }}
            className="rounded-lg px-2.5 py-1.5 hover:bg-[var(--mn-cream-deep)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--mn-accent)]"
          >
            Root
          </button>
          
          {breadcrumbs.map((bc) => (
            <div key={bc.path} className="flex items-center gap-1.5">
              <span className="text-[var(--mn-text-muted)]">/</span>
              <button
                onClick={() => { setCurrentPath(bc.path); }}
                className="rounded-lg px-2.5 py-1.5 hover:bg-[var(--mn-cream-deep)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--mn-accent)]"
              >
                {bc.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search/Filter Input */}
        <div className="relative max-w-sm w-full">
          <input
            type="text"
            placeholder={t(locale, "cards.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 pl-10 pr-4 text-sm font-medium text-[var(--mn-text)] outline-none transition-all focus:border-[var(--mn-accent)] placeholder-[var(--mn-text-muted)]"
          />
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mn-text-muted)]">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" /></svg>
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--mn-accent-soft)]"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-[var(--mn-accent)] animate-spin"></div>
          </div>
          <p className="mt-6 text-sm font-semibold text-[var(--mn-accent-deep)]">Loading contents...</p>
        </div>
      ) : error ? (
        <div className="rounded-3xl border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-[var(--mn-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          <h3 className="mt-4 font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]">Request Failed</h3>
          <p className="mt-2 text-sm text-[var(--mn-text-muted)]">{error}</p>
          <button
            onClick={() => fetchDirectory(currentPath)}
            className="mt-6 mn-stamp rounded-full px-5 py-2.5 text-xs font-black shadow-[var(--mn-shadow-stamp-sm)]"
          >
            Retry Fetch
          </button>
        </div>
      ) : (
        /* Unified Explorer Panel */
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-[13px] font-black uppercase tracking-widest text-[var(--mn-text-muted)]">
              {currentPath ? currentPath.split("/").pop() : "Root Contents"} ({unifiedItems.length} items)
            </h3>
            
            {/* View layout controls */}
            {unifiedItems.length > 0 && (
              <div className="flex items-center gap-4">
                {/* View switcher */}
                <div className="flex border-2 border-[var(--mn-border)] rounded-full overflow-hidden bg-[var(--mn-paper)] shrink-0">
                  <button
                    onClick={() => setViewMode("list")}
                    aria-label="List view"
                    className={`flex items-center justify-center p-2 transition-colors ${viewMode === "list" ? "bg-[var(--mn-accent)] text-white" : "text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]"}`}
                  >
                    <ListIcon />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    className={`flex items-center justify-center p-2 transition-colors ${viewMode === "grid" ? "bg-[var(--mn-accent)] text-white" : "text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]"}`}
                  >
                    <GridIcon />
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow)] overflow-hidden">
            {unifiedItems.length === 0 && !currentPath ? (
              <div className="py-16 text-center text-sm font-semibold text-[var(--mn-text-muted)]">
                The directory is empty.
              </div>
            ) : unifiedItems.length === 0 ? (
              <div className="py-16 text-center text-sm font-semibold text-[var(--mn-text-muted)]">
                No items match your filter criteria.
              </div>
            ) : viewMode === "list" ? (
              /* List Mode (Table layout) */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-[var(--mn-cream-deep)]/40 border-b border-[var(--mn-border)] font-bold text-[var(--mn-text)]">
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3 w-32">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--mn-border)] divide-dashed">
                    {/* Parent Folder navigation in list mode */}
                    {currentPath && !searchQuery && (
                      <tr
                        onClick={() => {
                          const idx = currentPath.lastIndexOf("/");
                          const next = idx === -1 ? "" : currentPath.slice(0, idx);
                          setCurrentPath(next);
                        }}
                        className="hover:bg-[var(--mn-cream-deep)]/30 cursor-pointer font-bold text-[var(--mn-text-muted)]"
                      >
                        <td className="px-6 py-3 flex items-center gap-3">
                          <span className="shrink-0">
                            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                          </span>
                          <span>.. (Go Up)</span>
                        </td>
                        <td className="px-6 py-3">—</td>
                      </tr>
                    )}

                    {unifiedItems.map(item => (
                      <tr
                        key={item.key}
                        onClick={() => {
                          if (item.type === "folder") {
                            setCurrentPath(item.key);
                          } else {
                            setSelectedFile({
                              key: item.key,
                              size: item.size || 0,
                              lastModified: item.lastModified || ""
                            });
                          }
                        }}
                        className={`hover:bg-[var(--mn-cream-deep)]/30 cursor-pointer transition-colors ${selectedFile?.key === item.key ? "bg-[var(--mn-accent-soft)]/45 font-bold" : ""}`}
                      >
                        <td className={`px-6 py-3.5 flex items-center gap-3 font-bold text-[var(--mn-text)] ${item.type === "folder" ? "text-[var(--mn-accent-deep)]" : ""}`}>
                          <span className="shrink-0">
                            {item.type === "folder" ? <FolderIcon /> : getFileIcon(item.key)}
                          </span>
                          <span className="truncate max-w-xs md:max-w-md select-all" title={item.name}>{item.name}</span>
                        </td>
                        <td className="px-6 py-3.5 text-[var(--mn-text-muted)] font-medium">
                          {item.type === "file" ? (
                            <span className="inline-block rounded-full bg-[var(--mn-cream-deep)] px-2.5 py-0.5 font-bold text-[var(--mn-text)] font-sans">
                              {formatBytes(item.size || 0)}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid Mode (Card layouts) */
              <div className="p-6 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {/* Parent Folder navigation in grid mode */}
                {currentPath && !searchQuery && (
                  <button
                    onClick={() => {
                      const idx = currentPath.lastIndexOf("/");
                      const next = idx === -1 ? "" : currentPath.slice(0, idx);
                      setCurrentPath(next);
                    }}
                    className="mn-card mn-stamp-press flex flex-col items-center justify-center p-4 border border-[var(--mn-border)] rounded-2xl hover:border-[var(--mn-accent)] text-center gap-2 bg-[var(--mn-paper)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--mn-cream-deep)] shadow-[var(--mn-shadow-stamp-sm)]">
                      <svg className="h-5 w-5 text-[var(--mn-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-xs font-bold text-[var(--mn-text)] truncate px-1">Go Up</p>
                      <p className="text-[10px] text-[var(--mn-text-muted)] font-bold mt-0.5">Parent dir</p>
                    </div>
                  </button>
                )}

                {unifiedItems.map(item => (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (item.type === "folder") {
                        setCurrentPath(item.key);
                      } else {
                        setSelectedFile({
                          key: item.key,
                          size: item.size || 0,
                          lastModified: item.lastModified || ""
                        });
                      }
                    }}
                    className={`mn-card mn-stamp-press flex flex-col items-center justify-center p-4 border rounded-2xl hover:border-[var(--mn-accent)] text-center gap-2 bg-[var(--mn-paper)] ${selectedFile?.key === item.key ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)]/30" : "border-[var(--mn-border)]"}`}
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-[var(--mn-shadow-stamp-sm)] ${item.type === "folder" ? "bg-[var(--mn-accent-soft)]" : "bg-[var(--mn-cream-deep)]"}`}>
                      {item.type === "folder" ? <FolderIcon /> : getFileIcon(item.key)}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-xs font-bold text-[var(--mn-text)] truncate px-1" title={item.name}>{item.name}</p>
                      <p className="text-[10px] text-[var(--mn-text-muted)] font-bold mt-0.5">
                        {item.type === "folder" ? "Directory" : formatBytes(item.size || 0)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shared Popup Modal Preview dialog */}
      <Modal
        isOpen={selectedFile !== null}
        onClose={() => {
          setSelectedFile(null);
          setCopyState("idle");
          setDownloadState("idle");
        }}
        title={selectedFile?.key.split("/").pop() || ""}
        size="lg"
        headerActions={previewActions}
      >
        {selectedFile && (
          <div className="space-y-6">
            {/* Properties Card (just Key and Size) */}
            <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 space-y-2.5 text-xs text-[var(--mn-text)] font-medium">
              <div className="flex justify-between py-1 border-b border-[var(--mn-border)] border-dashed border-opacity-30">
                <span className="text-[var(--mn-text-muted)]">Key</span>
                <span className="font-bold text-right truncate max-w-[70%] select-all" title={selectedFile.key}>{selectedFile.key}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[var(--mn-text-muted)]">Size</span>
                <span className="font-bold">{formatBytes(selectedFile.size)}</span>
              </div>
            </div>

            {/* Media Preview Box */}
            <div>
              {/* Image Previews */}
              {["png", "jpg", "jpeg", "webp", "gif", "svg", "ico"].includes(selectedFile.key.split(".").pop()?.toLowerCase() || "") ? (
                <div className="rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-slate-100 p-2 shadow-inner flex items-center justify-center overflow-hidden min-h-[220px]">
                  <img
                    src={`${bucketUrl}/${selectedFile.key}`}
                    alt="Preview"
                    className="max-h-[50vh] max-w-full object-contain rounded-xl"
                    loading="lazy"
                  />
                </div>
              ) : /* Audio Previews */
              ["mp3", "wav", "ogg", "m4a", "flac"].includes(selectedFile.key.split(".").pop()?.toLowerCase() || "") ? (
                <div className="rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-6 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4 animate-pulse">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2Zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2ZM9 10l12-3" /></svg>
                  </div>
                  <audio
                    controls
                    src={`${bucketUrl}/${selectedFile.key}`}
                    className="w-full focus:outline-none"
                  />
                </div>
              ) : /* Readable Text Preview */
              ["txt", "json", "xml", "csv", "md", "js", "ts", "yml", "yaml", "html", "css"].includes(selectedFile.key.split(".").pop()?.toLowerCase() || "") ? (
                <div className="relative">
                  {previewLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-surface)] min-h-[150px]">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--mn-accent-soft)] border-t-[var(--mn-accent)]"></div>
                      <p className="mt-4 text-xs font-semibold text-[var(--mn-text-muted)]">Loading content preview...</p>
                    </div>
                  ) : previewError ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs text-red-600">
                      Failed to fetch file content preview.<br />
                      {previewError}
                    </div>
                  ) : (
                    <pre className="p-4 max-h-[45vh] overflow-auto bg-[var(--mn-surface)] border border-[var(--mn-border)] rounded-2xl font-mono text-[11px] leading-relaxed text-[var(--mn-text)] whitespace-pre-wrap break-all select-all">
                      {previewContent}
                    </pre>
                  )}
                </div>
              ) : (
                /* No preview available */
                <div className="rounded-2xl border border-[var(--mn-border)] border-dashed bg-[var(--mn-surface)] py-12 text-center text-xs font-bold text-[var(--mn-text-muted)]">
                  Previews are not supported for this file type.<br />
                  Use the header download button to save this file.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
