from fastapi import FastAPI, UploadFile, File, HTTPException
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from qdrant_client.models import PointStruct, Distance, VectorParams, Filter, FieldCondition, MatchValue, Range
import uuid
from qdrant_client import QdrantClient
from groq import Groq
import os
from dotenv import load_dotenv
import time

load_dotenv()

app=FastAPI()
model=SentenceTransformer('all-MiniLM-L6-v2')

qdrant = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY")
)

groq=Groq(api_key=os.getenv("GROQ_API_KEY"))

hf_token=os.getenv("HF_TOKEN")

if hf_token:
    os.environ["HF_TOKEN"]=hf_token
    os.environ["HUGGINGFACE_HUB_TOKEN"]=hf_token

COLLECTION_NAME="documents"
SESSION_EXPIRY_SECONDS=600
MAX_QUESTION_PER_SESSION=5

session_usage={}

def cleanupExpiredSessions():
    current_time = int(time.time())

    qdrant.delete(
        collection_name=COLLECTION_NAME,
        points_selector=Filter(
            must=[
                FieldCondition(
                    key="expiresAt",
                    range=Range(lt=current_time),
                )
            ]
        ),
    )

    expired_sessions = []

    for session_id, session in session_usage.items():
        if current_time > session["expiresAt"]:
            expired_sessions.append(session_id)

    for session_id in expired_sessions:
        del session_usage[session_id]

def createCollectionIfNotExits():
    collections=qdrant.get_collections().collections
    collection_names=[collection.name for collection in collections]
    if COLLECTION_NAME not in collection_names:
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=384,
                distance=Distance.COSINE
            ),
        )


createCollectionIfNotExits()

def chunkText(text, chunkSize=500):
    chunks=[]
    for i in range(0,len(text), chunkSize):
        chunk=text[i:i+chunkSize]
        chunks.append(chunk)
    return chunks

@app.get('/')
def home():
    return {"message": "RAG is running"} 

@app.post("/ask")
def askQuestion(data: dict):
    cleanupExpiredSessions()
    question = data.get("question")
    session_id=data.get("sessionId")
    document_id=data.get("documentId")

    if not question or not session_id or not document_id:
        raise HTTPException(
            status_code=400,
            detail="question, sessionId, documentId are required"
        )
    
    session=session_usage.get(session_id)

    if not session:
        raise HTTPException(
            status_code=403,
            detail="session expired or invalid. Please upload the pdf again"
        )
    
    if int(time.time()) > session["expiresAt"]:
        raise HTTPException(
            status_code=403,
            detail="Session expired. Please upload the PDF again.",
        )

    if session["documentId"] != document_id:
        raise HTTPException(
            status_code=403,
            detail="Invalid document for this session.",
        )

    if session["questionsUsed"] >= MAX_QUESTION_PER_SESSION:
        raise HTTPException(
            status_code=429,
            detail="Question limit reached for this PDF.",
        )

    questionVector=model.encode(question).tolist()

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
        limit=3
    )
    results=searchResponse.points

    if not results:
        raise HTTPException(
            status_code=404,
            detail="No relevant content found."
        )

    context="\n\n".join([r.payload["text"] for r in results])
    
    prompt = f"""
    Answer the question using only the context below.
    If the answer is not present in the context, say:
    "I could not find this information in the uploaded PDF."

    Context:
    {context}

    Question:
    {question}
    """

    response=groq.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "user", "content":prompt}
        ],
    )    

    session_usage[session_id]["questionsUsed"] += 1

    return {
        "answer" : response.choices[0].message.content,
        "questionsUsed": session_usage[session_id]["questionsUsed"],
        "questionsRemaining": MAX_QUESTION_PER_SESSION - session_usage[session_id]["questionsUsed"],
        "sources": list(set([r.payload["fileName"] for r in results])),
    }

@app.post("/upload-pdf")
def uploadPdf(file: UploadFile=File(...)):
    cleanupExpiredSessions()
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


    points=[]
    for chunk in chunks:
        vector = model.encode(chunk).tolist()
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
        points=points
    )

    session_usage[session_id] = {
    "documentId": document_id,
    "questionsUsed": 0,
    "expiresAt": expires_at,
    }

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