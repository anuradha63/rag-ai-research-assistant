import os
import uuid
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_chroma import Chroma

import chromadb
import tempfile
from langchain_core.prompts import PromptTemplate
from .models import DocumentInfo, QueryResponse, SourceChunk


CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
COLLECTION_NAME = "research_docs"
METADATA_FILE = Path(CHROMA_PERSIST_DIR) / "documents.json"

SYSTEM_PROMPT = """You are an expert AI research assistant. Using the provided context from research documents,
answer the user's question accurately and comprehensively.

Guidelines:
- Base your answer strictly on the provided context
- If the context doesn't contain enough information, say so clearly
- Cite specific documents and pages when relevant
- Structure complex answers with clear sections
- Be precise and academically rigorous

Context:
{summaries}

Question: {question}

Answer:"""


class RAGPipeline:
   def __init__(self):
    self.gemini_api_key = os.getenv("GEMINI_API_KEY")

    if not self.gemini_api_key:
        raise ValueError(
            "GEMINI_API_KEY environment variable not set. "
            "Add it in Render Environment."
        )

    Path(CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)

    self.embeddings = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001",
        google_api_key=self.gemini_api_key,
    )

    self.llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        temperature=0.1,
        google_api_key=self.gemini_api_key,
    )

        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        self.chroma_client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        self.vectorstore = Chroma(
            client=self.chroma_client,
            collection_name=COLLECTION_NAME,
            embedding_function=self.embeddings,
            persist_directory=CHROMA_PERSIST_DIR,
        )

        self._documents: dict[str, DocumentInfo] = self._load_documents()

    def _load_documents(self) -> dict[str, DocumentInfo]:
        if not METADATA_FILE.exists():
            return {}
        try:
            data = json.loads(METADATA_FILE.read_text())
            return {item["id"]: DocumentInfo(**item) for item in data}
        except Exception:
            return {}

    def _save_documents(self) -> None:
        METADATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        data = [doc.model_dump() for doc in self._documents.values()]
        METADATA_FILE.write_text(json.dumps(data, indent=2))

    async def ingest_pdf(self, pdf_bytes: bytes, filename: str) -> DocumentInfo:
        """Ingest a PDF: load → chunk → embed → store in ChromaDB."""
        doc_id = str(uuid.uuid4())

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        try:
            loader = PyPDFLoader(tmp_path)
            pages = loader.load()

            chunks = self.text_splitter.split_documents(pages)
            for i, chunk in enumerate(chunks):
                chunk.metadata.update(
                    {
                        "doc_id": doc_id,
                        "filename": filename,
                        "chunk_index": i,
                        "page": chunk.metadata.get("page", 0) + 1,
                    }
                )

            if chunks:
                self.vectorstore.add_documents(
                    documents=chunks,
                    ids=[f"{doc_id}_chunk_{i}" for i in range(len(chunks))],
                )

            doc_info = DocumentInfo(
                id=doc_id,
                filename=filename,
                page_count=len(pages),
                chunk_count=len(chunks),
                uploaded_at=datetime.now().isoformat(timespec="seconds"),
                size_kb=round(len(pdf_bytes) / 1024, 2),
            )
            self._documents[doc_id] = doc_info
            self._save_documents()
            return doc_info
        finally:
            os.unlink(tmp_path)

    async def query(self, question: str, doc_ids: Optional[List[str]] = None, top_k: int = 5) -> QueryResponse:
        """Semantic search + LLM generation."""
        search_kwargs = {"k": top_k}
        if doc_ids:
            search_kwargs["filter"] = {"doc_id": {"$in": doc_ids}}

        retriever = self.vectorstore.as_retriever(search_kwargs=search_kwargs)
        docs = retriever.invoke(question)

        if not docs:
            return QueryResponse(
                answer="No relevant information found in the indexed documents for your question.",
                sources=[],
                question=question,
                model_used="gemini-2.5-flash",
                tokens_used=0,
            )

        context = "\n\n---\n\n".join(
            [
                f"[{d.metadata.get('filename', 'unknown')} | Page {d.metadata.get('page', '?')}]\n{d.page_content}"
                for d in docs
            ]
        )

        prompt = PromptTemplate(template=SYSTEM_PROMPT, input_variables=["summaries", "question"])
        response = self.llm.invoke(prompt.format(summaries=context, question=question))

        sources = [
            SourceChunk(
                content=d.page_content[:300] + "..." if len(d.page_content) > 300 else d.page_content,
                doc_id=d.metadata.get("doc_id", ""),
                filename=d.metadata.get("filename", "unknown"),
                page=d.metadata.get("page", 0),
                score=0.0,
            )
            for d in docs
        ]

        usage = getattr(response, "usage_metadata", None) or {}
        return QueryResponse(
            answer=response.content,
            sources=sources,
            question=question,
            model_used="gemini-2.5-flash",
            tokens_used=usage.get("total_tokens"),
        )

    def list_documents(self) -> List[DocumentInfo]:
        return list(self._documents.values())

    def get_document_count(self) -> int:
        return len(self._documents)

    def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self._documents:
            return False

        collection = self.chroma_client.get_collection(COLLECTION_NAME)
        results = collection.get(where={"doc_id": doc_id})
        if results.get("ids"):
            collection.delete(ids=results["ids"])

        del self._documents[doc_id]
        self._save_documents()
        return True

    def clear_all(self) -> None:
        try:
            self.chroma_client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass
        self.vectorstore = Chroma(
            client=self.chroma_client,
            collection_name=COLLECTION_NAME,
            embedding_function=self.embeddings,
            persist_directory=CHROMA_PERSIST_DIR,
        )
        self._documents.clear()
        self._save_documents()
