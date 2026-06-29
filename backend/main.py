from fastapi import FastAPI, UploadFile, File, HTTPException
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from qdrant_client.models import PointStruct, Distance, VectorParams, Filter, FieldConditon, MatchValue
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
    question = data["question"]
    questionVector=model.encode(question).tolist()
    searchResponse = qdrant.query_points(
        collection_name=COLLECTION_NAME,
        query=questionVector,
        limit=3
    )
    results=searchResponse.points

    context="\n\n".join([r.payload["text"] for r in results])
    prompt=f"""
    Answer the question using only the context below.

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

    return {
        "answer" : response.choices[0].message.content
    }

@app.post("/upload-pdf")
def uploadPdf(file: UploadFile=File(...)):
    session_id=str(uuid.uuid4())
    document_id=str(uuid.uuid4)
    expires_at = int(time.time()) + SESSION_EXPIRY_SECONDS
    reader=PdfReader(file.file)
    pages=reader.pages
    text=""
    for page in pages:
        text += (page.extract_text() or "") + "\n"
    
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