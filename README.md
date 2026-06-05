# RAG AI Research Assistant

Full-stack RAG app using FastAPI, React, LangChain, OpenAI embeddings, and ChromaDB.

## Features

- PDF upload and ingestion
- Text chunking using LangChain
- OpenAI embeddings
- Persistent ChromaDB vector index
- Semantic retrieval
- GPT-based answer generation
- React frontend with document list and chat UI
- REST APIs for upload, list, delete, clear, query, and health check

\

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and add your OpenAI key:

```env
OPENAI_API_KEY=your_openai_api_key_here
FRONTEND_URL=http://localhost:5173
CHROMA_PERSIST_DIR=./chroma_db
```

Run backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URL:

```txt
http://localhost:8000
```

API docs:

```txt
http://localhost:8000/docs
```

## Frontend setup

Open a new terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend URL:

```txt
http://localhost:5173
```


