import React, { useState, useEffect, Suspense, useRef } from "react";
import JSZip from "jszip";
import axios from "axios";
import { Loader2, Download, FileText, FolderOpen, ArrowLeft, FileQuestion } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

const API_URL = "https://universal-file-opener.onrender.com";

// --- HELPERS ---
const LoadingSpinner = ({ text }) => (
  <div className="flex flex-col items-center justify-center h-full text-blue-500 gap-3 p-6 text-center">
    <Loader2 className="w-10 h-10 animate-spin" />
    <span className="font-semibold text-lg">{text || "Loading..."}</span>
  </div>
);

// --- GESTURE ZOOM WRAPPER (Pinch-to-Zoom) ---
const ZoomWrapper = ({ children }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  
  // State is stored in Refs for performance (No React Re-renders)
  const state = useRef({
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    startDist: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Helper to update CSS directly (GPU Accelerated)
    const updateTransform = () => {
      if (contentRef.current) {
        const { scale } = state.current;
        contentRef.current.style.transform = `scale(${scale})`;
        // Expanding width ensures we can scroll to see edges when zoomed in
        contentRef.current.style.width = scale > 1 ? `${scale * 100}%` : '100%';
      }
    };

    // --- TOUCH HANDLERS (Mobile Pinch) ---
    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Stop browser zooming
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        // Calculate distance between fingers
        state.current.startDist = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const newDist = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);

        // Calculate zoom factor
        const scaleChange = newDist / state.current.startDist;
        
        // Apply smooth limit (0.5x to 3x)
        let newScale = state.current.scale * scaleChange;
        newScale = Math.max(0.5, Math.min(newScale, 3.5));
        
        state.current.scale = newScale;
        state.current.startDist = newDist; // Reset for smooth continuous zoom
        
        updateTransform();
      }
    };

    // --- WHEEL HANDLER (Desktop Ctrl+Scroll) ---
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY * -0.01;
        let newScale = state.current.scale + delta;
        newScale = Math.max(0.5, Math.min(newScale, 3.5));
        state.current.scale = newScale;
        updateTransform();
      }
    };

    // Attach Listeners (Non-Passive for preventDefault support)
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full flex flex-col overflow-hidden bg-gray-50 touch-pan-x touch-pan-y"
    >
      <div className="flex-1 overflow-auto p-4 w-full h-full">
        <div 
          ref={contentRef}
          className="origin-top-left transition-transform duration-75 ease-out will-change-transform"
          style={{ 
            width: '100%', 
            minHeight: '100%',
            backfaceVisibility: 'hidden' // GPU Optimization
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// --- EXTENSION MAPS ---
const EXT_MAP = {
  code: ['c','cpp','cc','cxx','h','hpp','hh','hxx', 'java','class','jar', 'py','pyc','pyd','pyo','pyw', 'cs','csproj','sln', 'rs', 'go'],
  web: ['html','htm','css','js','mjs', 'ts','tsx', 'php','php3','php4','phtml','rb', 'jsx','vue','svelte','erb', 'sass','scss','less','styl'],
  mobile: ['kt','xml','gradle', 'swift','m', 'dart'],
  data: ['json','yaml','yml','toml','ini','cfg','conf','env', 'sql','db','sqlite','psql', 'md','tex','rst'],
  script: ['sh','bash','zsh', 'bat','cmd','ps1','vbs', 'dockerfile','makefile','cmake','vagrantfile'],
  niche: ['hs','scala','erl','ex','exs','clj', 'v','r','jl', 'txt','rtf','log'],
  office: ['docx','doc', 'xlsx','xls','csv', 'pptx','ppt','ppsx', 'odt','ods','odp', 'epub', 'ipynb', 'parquet'],
  image: ['jpg','jpeg','png','gif','bmp','tiff','webp','heic','svg','ico'],
  video: ['mp4','mkv','avi','mov','wmv','flv','webm'],
  audio: ['mp3','wav','aac','flac','ogg','m4a','wma'],
  model: ['stl','obj'],
  pdf: ['pdf']
};

const BACKEND_EXTS = EXT_MAP.office;
const TEXT_EXTS = [...EXT_MAP.code, ...EXT_MAP.web, ...EXT_MAP.mobile, ...EXT_MAP.data, ...EXT_MAP.script, ...EXT_MAP.niche];

const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipContent, setZipContent] = useState(null);
  const [selectedZipFile, setSelectedZipFile] = useState(null);
  const [internalFileType, setInternalFileType] = useState('');
  const [internalFileUrl, setInternalFileUrl] = useState(null);
  const [internalFileContent, setInternalFileContent] = useState(null);
  const [internalBackendData, setInternalBackendData] = useState(null);
  const [internalLoading, setInternalLoading] = useState(false);

  // --- ZIP LOADING ---
  useEffect(() => {
    if ((fileType === 'zip' || fileType === 'jar') && file) {
      JSZip.loadAsync(file).then((zip) => setZipContent(zip));
    }
  }, [file, fileType]);

  // --- HANDLE ZIP CLICK ---
  const handleZipFileClick = async (relativePath) => {
    if (!zipContent) return;
    const zipObj = zipContent.files[relativePath];
    if (zipObj.dir) return;

    setInternalLoading(true);
    setInternalBackendData(null);
    setInternalFileContent(null);
    setSelectedZipFile(relativePath);

    const ext = relativePath.split('.').pop().toLowerCase();
    setInternalFileType(ext);
    const blob = await zipObj.async("blob");
    const url = URL.createObjectURL(blob);
    setInternalFileUrl(url);

    if (BACKEND_EXTS.includes(ext)) {
      const formData = new FormData();
      const virtualFile = new File([blob], relativePath, { type: blob.type });
      formData.append('file', virtualFile);
      try {
        const res = await axios.post(`${API_URL}/detect-and-convert`, formData);
        setInternalBackendData(res.data);
      } catch (e) { console.error(e); }
    } else if (TEXT_EXTS.includes(ext)) {
      const text = await zipObj.async("string");
      setInternalFileContent(text);
    }
    
    setInternalLoading(false);
  };

  const closeInternalFile = () => {
    setSelectedZipFile(null);
    setInternalFileUrl(null);
    setInternalFileContent(null);
    setInternalBackendData(null);
  };

  const renderContent = (type, url, content, data, fileName) => {
    let contentComponent = null;

    // 1. BACKEND CONTENT (Excel, Word)
    if (data?.type === 'html_table' || data?.type === 'html_doc') {
      contentComponent = (
        <div>
          <style>{`
            table { border-collapse: collapse; background: white; } 
            th, td { border: 1px solid #ccc; padding: 6px; white-space: nowrap; font-size: 13px; color: #333; }
            th { background-color: #f3f4f6; font-weight: bold; text-align: left; }
            tr:nth-child(even) { background-color: #f9fafb; }
          `}</style>
          <div dangerouslySetInnerHTML={{ __html: data.content }} className="prose max-w-none bg-white shadow-sm p-4 inline-block" />
        </div>
      );
    }
    // 2. IMAGES
    else if (EXT_MAP.image.includes(type) || data?.type === 'image_pass') {
      contentComponent = <img src={url} className="max-w-none object-contain mx-auto" style={{ minWidth: 'auto' }} />;
    }
    // 3. PDF
    else if (type === 'pdf' || data?.type === 'pdf_pass') {
       return <Suspense fallback={<LoadingSpinner />}><PdfRenderer url={url} /></Suspense>;
    }
    // 4. 3D
    else if (EXT_MAP.model.includes(type)) {
      contentComponent = <div className="h-[500px] w-full"><Suspense fallback={<LoadingSpinner />}><ModelViewer url={url} /></Suspense></div>;
    }
    // 5. Code
    else if (content || data?.type === 'text_content') {
      const displayContent = data?.type === 'text_content' ? data.content : content;
      const getLanguage = (e) => ({ js:'javascript', py:'python', java:'java', html:'html', css:'css', json:'json', sql:'sql', md:'markdown' }[e] || "plaintext");
      contentComponent = (
        <div className="h-[800px] w-full bg-[#1e1e1e]"> 
          <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}><Editor height="100%" language={getLanguage(type)} value={displayContent} theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false } }} /></Suspense>
        </div>
      );
    }
    // 6. Media
    else if (EXT_MAP.video.includes(type)) return <video controls src={url} className="max-w-full" />;
    else if (EXT_MAP.audio.includes(type)) return <div className="flex items-center justify-center h-60"><audio controls src={url} /></div>;
    // 7. Fallback
    else {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
          <FileQuestion className="w-12 h-12 text-gray-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
          <p className="mb-6 max-w-sm">Cannot display .{type} files directly.</p>
          <a href={url} download={fileName} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"><Download className="w-5 h-5" /> Download File</a>
        </div>
      );
    }

    return <ZoomWrapper>{contentComponent}</ZoomWrapper>;
  };

  // --- MAIN RENDER ---
  if (selectedZipFile) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-gray-100 p-2 border-b flex items-center gap-2">
          <button onClick={closeInternalFile} className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft size={16} /> Back to Archive</button>
          <span className="text-gray-500 text-sm truncate">/ {selectedZipFile}</span>
        </div>
        <div className="flex-1 overflow-hidden relative">
          {internalLoading ? <LoadingSpinner text="Converting File..." /> : renderContent(internalFileType, internalFileUrl, internalFileContent, internalBackendData, selectedZipFile)}
        </div>
      </div>
    );
  }

  if ((fileType === 'zip' || fileType === 'jar') && zipContent) {
    return (
      <div className="p-4 h-full overflow-auto bg-gray-50">
         <h3 className="font-bold mb-4 flex items-center gap-2 text-lg text-gray-800"><FolderOpen className="text-yellow-500" /> Archive Contents:</h3>
         <div className="grid gap-2">
           {Object.keys(zipContent.files).map((path) => {
             const isDir = zipContent.files[path].dir;
             return (
               <div key={path} onClick={() => !isDir && handleZipFileClick(path)} className={`p-3 rounded-lg border flex items-center gap-3 transition ${isDir ? 'bg-gray-200 text-gray-600' : 'bg-white hover:bg-blue-50 cursor-pointer shadow-sm hover:shadow-md'}`}>
                 {isDir ? <FolderOpen size={20} /> : <FileText size={20} className="text-blue-500" />}
                 <span className="font-mono text-sm truncate select-none">{path}</span>
               </div>
             );
           })}
         </div>
      </div>
    );
  }

  if (fileType === '7z') return <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-gray-50"><FolderOpen className="w-16 h-16 text-yellow-600 mb-4" /><h2 className="text-xl font-bold mb-2">7-Zip Archive (.7z)</h2><p className="max-w-md text-gray-600 mb-6">Browsing .7z files directly is too heavy for browsers. Please download locally.</p><a href={file ? URL.createObjectURL(file) : "#"} download={file?.name} className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 transition flex items-center gap-2"><Download size={20} /> Download .7z File</a></div>;

  return renderContent(fileType, file ? URL.createObjectURL(file) : null, fileContent, backendData, file?.name);
};

export default UniversalViewer;