import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import JSZip from "jszip";
// FIX: useLoader is now correctly imported from fiber, not drei
import { Canvas, useLoader } from "@react-three/fiber"; 
import { Stage, OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

// 1. 3D Viewer Component
const ModelViewer = ({ url }) => {
  try {
    const geom = useLoader(STLLoader, url);
    return (
      <Canvas camera={{ position: [0, 0, 100], fov: 50 }} className="h-full w-full">
        <Stage environment="city" intensity={0.6}>
          <mesh geometry={geom}>
            <meshStandardMaterial color="orange" />
          </mesh>
        </Stage>
        <OrbitControls autoRotate />
      </Canvas>
    );
  } catch (e) { return <div className="text-red-500">Error loading 3D model</div>; }
};

// 2. Main Viewer Logic
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

  // B. Images
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

  // E. 3D Models (STL)
  if (fileType === 'stl') {
    return <div className="h-[500px]"><ModelViewer url={URL.createObjectURL(file)} /></div>;
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

  // G. Code & Text
  const codeExts = ['c','cpp','h','java','py','cs','rs','go','html','css','js','ts','php','json','yaml','sql','sh','md','txt','env','dockerfile'];
  
  if (codeExts.includes(fileType)) {
    return (
      <Editor 
        height="100%" 
        language={getLanguage(fileType)} 
        value={fileContent || "Loading..."} 
        theme="vs-dark" 
        options={{ readOnly: true, minimap: { enabled: false } }} 
      />
    );
  }

  // H. Fallback: Hex Dump
  return (
    <div className="p-4 font-mono text-xs bg-gray-900 text-green-400 h-full overflow-auto">
      <div className="mb-2 border-b border-gray-700 pb-2 font-bold text-yellow-500">BINARY / HEX MODE (First 500 bytes)</div>
      <div className="break-all">
        {fileContent && typeof fileContent === 'string' ? fileContent.slice(0, 2000) : "Binary content loaded. Visualization limited."}
      </div>
    </div>
  );
};

export default UniversalViewer;