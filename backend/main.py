from fastapi import FastAPI, UploadFile, File, HTTPException, Request, WebSocket, WebSocketDisconnect
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from qdrant_client.models import PointStruct, Distance, VectorParams, Filter, FieldCondition, MatchValue, Range, PayloadSchemaType
import uuid
from qdrant_client import QdrantClient
from groq import Groq
import os
from dotenv import load_dotenv
import time
from fastapi.middleware.cors import CORSMiddleware
from auth import verify_docs
from fastapi import Depends
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler
import logging
import json
from redis_client import redis_client




load_dotenv()

try:
    redis_client.ping()
    print("Redis connected successfully")
except Exception:
    print("Unable to connect to Redis")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
)

logger=logging.getLogger(__name__)

app=FastAPI(
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

groq=Groq(api_key=os.getenv("GROQ_API_KEY"))
hf_token=os.getenv("HF_TOKEN")
APP_ENV = os.getenv("APP_ENV", "local")
FRONT_END_URL=os.getenv("FRONT_END_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONT_END_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter=limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler )
app.add_middleware(SlowAPIMiddleware)

model = None

def get_model():
    global model
    if model is None:
        model = SentenceTransformer("all-MiniLM-L6-v2")
    return model

if APP_ENV == "production":
    qdrant = QdrantClient(
        url=os.getenv("QDRANT_CLOUD_URL"),
        api_key=os.getenv("QDRANT_API_KEY"),
        timeout=120,
        prefer_grpc=True,
    )
else:
    qdrant = QdrantClient(
        url=os.getenv("QDRANT_LOCAL_URL", "http://localhost:6333"),
        api_key=None,
        timeout=120,
        prefer_grpc=False,
    )

if hf_token:
    os.environ["HF_TOKEN"]=hf_token
    os.environ["HUGGINGFACE_HUB_TOKEN"]=hf_token

COLLECTION_NAME="documents"
SESSION_EXPIRY_SECONDS=600
MAX_QUESTION_PER_SESSION=5
MAX_FILE_SIZE = 10 * 1024 * 1024  

def createCollectionIfNotExits():
    collections = qdrant.get_collections().collections
    collection_names = [collection.name for collection in collections]

    if COLLECTION_NAME not in collection_names:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=384,
                distance=Distance.COSINE
            ),
        )

    qdrant.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="expiresAt",
        field_schema=PayloadSchemaType.INTEGER,
    )

    qdrant.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="sessionId",
        field_schema=PayloadSchemaType.KEYWORD,
    )

    qdrant.create_payload_index(
        collection_name=COLLECTION_NAME,
        field_name="documentId",
        field_schema=PayloadSchemaType.KEYWORD,
    )

if os.getenv("ENV") != "test":
    createCollectionIfNotExits()
    logger.info("Application initialized successfully")

def chunkText(text, chunkSize=500):
    chunks=[]
    for i in range(0,len(text), chunkSize):
        chunk=text[i:i+chunkSize]
        chunks.append(chunk)
    return chunks

@app.get("/health")
def health():
    return {"status":"ok"}

@app.get("/test-qdrant")
@limiter.limit("10/minute")
def test_qdrant(request:Request):
    return qdrant.get_collections()

@app.get('/')
def home():
    return {"message": "RAG is running"} 

@app.get("/docs", include_in_schema=False)
@limiter.limit("10/minute")
def custom_docs(request:Request, user: str = Depends(verify_docs)):
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="API Docs",
    )

@app.get("/openapi.json", include_in_schema=False)
def openapi(user: str = Depends(verify_docs)):
    return get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )

def session_key(session_id: str):
    return f"session:{session_id}"

def get_session(session_id: str):
    data = redis_client.get(session_key(session_id))
    
    if not data:
        return None
    
    return json.loads(data)

def save_session(session_id: str, session: dict):
    ttl= max(session["expiresAt"]-int(time.time()), 1)
    redis_client.setex(session_key(session_id), ttl, json.dumps(session))

def increment_questions_used(session_id: str):
    session=get_session(session_id)

    if not session:
        return None
    
    session["questionsUsed"]+=1
    save_session(session_id, session)
    
    return session

