import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { FileUp, Loader2 } from 'lucide-react';
import UniversalViewer from './UniversalViewer';

// API URL (Make sure this is your live Render URL)
const API_URL = "https://universal-file-opener.onrender.com";

export default function App() {
  const [file, setFile] = useState(null);
  const [content, setContent] = useState(null);
  const [fileType, setFileType] = useState('');
  const [backendData, setBackendData] = useState(null);
  const [loading, setLoading] = useState(false); // New Loading State

  const onDrop = useCallback(async (acceptedFiles) => {
    const uploadedFile = acceptedFiles[0];
    setFile(uploadedFile);
    setBackendData(null);
    setContent(null);
    setLoading(true); // Start Loading

    const ext = uploadedFile.name.split('.').pop().toLowerCase();
    setFileType(ext);

    // 1. Read locally first (for text/code files)
    const textExts = ['txt', 'py', 'js', 'html', 'css', 'json', 'md', 'xml', 'svg', 'c', 'cpp', 'java', 'rs', 'go'];
    
    if (textExts.includes(ext)) {
      const text = await uploadedFile.text();
      setContent(text);
      setLoading(false); // Text loads instantly
    } else {
      // For binaries/notebooks, read buffer but keep loading true until backend replies
      const buffer = await uploadedFile.arrayBuffer();
      const view = new Uint8Array(buffer);
      let hexString = '';
      for (let i = 0; i < Math.min(view.length, 1000); i++) {
        hexString += view[i].toString(16).padStart(2, '0') + ' ';
      }
      setContent(hexString);
    }

    // 2. Send to Backend (This is what converts .ipynb and .xlsx)
    const formData = new FormData();
    formData.append('file', uploadedFile);
    try {
      const res = await axios.post(`${API_URL}/detect-and-convert`, formData);
      setBackendData(res.data);
    } catch (e) {
      console.error("Backend error:", e);
    } finally {
      setLoading(false); // Stop loading when Backend replies (or fails)
    }
  }, []);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
      <div className="w-full h-full p-6 flex flex-col">
        {/* Header */}
        <div {...getRootProps()} className="bg-white border-2 border-dashed border-blue-300 p-4 rounded-xl cursor-pointer hover:bg-blue-50 transition mb-4 flex items-center justify-center gap-3 shadow-sm">
          <input {...getInputProps()} />
          <FileUp className="text-blue-500 w-6 h-6" />
          <span className="font-semibold text-gray-700 text-lg">Click or Drag File Here to Open</span>
        </div>
        
        {/* Main Viewer */}
        <div className="flex-1 bg-white rounded-xl shadow-lg border overflow-hidden relative flex flex-col items-center justify-center">
          {!file ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <FileUp className="w-16 h-16 mb-4 opacity-20" />
              <p>No file loaded</p>
            </div>
          ) : loading ? (
            // NEW LOADING SCREEN
            <div className="flex flex-col items-center text-blue-600 animate-pulse">
              <Loader2 className="w-12 h-12 mb-4 animate-spin" />
              <p className="font-semibold">Converting File...</p>
              <p className="text-xs text-gray-400 mt-2">(Server waking up... might take 1 min)</p>
            </div>
          ) : (
             <UniversalViewer file={file} fileType={fileType} fileContent={content} backendData={backendData} />
          )}
        </div>
      </div>
    </div>
  );
}