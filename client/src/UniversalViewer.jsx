import React, { useState, useEffect, Suspense } from "react";
import JSZip from "jszip";
import { Loader2, Download, FileQuestion } from "lucide-react";

// Lazy Load Components
const Editor = React.lazy(() => import("@monaco-editor/react"));
const ModelViewer = React.lazy(() => import("./ModelViewer"));
const PdfRenderer = React.lazy(() => import("./PdfRenderer"));

const LoadingSpinner = ({ text }) => (
  <div className="flex items-center justify-center h-full text-blue-500 gap-2">
    <Loader2 className="w-8 h-8 animate-spin" />
    <span>{text || "Loading..."}</span>
  </div>
);

const UniversalViewer = ({ file, fileType, fileContent, backendData }) => {
  const [zipFiles, setZipFiles] = useState([]);

  // 1. MEGA MAPPING of Extensions to Editor Languages
  const getLanguage = (ext) => {
    const map = {
      js:'javascript', mjs:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
      py:'python', pyw:'python', ipynb:'python',
      java:'java', kt:'kotlin',
      c:'c', cpp:'cpp', cc:'cpp', cxx:'cpp', h:'cpp', hpp:'cpp', cs:'csharp',
      go:'go', rs:'rust', swift:'swift', dart:'dart',
      php:'php', rb:'ruby',
      html:'html', htm:'html', css:'css', scss:'scss', less:'less',
      json:'json', yaml:'yaml', yml:'yaml', xml:'xml', sql:'sql',
      sh:'shell', bash:'shell', zsh:'shell', bat:'bat', ps1:'powershell',
      md:'markdown', dockerfile:'dockerfile',
      r:'r', clj:'clojure', ex:'elixir',
      // Add more as needed
    };
    return map[ext] || "plaintext";
  };

  useEffect(() => {
    if (['zip', 'jar'].includes(fileType) && file) {
      JSZip.loadAsync(file).then((zip) => setZipFiles(Object.keys(zip.files)));
    }
  }, [file, fileType]);

  // --- VIEWING LOGIC ---

  // A. Backend Content (Office, Docx, PPTX, Excel, HTML)
  if (backendData?.type === 'html_table' || backendData?.type === 'html_doc') {
    return <div dangerouslySetInnerHTML={{ __html: backendData.content }} className="prose max-w-none p-4 overflow-auto h-full" />;
  }

  // B. Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(fileType)) {
    return <img src={URL.createObjectURL(file)} className="max-w-full max-h-full object-contain mx-auto" />;
  }

  // C. Audio / Video
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(fileType)) {
    return <video controls src={URL.createObjectURL(file)} className="w-full max-h-full" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac'].includes(fileType)) {
    return <div className="flex items-center justify-center h-full"><audio controls src={URL.createObjectURL(file)} /></div>;
  }

  // D. PDF
  if (fileType === 'pdf') {
     return (
       <Suspense fallback={<LoadingSpinner text="Loading PDF..." />}>
         <PdfRenderer url={URL.createObjectURL(file)} />
       </Suspense>
     );
  }

  // E. 3D Models
  if (['stl', 'obj'].includes(fileType)) {
    return (
      <div className="h-[500px]">
        <Suspense fallback={<LoadingSpinner text="Loading 3D Engine..." />}>
          <ModelViewer url={URL.createObjectURL(file)} />
        </Suspense>
      </div>
    );
  }

  // F. Archives (Zip/Jar)
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

  // G. Code & Text (Only if content exists)
  if (fileContent) {
    return (
      <Suspense fallback={<LoadingSpinner text="Loading Editor..." />}>
        <Editor 
          height="100%" 
          language={getLanguage(fileType)} 
          value={fileContent} 
          theme="vs-dark" 
          options={{ readOnly: true, minimap: { enabled: false } }} 
        />
      </Suspense>
    );
  }

  // H. FINAL FALLBACK: NO BINARY NUMBERS!
  // If we don't know the file, or backend failed, show this Download Card.
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 text-gray-600 p-6 text-center">
      <FileQuestion className="w-16 h-16 text-gray-400 mb-4" />
      <h2 className="text-xl font-semibold mb-2">Preview Unavailable</h2>
      <p className="mb-6 max-w-sm">
        We cannot display this file type (.{fileType}) directly in the browser.
      </p>
      <a 
        href={URL.createObjectURL(file)} 
        download={file.name}
        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
      >
        <Download className="w-5 h-5" />
        Download File
      </a>
    </div>
  );
};

export default UniversalViewer;