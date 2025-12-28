import React, { useState, useEffect, Suspense } from "react";
import JSZip from "jszip";
import { Loader2 } from "lucide-react";

// --- LAZY LOAD HEAVY COMPONENTS ---
// This splits the code into small chunks. The mobile phone only downloads what it needs.
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full text-blue-500 gap-2">
    <Loader2 className="w-8 h-8 animate-spin" />
    <span>Loading Viewer...</span>
  </div>
);

const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipFiles, setZipFiles] = useState([]);

  const getLanguage = (ext) => {
    const map = { js: "javascript", py: "python", java: "java", cpp: "cpp", html: "html", css: "css", json: "json", sql: "sql", rs: "rust", go: "go", md: "markdown" };
    return map[ext] || "plaintext";
  };

  useEffect(() => {
    if (['zip', 'jar'].includes(fileType) && file) {
      JSZip.loadAsync(file).then((zip) => setZipFiles(Object.keys(zip.files)));
    }
  }, [file, fileType]);

  // A. Backend Converted Content (Excel, Jupyter)
  if (backendData?.type === 'html_table' || backendData?.type === 'html_doc') {
    return <div dangerouslySetInnerHTML={{ __html: backendData.content }} className="prose max-w-none p-4 overflow-auto h-full" />;
  }

  // B. Images (Loads instantly, no lazy loading needed)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(fileType)) {
    return <img src={URL.createObjectURL(file)} className="max-w-full max-h-full object-contain mx-auto" />;
  }

  // C. Video/Audio
  if (['mp4', 'webm', 'mp3', 'wav'].includes(fileType)) {
    return <video controls src={URL.createObjectURL(file)} className="w-full max-h-full" />;
  }

  // D. PDF
  if (fileType === 'pdf') {
     return <iframe src={URL.createObjectURL(file)} className="w-full h-full" />;
  }

  // E. 3D Models (STL) - LOADED ON DEMAND
  if (fileType === 'stl') {
    return (
      <div className="h-[500px]">
        <Suspense fallback={<LoadingSpinner />}>
          <ModelViewer url={URL.createObjectURL(file)} />
        </Suspense>
      </div>
    );
  }

  // F. Archives
  if (['zip', 'jar'].includes(fileType)) {
    return (
      <div className="p-4">
         <h3 className="font-bold mb-2">Archive Contents:</h3>
         <ul className="list-disc pl-5 text-sm font-mono text-blue-700">
           {zipFiles.map(f => <li key={f}>{f}</li>)}
         </ul>
      </div>
    );
  }

  // G. Code & Text - LOADED ON DEMAND
  const codeExts = ['c','cpp','h','java','py','cs','rs','go','html','css','js','ts','php','json','yaml','sql','sh','md','txt','env','dockerfile'];
  
  if (codeExts.includes(fileType)) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Editor 
          height="100%" 
          language={getLanguage(fileType)} 
          value={fileContent || "Loading..."} 
          theme="vs-dark" 
          options={{ readOnly: true, minimap: { enabled: false } }} 
        />
      </Suspense>
    );
  }

  // H. Fallback: Hex Dump (Simple text, fast render)
  return (
    <div className="p-4 font-mono text-xs bg-gray-900 text-green-400 h-full overflow-auto">
      <div className="mb-2 border-b border-gray-700 pb-2 font-bold text-yellow-500">BINARY / HEX MODE (First 1000 bytes)</div>
      <div className="break-all">
        {fileContent && typeof fileContent === 'string' ? fileContent.slice(0, 2000) : "Binary content loaded."}
      </div>
    </div>
  );
};

export default UniversalViewer;