import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

// Import required CSS for the PDF viewer
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// WORKER SETUP: This is crucial for React-PDF to work
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfRenderer = ({ url }) => {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  return (
    <div className="flex flex-col items-center h-full w-full bg-gray-500 overflow-hidden">
      {/* Controls Toolbar */}
      <div className="bg-gray-800 text-white w-full p-2 flex justify-between items-center shadow-md z-10">
        <div className="flex gap-2">
           <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} className="p-1 hover:bg-gray-700 rounded disabled:opacity-50">
             <ChevronLeft />
           </button>
           <span className="text-sm font-mono self-center">
             Page {pageNumber} of {numPages || '--'}
           </span>
           <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages} className="p-1 hover:bg-gray-700 rounded disabled:opacity-50">
             <ChevronRight />
           </button>
        </div>
        
        <div className="flex gap-2">
           <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1 hover:bg-gray-700 rounded"><ZoomOut size={20} /></button>
           <button onClick={() => setScale(s => Math.min(3.0, s + 0.2))} className="p-1 hover:bg-gray-700 rounded"><ZoomIn size={20} /></button>
        </div>
      </div>

      {/* PDF Document Area */}
      <div className="flex-1 overflow-auto w-full flex justify-center p-4 bg-gray-200">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          className="shadow-lg"
        >
          <Page 
            pageNumber={pageNumber} 
            scale={scale} 
            renderTextLayer={false} 
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
};

export default PdfRenderer;