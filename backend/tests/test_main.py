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

def test_ws_ask_missing_field():
    with client.websocket_connect("/ws/ask") as websocket:
        websocket.send_json({})

        response = websocket.receive_json()
        assert response["type"] == "error"
        assert "question, sessionId, documentId are required" in response["message"]

def test_ws_ask_invalid_session():
    with client.websocket_connect("/ws/ask") as websocket:
        websocket.send_json(
            {
                "question": "Who is Jeevan?",
                "sessionId": "wrong-id-1234",
                "documentId": "wrong-id-1234",
            }
        )

        response = websocket.receive_json()

        assert response["type"] == "error"
        assert "Session expired or invalid" in response["message"]
