# Next.js RAG PDF Full Stack

Full-stack PDF question-answering app with a Next.js frontend and a FastAPI backend. Users upload a PDF, the backend extracts and embeds its text into Qdrant, and questions are answered with Groq using only the retrieved document context.

## Features

- Chat-style PDF assistant built with Next.js, React, Tailwind CSS, React Query, Axios, and Lucide icons
- PDF upload UI with selected-file state, clear action, upload progress, session countdown, and question counters
- Backend PDF validation for extension, MIME type, readable text, and 10 MB file size
- PDF text extraction with `pypdf`
- Text chunking and embeddings with Sentence Transformers `all-MiniLM-L6-v2`
- Vector storage and filtered similarity search in Qdrant
- Groq-powered answers with document-scoped retrieval
- Temporary upload sessions with generated `sessionId` and `documentId`
- 10-minute session expiry and 5-question limit per uploaded PDF
- Rate limiting with SlowAPI
- CORS restricted to the configured frontend URL
- Protected Swagger/OpenAPI docs with HTTP Basic Auth
- Backend Dockerfile and Kubernetes manifests
- Backend pytest tests and frontend Playwright tests

## Tech Stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS 4, React Query, Axios, Playwright
- Backend: Python 3.11, FastAPI, Uvicorn, Qdrant client, Sentence Transformers, Groq SDK, PyPDF, SlowAPI, Pytest
- Infrastructure: Docker and Kubernetes manifests for the backend

## Project Structure

```text
.
|-- backend/
|   |-- auth.py                    # HTTP Basic Auth for API docs
|   |-- main.py                    # FastAPI app, upload, RAG, sessions, rate limits
|   |-- requirements.txt           # Backend Python dependencies
|   |-- Dockerfile                 # Backend container image
|   |-- tests/
|   |   `-- test_main.py           # Backend API tests
|   `-- k8s/
|       |-- deployment.yaml        # Kubernetes deployment
|       |-- service.yaml           # NodePort service on 30080
|       `-- secret.example.yaml    # Example backend environment secret
|-- frontend/
|   |-- app/                       # Next.js app router pages and layout
|   |-- hooks/                     # React Query mutation hooks
|   |-- lib/                       # Axios and QueryClient setup
|   |-- providers/                 # React Query provider
|   |-- services/                  # RAG API client functions
|   |-- src/components/RAGPDF/     # Main PDF chat UI
|   |-- tests/                     # Playwright E2E tests
|   `-- package.json
`-- README.md
```

## Requirements

- Node.js compatible with Next.js 16
- Python 3.10+
- Qdrant running locally or a Qdrant Cloud cluster
- Groq API key
- Optional Hugging Face token for restricted model download environments

## Environment Variables

### Backend

Create `backend/.env` for local development:

```env
GROQ_API_KEY=your_groq_api_key
DOCS_USERNAME=admin
DOCS_PASSWORD=change-me

# Local mode is the default.
APP_ENV=local
QDRANT_LOCAL_URL=http://localhost:6333
FRONT_END_URL=http://localhost:3000

# Optional
HF_TOKEN=your_huggingface_token
```

For production-style cloud Qdrant configuration:

```env
APP_ENV=production
QDRANT_CLOUD_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key
GROQ_API_KEY=your_groq_api_key
DOCS_USERNAME=admin
DOCS_PASSWORD=change-me
FRONT_END_URL=https://your-frontend-origin.example
```

For backend tests, set `ENV=test` so startup skips Qdrant collection initialization:

```env
ENV=test
DOCS_USERNAME=admin
DOCS_PASSWORD=change-me
```

### Frontend

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

## Local Development

### 1. Start Qdrant

Run Qdrant locally, for example with Docker:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

### 2. Start the Backend

PowerShell:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

macOS or Linux:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## User Flow

1. Open the frontend.
2. Choose a PDF file and upload it.
3. The backend validates the file, extracts text, chunks it, embeds each chunk, and stores vectors in Qdrant with session metadata.
4. The frontend receives `sessionId`, `documentId`, expiry, page count, chunk count, and question limits.
5. Ask questions in the chat input.
6. The backend embeds the question, retrieves matching chunks for the same session and document, sends the context to Groq, and returns the answer plus source file names.

## API Endpoints

### `GET /health`

Returns service health:

```json
{
  "status": "ok"
}
```

### `GET /`

Returns basic service status:

```json
{
  "message": "RAG is running"
}
```

### `POST /upload-pdf`

Uploads and indexes one PDF for a temporary question-answering session.

Request:

```text
Content-Type: multipart/form-data
file: PDF file
```

Response:

```json
{
  "message": "PDF uploaded successfully",
  "fileName": "example.pdf",
  "totalPages": 3,
  "totalChunks": 12,
  "sessionId": "generated-session-id",
  "documentId": "generated-document-id",
  "expiresInSeconds": 600,
  "maxQuestions": 5
}
```

### `POST /ask`

Asks a question against the uploaded PDF for the provided session.

Request:

```json
{
  "question": "What is this document about?",
  "sessionId": "session-id-from-upload",
  "documentId": "document-id-from-upload"
}
```

Response:

```json
{
  "answer": "Answer generated from the retrieved PDF context.",
  "questionsUsed": 1,
  "questionsRemaining": 4,
  "sources": ["example.pdf"]
}
```

### `GET /test-qdrant`

Returns Qdrant collection information for the configured instance.

### `GET /docs`

Serves Swagger UI protected by HTTP Basic Auth.

### `GET /openapi.json`

Serves the OpenAPI schema protected by HTTP Basic Auth.

## Session and Rate Limits

- Uploaded PDFs expire after 10 minutes.
- Each upload allows up to 5 questions.
- `POST /upload-pdf`: 5 requests per minute per client.
- `POST /ask`: 10 requests per minute per client.
- `GET /docs`: 10 requests per minute per client.
- `GET /test-qdrant`: 10 requests per minute per client.

## Tests

Backend:

```powershell
cd backend
$env:ENV="test"
pytest
```

Frontend:

```bash
cd frontend
npm install
npm run build
npm run test:e2e
```

The Playwright config starts the built frontend with `npm run start` at `http://localhost:3000`.

## Docker

Build and run the backend image from the `backend/` directory:

```bash
cd backend
docker build -t rag-backend:latest .
docker run --env-file .env -p 8000:8000 rag-backend:latest
```

The container starts Uvicorn on `0.0.0.0` and uses `PORT` if provided, defaulting to `8000`.

## Kubernetes

Example backend manifests are in `backend/k8s`.

```bash
cd backend
cp k8s/secret.example.yaml k8s/secret.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

The service is configured as a NodePort service on port `30080`.