@app.websocket("/ws/ask")
async def websocket_ask(websocket: WebSocket):
    await websocket.accept()

    try:
        data = await websocket.receive_json()

        question = data.get("question")
        session_id = data.get("sessionId")
        document_id = data.get("documentId")

        logger.info(
        "Question received: question=%s session=%s document=%s",
        question,
        session_id,
        document_id,
    )

        if not question or not session_id or not document_id:
            logger.warning(
            "Missing required fields: question=%s sessionId=%s documentId=%s",
            question,
            session_id,
            document_id,
            )
            await websocket.send_json({
                "type": "error",
                "message": "question, sessionId, documentId are required"
            })
            await websocket.close(code=1008)
            return
        

        session = get_session(session_id)

        if not session:
            logger.warning("Invalid or expired session: %s", session_id)
            await websocket.send_json({
            "type": "error",
            "message": "Session expired or invalid. Please upload the PDF again."
            })
            await websocket.close(code=1008)
            return
        

        if int(time.time()) > session["expiresAt"]:
            logger.warning(
            "Session expired: %s",
            session_id,
            )
            await websocket.send_json({
                "type": "error",
                "message": "Session expired. Please upload the PDF again."
            })
            await websocket.close(code=1008)
            return


        if session["documentId"] != document_id:
            logger.warning("Invalid document for this session: %s",document_id)
            await websocket.send_json({
                "type": "error",
                "message": "Invalid document for this session."
            })
            await websocket.close(code=1008)
            return

        if session["questionsUsed"] >= MAX_QUESTION_PER_SESSION:
            await websocket.send_json({
                "type": "error",
                "message": "Question limit reached for this PDF."
            })
            await websocket.close(code=1008)
            return

        questionVector = get_model().encode(question).tolist()

        searchResponse = qdrant.query_points(
            collection_name=COLLECTION_NAME,
            query=questionVector,
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="sessionId",
                        match=MatchValue(value=session_id),
                    ),
                    FieldCondition(
                        key="documentId",
                        match=MatchValue(value=document_id),
                    ),
                ]
            ),
            limit=3,
            timeout=120,
        )
        
        results = searchResponse.points
        
        if not results:
            await websocket.send_json({
                "type": "error",
                "message": "No relevant content found."
            })
            await websocket.close(code=1008)
            return

        context = "\n\n".join([r.payload["text"] for r in results])

        prompt = f"""
        Answer the question using only the context below.

        Context:
        {context}

        Question:
        {question}
        """

        stream = groq.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )

        full_answer = ""

        for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if token:
                full_answer += token
                await websocket.send_json({
                    "type": "token",
                    "content": token
                })

        session = increment_questions_used(session_id)

        await websocket.send_json({
            "type": "done",
            "answer": full_answer,
            "questionsUsed": session["questionsUsed"],
            "questionsRemaining": MAX_QUESTION_PER_SESSION - session["questionsUsed"],
        })

    except WebSocketDisconnect:
        logger.warning("WebSocket disconnected")

    except Exception as e:
        logger.exception("WebSocket ask failed")
        await websocket.send_json({
            "type": "error",
            "message": "Internal server error."
        })
        await websocket.close(code=1011)

@app.post("/upload-pdf")
@limiter.limit("5/minute")
def uploadPdf(request: Request, file: UploadFile=File(...)):

    if not file.filename.lower().endswith(".pdf"):
        logger.warning(
        "Rejected upload. Invalid extension: %s",
        file.filename,
        )
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed."
        )

    if file.content_type != "application/pdf":
        logger.warning(
        "Rejected upload. Invalid MIME type: %s",
        file.content_type,
        )
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a PDF."
        )
    
    contents = file.file.read()
    file_size=len(contents)
    
    if file_size > MAX_FILE_SIZE:
        logger.warning(
        "PDF exceeds size limit: %s (%d bytes)",
        file.filename,
        file_size,
        )
        raise HTTPException(
            status_code=413,
            detail="PDF file size should be less than 10 MB."
        )

    file.file.seek(0)

    logger.info("PDF upload started: %s", file.filename)
    session_id=str(uuid.uuid4())
    document_id=str(uuid.uuid4())
    expires_at = int(time.time()) + SESSION_EXPIRY_SECONDS
    reader=PdfReader(file.file)
    pages=reader.pages
    text=""
    for page in pages:
        text += (page.extract_text() or "") + "\n"
    
    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No readable text found in this PDF."
        )
    
    chunks=chunkText(text)

    logger.info("PDF processed: %s, pages=%s, chunks=%s", file.filename, len(reader.pages), len(chunks))

    points=[]
    for chunk in chunks:
        vector = get_model().encode(chunk).tolist()
        points.append(
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": chunk,
                    "fileName": file.filename,
                    "sessionId":session_id,
                    "documentId":document_id,
                    "expiresAt": expires_at,
                },
            )
        )    

    qdrant.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
        wait=False
    )

    logger.info("PDF vectors uploaded to Qdrant: session=%s document=%s", session_id, document_id)

    save_session(session_id, {
    "documentId": document_id,
    "questionsUsed": 0,
    "expiresAt": expires_at,
    })

    return {
        "message": "PDF uploaded successfully",
        "fileName": file.filename,
        "totalPages": len(reader.pages),
        "totalChunks":len(chunks),
        "sessionId":session_id,
        "documentId":document_id,
        "expiresInSeconds": SESSION_EXPIRY_SECONDS,
        "maxQuestions": MAX_QUESTION_PER_SESSION
    }