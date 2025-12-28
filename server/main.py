import magic
import pandas as pd
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import nbformat
from nbconvert import HTMLExporter
import io

app = FastAPI()

# CORS: Allow Frontend Access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoint: Detect Type & Convert Data
@app.post("/detect-and-convert")
async def detect_and_convert(file: UploadFile = File(...)):
    content = await file.read()
    
    # Identify REAL file type
    try:
        mime = magic.from_buffer(content, mime=True)
    except:
        mime = "application/octet-stream"
        
    filename = file.filename.lower()

    # Handler: Excel / CSV / Parquet -> HTML Table
    if filename.endswith(('.xlsx', '.xls', '.csv', '.parquet')):
        try:
            if filename.endswith('.csv'):
                df = pd.read_csv(io.BytesIO(content))
            elif filename.endswith('.parquet'):
                df = pd.read_parquet(io.BytesIO(content))
            else:
                df = pd.read_excel(io.BytesIO(content))
            
            return {
                "type": "html_table",
                "content": df.to_html(classes="min-w-full bg-white border text-sm"),
                "mime": mime
            }
        except Exception as e:
            return {"error": str(e)}

    # Handler: Jupyter Notebooks -> HTML
    if filename.endswith('.ipynb'):
        try:
            nb = nbformat.reads(content.decode('utf-8'), as_version=4)
            html_exporter = HTMLExporter()
            (body, _) = html_exporter.from_notebook_node(nb)
            return {"type": "html_doc", "content": body, "mime": mime}
        except Exception as e:
            return {"error": str(e)}

    # Fallback
    return {"type": "pass_through", "mime": mime}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)