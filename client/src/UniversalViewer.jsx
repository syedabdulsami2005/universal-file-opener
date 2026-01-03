import React, { useState, useEffect, Suspense, useRef, useMemo, useLayoutEffect, useCallback } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx"; 
import mammoth from "mammoth";
import Papa from "papaparse"; 
import hljs from "highlight.js"; 
import "highlight.js/styles/vs2015.css"; 
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion, Eye, FileCode, FileImage, Home, Music, Video, Database, Box, Terminal, ChevronRight } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

// --- CONFIGURATION ---
const PREVIEW_SIZE = 2097152; // 2MB

// --- HELPER ICONS MAP ---
const getIconForExt = (ext) => {
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return FileImage;
  if (['mp4','webm','mkv'].includes(ext)) return Video;
  if (['mp3','wav','ogg'].includes(ext)) return Music;
  if (['js','jsx','ts','tsx','py','java','c','cpp','html','css'].includes(ext)) return FileCode;
  if (['sql','db','sqlite','csv','xlsx'].includes(ext)) return Database;
  if (['sh','bat','cmd'].includes(ext)) return Terminal;
  return FileText;
};

// --- INSTANT CODE PREVIEW (Fixed: useEffect + loading state) ---
const InstantCodePreview = ({ content, language }) => {
  const codeRef = useRef(null);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (codeRef.current && content && content.length > 0) {
      try {
        const safeLang = hljs.getLanguage(language) ? language : 'plaintext';
        codeRef.current.innerHTML = hljs.highlight(content, { language: safeLang }).value;
        setHighlighted(true);
      } catch (e) {
        codeRef.current.textContent = content.substring(0, 5000) + '...'; // Safe fallback
        setHighlighted(true);
      }
    }
  }, [content, language]);

  if (!content || content.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-500">Loading code...</div>;
  }

  return (
    <pre className="m-0 p-4 text-sm font-mono leading-relaxed overflow-auto h-full text-gray-200 bg-[#1e1e1e]">
      <code ref={codeRef} className={!highlighted ? 'opacity-50' : ''} />
    </pre>
  );
};

// --- ZIP NAVIGATOR (Fixed: pass ChevronRight) ---
const ZipNavigator = ({ zipContent, onFileClick }) => {
  // ... (keep your existing ZipNavigator code exactly as is)
  // Just ensure ChevronRight is imported above
  const { folders, files } = useMemo(() => {
    // ... existing logic
  }, [zipContent, currentPath]);

  // ... rest unchanged
};

// --- PAGINATED TABLE (Unchanged) ---
const PaginatedTable = ({ data }) => {
  // ... keep exactly as is
};

// --- ZOOM WRAPPER (Unchanged) ---
const ZoomWrapper = ({ children }) => {
  // ... keep exactly as is
};

// --- FIXED MAIN PROCESSOR (Core Fix: Proper async handling) ---
const UniversalViewer = ({ file, fileType }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewMode, setViewMode] = useState("preview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // FIXED: Proper async file processor
  const processFile = useCallback(async (fileInput, fileName) => {
    setLoading(true);
    setError(null);
    setSelectedFile(null);
    setViewMode("preview");

    try {
      const ext = fileName.split('.').pop().toLowerCase().toLowerCase();
      let result = { name: fileName, ext, type: 'download', url: null };

      // Handle JSZip object vs File/Blob
      let contentBlob;
      if (fileInput.async) { // JSZip entry
        contentBlob = await fileInput.async("blob");
      } else { // Direct file
        contentBlob = fileInput.slice(0, PREVIEW_SIZE);
      }

      const fileUrl = URL.createObjectURL(contentBlob);
      result.url = fileUrl;

      // Type detection & processing
      if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) {
        result.type = 'image';
      } else if (['mp4','webm','mkv','mov'].includes(ext)) {
        result.type = 'video';
      } else if (['mp3','wav','ogg','m4a'].includes(ext)) {
        result.type = 'audio';
      } else if (ext === 'pdf') {
        result.type = 'pdf';
      } else if (['txt','md','js','jsx','ts','tsx','py','java','c','cpp','h','cs','go','rs','php','rb','html','css','scss','json','xml','yaml','sql','sh','bat','gradle','properties','log'].includes(ext)) {
        result.type = 'code';
        result.content = await contentBlob.text();
      } else if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
        result.type = 'table';
        const arrayBuffer = await contentBlob.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        result.data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      } else if (ext === 'csv') {
        result.type = 'table';
        const text = await contentBlob.text();
        result.data = Papa.parse(text, { header: false, preview: 1000 }).data;
      } else if (ext === 'docx') {
        result.type = 'html_doc';
        const arrayBuffer = await contentBlob.arrayBuffer();
        const mammothResult = await mammoth.convertToHtml({ arrayBuffer });
        result.content = mammothResult.value;
      } else if (['stl','obj'].includes(ext)) {
        result.type = 'model';
      }

      setSelectedFile(result);
    } catch (e) {
      console.error("File processing error:", e);
      setError(`Failed to process ${fileName}: ${e.message}`);
      setSelectedFile({ name: fileName, type: 'download', error: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  // FIXED: Initial load with proper async
  useEffect(() => {
    if (!file) return;

    const init = async () => {
      if (['zip', 'jar'].includes(fileType?.toLowerCase())) {
        try {
          const zip = await JSZip.loadAsync(file);
          setZipContent(zip);
          setSelectedFile(null); // Show navigator
        } catch (e) {
          setError("Invalid ZIP/JAR file");
        }
      } else {
        await processFile(file, file?.name || "unknown");
      }
    };

    init();
  }, [file, fileType, processFile]);

  const handleZipClick = (path, name) => {
    processFile(zipContent.files[path], name);
  };

  // --- RENDER (Fixed error handling + loading) ---
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 gap-4 p-8 text-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
        <div>
          <div className="text-lg font-medium text-gray-700 mb-1">Processing file...</div>
          <div className="text-sm text-gray-500">Instant preview in seconds</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 gap-4 p-8 text-center">
        <FileQuestion className="w-16 h-16 text-red-400" />
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">{error}</h2>
          <p className="text-gray-600 mb-4">Try a different file or refresh.</p>
        </div>
      </div>
    );
  }

  // Zip navigator
  if (zipContent && !selectedFile) {
    return <ZipNavigator zipContent={zipContent} onFileClick={handleZipClick} />;
  }

  // Selected file viewer (keep your FileRenderer exactly as is)
  if (selectedFile) {
    return (
      <div className="flex flex-col h-full bg-gray-100 relative">
        {zipContent && (
          <div className="bg-white p-3 border-b flex items-center gap-3 shadow-sm z-20 shrink-0">
            <button 
              onClick={() => setSelectedFile(null)} 
              className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 p-1 rounded"
            >
              <ArrowLeft size={18} /> Back to ZIP
            </button>
            <span className="text-gray-700 text-sm font-medium truncate flex-1">{selectedFile.name}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden relative w-full h-full">
          <FileRenderer viewState={selectedFile} viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      <FileText className="w-12 h-12 mb-2" />
      <div>No file selected</div>
    </div>
  );
};

export default UniversalViewer;
