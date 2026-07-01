from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response=client.get("/health")
    assert response.status_code==200
    assert response.json()["status"]=="ok"

def test_home():
    response = client.get("/")
    assert response.status_code==200
    assert response.json()["message"]=="RAG is running"

def test_docs_require_auth():
    response = client.get("/docs")
    assert response.status_code==401

def test_ask_missing_field():
    response = client.post("/ask", json={})
    assert response.status_code==400
    assert response.json()["detail"]=="question, sessionId, documentId are required"

def test_ask_incorrect_fields():
    response = client.post('/ask', json={
        "question":"who is Jeevan",
        "sessionId":"wrong-id-1234",
        "documentId":"wrong-id-1234"
    })
    assert response.status_code==403
    assert response.json()["detail"]=="Session expired or invalid. Please upload the PDF again."

def test_ask_rate_limit():
    payload={
        "question":"who is jeevan",
        "sessionId":"test-123",
        "documentId":"test-321"
    }
    for _ in range(10):
        response = client.post("/ask", json=payload)

    response = client.post('/ask', json=payload)
    assert response.json()["error"] == "Rate limit exceeded: 10 per 1 minute"
