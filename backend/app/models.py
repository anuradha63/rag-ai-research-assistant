from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class DocumentInfo(BaseModel):
    id: str
    filename: str
    page_count: int
    chunk_count: int
    uploaded_at: str
    size_kb: float


class SourceChunk(BaseModel):
    content: str
    doc_id: str
    filename: str
    page: int
    score: float


class QueryRequest(BaseModel):
    question: str
    doc_ids: Optional[List[str]] = None  # None = query all docs
    top_k: Optional[int] = 5


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]
    question: str
    model_used: str
    tokens_used: Optional[int] = None
