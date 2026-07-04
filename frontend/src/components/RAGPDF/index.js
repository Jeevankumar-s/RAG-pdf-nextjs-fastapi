"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Bot,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  RotateCcw,
  SendHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const MAX_FILE_SIZE_LABEL = "10 MB";

const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return "Not uploaded";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
};

const RAGPDF = () => {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [uploadMeta, setUploadMeta] = useState(null);
  const [questionStats, setQuestionStats] = useState({
    used: 0,
    remaining: 0,
    max: 0,
  });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState(null);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [error, setError] = useState("");

  const fileUploaded = Boolean(sessionId && documentId);
  const canAsk =
    fileUploaded &&
    question.trim().length > 0 &&
    !loadingAnswer &&
    sessionSecondsRemaining > 0 &&
    questionStats.remaining > 0;

  const statusLabel = useMemo(() => {
    if (loadingUpload) return "Indexing PDF";
    if (fileUploaded && sessionSecondsRemaining === 0) return "Expired";
    if (fileUploaded) return "Ready";
    if (file) return "Selected";
    return "No document";
  }, [file, fileUploaded, loadingUpload, sessionSecondsRemaining]);

  useEffect(() => {
    if (!fileUploaded || sessionSecondsRemaining === null) return undefined;

    if (sessionSecondsRemaining <= 0) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setSessionSecondsRemaining((currentSeconds) => {
        if (currentSeconds === null) return currentSeconds;
        return Math.max(currentSeconds - 1, 0);
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [fileUploaded, sessionSecondsRemaining]);

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files?.[0];

    if (selectedFile) {
      setFile(selectedFile);
      setUploadMeta(null);
      setQuestionStats({ used: 0, remaining: 0, max: 0 });
      setMessages([]);
      setQuestion("");
      setSessionId("");
      setDocumentId("");
      setSessionSecondsRemaining(null);
      setError("");
    }
  };

  const handleFileDelete = () => {
    setFile(null);
    setDocumentId("");
    setSessionId("");
    setUploadMeta(null);
    setQuestionStats({ used: 0, remaining: 0, max: 0 });
    setQuestion("");
    setMessages([]);
    setSessionSecondsRemaining(null);
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAskQuestion = async () => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setError("Please enter a question.");
      return;
    }

    if (!fileUploaded) {
      setError("Please upload a PDF first.");
      return;
    }

    if (questionStats.remaining <= 0) {
      setError("Question limit reached for this PDF.");
      return;
    }

    if (sessionSecondsRemaining <= 0) {
      setError("Session expired. Please upload the PDF again.");
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setQuestion("");
    setLoadingAnswer(true);
    setError("");

    try {
      const payload = { question: trimmedQuestion, sessionId, documentId };
      const response = await axios.post(`${API_URL}/ask`, payload);

      if (response.status === 200) {
        const { answer, questionsUsed, questionsRemaining, sources = [] } =
          response.data;

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: answer,
            sources,
          },
        ]);
        setQuestionStats((currentStats) => ({
          used: questionsUsed ?? currentStats.used,
          remaining: questionsRemaining ?? currentStats.remaining,
          max: currentStats.max || (questionsUsed ?? 0) + (questionsRemaining ?? 0),
        }));
      }
    } catch (e) {
      setMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== userMessage.id),
      );
      setError(e.response?.data?.detail || "Failed to get answer.");
    } finally {
      setLoadingAnswer(false);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please choose a PDF file.");
      return;
    }

    setLoadingUpload(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API_URL}/upload-pdf`, formData);

      if (response.status === 200) {
        const data = response.data;

        setDocumentId(data.documentId);
        setSessionId(data.sessionId);
        setUploadMeta(data);
        setQuestionStats({
          used: 0,
          remaining: data.maxQuestions ?? 0,
          max: data.maxQuestions ?? 0,
        });
        setSessionSecondsRemaining(data.expiresInSeconds ?? null);
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "PDF uploaded successfully. Ask a question and I will answer using only this document.",
            sources: [data.fileName].filter(Boolean),
          },
        ]);
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to upload PDF.");
    } finally {
      setLoadingUpload(false);
    }
  };

  const handleQuestionKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-[#f7f7f8] text-[#111827]">
      <div className="flex h-full w-full flex-col overflow-hidden lg:flex-row">
        <aside className="shrink-0 border-b border-[#e5e7eb] bg-[#202123] text-white lg:h-full lg:w-80 lg:border-b-0 lg:border-r lg:border-[#303139]">
          <div className="flex h-full flex-col overflow-y-auto p-4">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#10a37f]" aria-hidden="true" />
                <h1 className="text-lg font-semibold">RAG PDF Chat</h1>
              </div>
              <p className="mt-1 text-sm text-[#c5c5d2]">
                Upload a PDF, then ask questions from its content.
              </p>
            </div>

            <div className="mt-5 rounded-lg border border-[#3f4048] bg-[#2a2b32] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[#8e8ea0]">
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Document
                  </p>
                  <p className="mt-1 break-words text-sm font-medium">
                    {uploadMeta?.fileName || file?.name || "No PDF selected"}
                  </p>
                </div>
                <span className="rounded-full bg-[#343541] px-3 py-1 text-xs text-[#ececf1]">
                  {statusLabel}
                </span>
              </div>

              <label className="mt-4 flex cursor-pointer flex-col rounded-md border border-dashed border-[#565869] px-4 py-5 text-center text-sm text-[#d1d5db] transition hover:border-white hover:bg-[#343541]">
                <Upload className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
                <span>{file ? "Change PDF" : "Choose PDF"}</span>
                <span className="mt-1 text-xs text-[#8e8ea0]">
                  PDF only, max size {MAX_FILE_SIZE_LABEL}
                </span>
                <input
                  data-testid="pdf-input"
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  data-testid="upload-button"
                  onClick={handleSubmit}
                  disabled={!file || loadingUpload}
                  className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#202123] transition hover:bg-[#ececf1] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {loadingUpload ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {loadingUpload ? "Uploading" : "Upload"}
                </button>
                <button
                  data-testid="delete-button"
                  onClick={handleFileDelete}
                  disabled={!file && !fileUploaded}
                  className="flex items-center justify-center gap-2 rounded-md border border-[#565869] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#343541] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Available questions
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {questionStats.remaining}
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Questions used
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {questionStats.used}
                  <span className="text-sm font-normal text-[#8e8ea0]">
                    /{questionStats.max || uploadMeta?.maxQuestions || 0}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Max questions
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {questionStats.max || uploadMeta?.maxQuestions || 0}
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Max file size
                </p>
                <p className="mt-1 text-2xl font-semibold">{MAX_FILE_SIZE_LABEL}</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3 text-sm text-[#d1d5db]">
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1.5 text-[#8e8ea0]">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  Pages
                </span>
                <span>{uploadMeta?.totalPages ?? "-"}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="flex items-center gap-1.5 text-[#8e8ea0]">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                  Chunks
                </span>
                <span>{uploadMeta?.totalChunks ?? "-"}</span>
              </div>
              <div className="mt-2 flex justify-between gap-4">
                <span className="flex items-center gap-1.5 text-[#8e8ea0]">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Session expires
                </span>
                <span>{formatTime(sessionSecondsRemaining)}</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[#e5e7eb] bg-white px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Bot className="h-4 w-4 text-[#10a37f]" aria-hidden="true" />
                  PDF Assistant
                </p>
                <p className="text-xs text-[#6b7280]">
                  {fileUploaded
                    ? `${questionStats.remaining} questions left`
                    : "Upload a PDF to start"}
                </p>
              </div>
              <span className="rounded-full border border-[#d1d5db] px-3 py-1 text-xs text-[#374151]">
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 ? (
                <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-5 py-3 text-sm font-medium shadow-sm">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Upload a PDF to begin
                  </div>
                  <p className="mt-4 max-w-md text-sm leading-6 text-[#6b7280]">
                    You can ask up to {uploadMeta?.maxQuestions || 5} questions per
                    upload. PDF upload size is limited to {MAX_FILE_SIZE_LABEL}.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex gap-4 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#10a37f] text-sm font-semibold text-white">
                          <Bot className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${
                          message.role === "user"
                            ? "bg-[#343541] text-white"
                            : "border border-[#e5e7eb] bg-white text-[#111827]"
                        }`}
                      >
                        <p className="whitespace-pre-line">{message.content}</p>
                        {message.sources?.length > 0 && (
                          <div className="mt-3 border-t border-[#e5e7eb] pt-2 text-xs text-[#6b7280]">
                            Source: {message.sources.join(", ")}
                          </div>
                        )}
                      </div>
                    </article>
                  ))}

                  {loadingAnswer && (
                    <article className="flex gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#10a37f] text-sm font-semibold text-white">
                        <Bot className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#6b7280] shadow-sm">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Thinking...
                      </div>
                    </article>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[#e5e7eb] bg-white px-4 py-4 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-3 rounded-xl border border-[#d1d5db] bg-white p-3 shadow-sm focus-within:border-[#10a37f]">
                <textarea
                  data-testid="question-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleQuestionKeyDown}
                  placeholder={
                    fileUploaded
                      ? "Ask a question about the PDF"
                      : "Upload a PDF before asking"
                  }
                  disabled={
                    !fileUploaded ||
                    loadingAnswer ||
                    questionStats.remaining <= 0 ||
                    sessionSecondsRemaining <= 0
                  }
                  rows={1}
                  className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 outline-none disabled:cursor-not-allowed disabled:text-[#9ca3af]"
                />
                <button
                  data-testid="ask-button"
                  onClick={handleAskQuestion}
                  disabled={!canAsk}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#10a37f] text-lg font-semibold text-white transition hover:bg-[#0e906f] disabled:cursor-not-allowed disabled:bg-[#d1d5db] cursor-pointer"
                  aria-label="Ask question"
                >
                  <SendHorizontal className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-[#6b7280]">
                {questionStats.remaining} questions left from{" "}
                {questionStats.max || uploadMeta?.maxQuestions || 0}. Max PDF size{" "}
                {MAX_FILE_SIZE_LABEL}.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default RAGPDF;
