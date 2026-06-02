from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

load_dotenv()

from .rag_pipeline import RAGPipeline
from .models import QueryRequest, QueryResponse, DocumentInfo

app = FastAPI(
    title="RAG AI Research Assistant",
    description="Scalable RAG-based AI assistant with PDF ingestion and semantic retrieval",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FRONTEND_URL", "http://localhost:5173,http://localhost:3000").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_rag = None

def get_rag() -> RAGPipeline:
    global _rag
    if _rag is None:
        _rag = RAGPipeline()
    return _rag


@app.get("/")
async def root():
    return {"message": "RAG AI Research Assistant API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "documents_indexed": get_rag().get_document_count()}


@app.post("/documents/upload", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    """Upload and index a PDF document."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        contents = await file.read()
        doc_info = await get_rag().ingest_pdf(contents, file.filename)
        return doc_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")


@app.get("/documents", response_model=List[DocumentInfo])
async def list_documents():
    """List all indexed documents."""
    return get_rag().list_documents()



@app.delete("/documents/clear-all")
async def clear_all_documents():
    """Clear all documents from the vector store."""
    get_rag().clear_all()
    return {"message": "All documents cleared"}


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document from the index."""
    success = get_rag().delete_document(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}


@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """Query indexed documents using semantic search + LLM."""
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        response = await get_rag().query(
            question=request.question,
            doc_ids=request.doc_ids,
            top_k=request.top_k or 5
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
