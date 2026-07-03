"use client";

import React, { useState } from "react";
import axios from "axios";

const RAGPDF = () => {
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [fileUploaded, setFileUploaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const handleFileUpload = (e) => {
    console.log(e);
    setFile(e.target.files[0]);
  };

  const handleFileDelete = () => {
    setFile(null);
    setDocumentId("");
    setFileUploaded(false);
    setQuestion("");
    setSessionId("");
  };

  const handleQuestionChange = (e) => {
    setQuestion(e.target.value);
  };

  const handleAskQuestion = async () => {
    const payload = { question, sessionId, documentId };

    try {
      const response = await axios.post("http://localhost:8000/ask", payload, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        setAnswer(response.data.answer);
        console.log("question uploaded successfully");
      }
    } catch (e) {
      console.log("error asking question", e);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    const formData = new FormData();

    formData.append("file", file);

    console.log(formData);

    try {
      const response = await axios.post(
        "http://localhost:8000/upload-pdf",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );
      if (response.status === 200) {
        setDocumentId(response.data.documentId);
        setSessionId(response.data.sessionId);
        setFileUploaded(true);
      } else {
        console.log("failed to upload pdf");
      }
    } catch (e) {
      console.log("error upload pdf", e.message);
    }
  };

  return (
    <div className="flex-col align-items justify-centre w-full h-100">
      <div>RAGPDF</div>
      <input type="file" accept="application/pdf" onChange={handleFileUpload} />
      {file && (
        <>
          <button
            className="bg-red-600 hover:bg-red-400 text-white font-bold py-2 px-4 rounded-full cursor-pointer"
            onClick={handleFileDelete}
          >
            delete file
          </button>
          <div className="mt-5">
            <button
              type="submit"
              onClick={handleSubmit}
              className="bg-green-600 hover:bg-green-400 text-white font-bold py-2 px-4 rounded-full cursor-pointer"
            >
              Submit
            </button>
          </div>
        </>
      )}
      {fileUploaded && (
        <>
          <div>
            <input
              type="text"
              value={question}
              onChange={handleQuestionChange}
              className="p-5 border-3"
            />
            <button
              onClick={handleAskQuestion}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-5 rounded-lg"
            >
              Ask Question
            </button>
          </div>
          {answer && <h1>{answer}</h1>}
        </>
      )}
    </div>
  );
};

export default RAGPDF;
