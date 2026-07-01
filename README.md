# RAG PDF Backend

FastAPI backend for uploading PDF files, embedding their text into Qdrant, and asking document-scoped questions through Groq chat completions.

The repository currently contains a production-oriented backend. The `frontend/` directory exists but does not contain an implemented app yet.

## Features

- PDF upload with extension, MIME type, readable-text, and 10 MB size validation
- PDF text extraction with `pypdf`
- Text chunking and embeddings with Sentence Transformers (`all-MiniLM-L6-v2`)
- Vector storage and filtered similarity search in Qdrant
- Groq-powered answers using retrieved PDF context
- Per-upload sessions with document IDs, 10-minute expiry, and 5-question limit
- Rate limiting with SlowAPI
- CORS enabled for API clients
- Protected Swagger/OpenAPI docs with HTTP Basic Auth
- Dockerfile and Kubernetes manifests for backend deployment
- Pytest coverage for core API behavior

## Tech Stack

- Python 3.11 compatible backend
- FastAPI and Uvicorn
- Qdrant vector database
- Sentence Transformers
- Groq SDK
- PyPDF
- SlowAPI
- Pytest
- Docker
- Kubernetes manifests

## Project Structure

```text
.
|-- backend/
|   |-- auth.py                    # HTTP Basic Auth for API docs
|   |-- main.py                    # FastAPI app, PDF upload, RAG, rate limits
|   |-- requirements.txt           # Backend Python dependencies
|   |-- Dockerfile                 # Backend container image
|   |-- tests/
|   |   `-- test_main.py           # API tests
|   `-- k8s/
|       |-- deployment.yaml        # Kubernetes deployment
|       |-- service.yaml           # NodePort service on 30080
|       `-- secret.example.yaml    # Example environment secret
|-- frontend/                      # Placeholder; no frontend implementation yet
`-- README.md
```

## Requirements

- Python 3.10+
- Qdrant instance or Qdrant Cloud cluster
- Groq API key
- Optional Hugging Face token for model downloads in restricted environments

## Environment Variables

Create `backend/.env` for local development:

```env
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
GROQ_API_KEY=your_groq_api_key

DOCS_USERNAME=admin
DOCS_PASSWORD=change-me

# Optional
HF_TOKEN=your_huggingface_token
```

For tests, set `ENV=test` so the app skips Qdrant collection initialization:

```env
ENV=test
DOCS_USERNAME=admin
DOCS_PASSWORD=change-me
```

## Local Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

On macOS or Linux:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run the API

```bash
cd backend
uvicorn main:app --reload
```

The API runs at:

```text
http://127.0.0.1:8000
```

Swagger docs are protected with HTTP Basic Auth:

```text
http://127.0.0.1:8000/docs
```

OpenAPI JSON is also protected:

```text
http://127.0.0.1:8000/openapi.json
```

## API Endpoints

### `GET /health`

Health check endpoint.

Response:

```json
{
  "status": "ok"
}
```

### `GET /`

Basic service status.

Response:

```json
{
  "message": "RAG is running"
}
```

### `POST /upload-pdf`

Uploads and indexes a PDF for a temporary question-answering session.

Request:

```text
Content-Type: multipart/form-data
file: PDF file
```

Validation:

- File name must end with `.pdf`
- MIME type must be `application/pdf`
- File must be 10 MB or smaller
- Extracted PDF text cannot be empty

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

Asks a question against a previously uploaded PDF.

Request body:

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

Session rules:

- Each upload creates a unique `sessionId` and `documentId`
- Sessions expire after 10 minutes
- Each session allows up to 5 questions
- Questions are answered only from chunks matching the same session and document

### `GET /test-qdrant`

Returns Qdrant collection information for the configured instance.

This endpoint is rate-limited and is intended for connectivity checks.

## Rate Limits

- `POST /upload-pdf`: 5 requests per minute per client
- `POST /ask`: 10 requests per minute per client
- `GET /docs`: 10 requests per minute per client
- `GET /test-qdrant`: 10 requests per minute per client

## Docker

Build and run the backend image from the `backend/` directory:

```bash
cd backend
docker build -t rag-backend:latest .
docker run --env-file .env -p 8000:8000 rag-backend:latest
```

The container starts Uvicorn on `0.0.0.0` and uses `PORT` if provided, defaulting to `8000`.

## Kubernetes

Example manifests are in `backend/k8s`.

1. Copy and edit the example secret:

```bash
cd backend
cp k8s/secret.example.yaml k8s/secret.yaml
```

2. Apply the secret, deployment, and service:

```bash
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

The service is configured as a NodePort service on port `30080`.

## Run Tests

PowerShell:

```powershell
cd backend
$env:ENV="test"
pytest
```

macOS or Linux:

```bash
cd backend
ENV=test pytest
```
