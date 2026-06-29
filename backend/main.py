from fastapi import FastAPI, UploadFile, File
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from qdrant_client.models import PointStruct, Distance, VectorParams
import uuid
from qdrant_client import QdrantClient
from groq import Groq
import os
from dotenv import load_dotenv

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


def chunkText(text, chunkSize=500):
    chunks=[]
    for i in range(0,len(text), chunkSize):
        chunk=text[i:i+chunkSize]
        chunks.append(chunk)
    return chunks

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
    reader=PdfReader(file.file)
    pages=reader.pages
    text=""
    for page in pages:
        text+=page.extract_text() or ""
    
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
                    "fileName": file.filename
                }
            )
        )    

    qdrant.recreate_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=384,
            distance=Distance.COSINE
        )
    )

    qdrant.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )

    return {
        "fileName": file.filename,
        "totalPages": len(reader.pages),
        "chunks": chunks,
        "points": points
    }