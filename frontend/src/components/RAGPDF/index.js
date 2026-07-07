"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUploadPdf } from "@/hooks/useUploadPdf";
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
  ChevronsDown,
} from "lucide-react";

const MAX_FILE_SIZE_LABEL = "10 MB";

const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return "Not uploaded";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
};

const getSavedSession = () => {
  if (typeof window === "undefined") return null;

  const savedSession = localStorage.getItem("rag-session");
  if (!savedSession) return null;

  const session = JSON.parse(savedSession);

  const remaining = Math.max(
    Math.floor((session.expiresAt - Date.now()) / 1000),
    0,
  );

  if (remaining <= 0) {
    localStorage.removeItem("rag-session");
    localStorage.removeItem("rag-messages");
    return null;
  }

  return {
    ...session,
    remaining,
  };
};

const getSavedMessages = () => {
  if (typeof window === "undefined") return [];

  const savedMessages = localStorage.getItem("rag-messages");
  return savedMessages ? JSON.parse(savedMessages) : [];
};

const RAGPDF = () => {
  const [savedSession] = useState(getSavedSession);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const [file, setFile] = useState(null);
  const [sessionId, setSessionId] = useState(savedSession?.sessionId || "");
  const [documentId, setDocumentId] = useState(savedSession?.documentId || "");
  const [expiresAt, setExpiresAt] = useState(savedSession?.expiresAt || null);
  const [hasReceivedToken, setHasReceivedToken] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [uploadMeta, setUploadMeta] = useState(
    savedSession?.uploadMeta || null,
  );
  const [questionStats, setQuestionStats] = useState(
    savedSession?.questionStats || {
      used: 0,
      remaining: 0,
      max: 0,
    },
  );
  const [messages, setMessages] = useState(getSavedMessages);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState(
    savedSession?.remaining ?? null,
  );
  const [isStreaming, setIsStreaming] = useState(false);

  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");

  const uploadMutation = useUploadPdf();

  useEffect(() => {
    if (!sessionId || !documentId) return;

    localStorage.setItem(
      "rag-session",
      JSON.stringify({
        sessionId,
        documentId,
        uploadMeta,
        questionStats,
        expiresAt,
      }),
    );
  }, [sessionId, documentId, uploadMeta, questionStats, expiresAt]);

  const fileUploaded = Boolean(sessionId && documentId);
  const canAsk =
    fileUploaded &&
    question.trim().length > 0 &&
    !isStreaming &&
    sessionSecondsRemaining > 0 &&
    questionStats.remaining > 0;

  const statusLabel = useMemo(() => {
    if (uploadMutation.isPending) return "Indexing PDF";
    if (fileUploaded && sessionSecondsRemaining === 0) return "Expired";
    if (fileUploaded) return "Ready";
    if (file) return "Selected";
    return "No document";
  }, [file, fileUploaded, uploadMutation.isPending, sessionSecondsRemaining]);

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
      setShowScrollButton(false);
      localStorage.removeItem("rag-session");
      localStorage.removeItem("rag-messages");
      setExpiresAt(null);
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
    setExpiresAt(null);
    setShowScrollButton(false);
    localStorage.removeItem("rag-session");
    localStorage.removeItem("rag-messages");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAskQuestion = () => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    const assistantId = crypto.randomUUID();

    setMessages((prev) => [...prev, userMessage]);

    setQuestion("");
    setError("");
    setIsStreaming(true);

    setHasReceivedToken(false);
    setIsStreaming(true);

    const wsUrl = process.env.NEXT_PUBLIC_API_URL.replace(
      "http://",
      "ws://",
    ).replace("https://", "wss://");

    const socket = new WebSocket(`${wsUrl}/ws/ask`);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          question: trimmedQuestion,
          sessionId,
          documentId,
        }),
      );
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "token") {
        setHasReceivedToken(true);
        setMessages((prev) => {
          const assistantExists = prev.some((msg) => msg.id === assistantId);

          if (!assistantExists) {
            return [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: data.content,
                sources: [],
              },
            ];
          }

          return prev.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: msg.content + data.content }
              : msg,
          );
        });
      }

      if (data.type === "done") {
        setQuestionStats((currentStats) => ({
          used: data.questionsUsed ?? currentStats.used,
          remaining: data.questionsRemaining ?? currentStats.remaining,
          max:
            currentStats.max ||
            (data.questionsUsed ?? 0) + (data.questionsRemaining ?? 0),
        }));

        setIsStreaming(false);
        socket.close();
      }

      if (data.type === "error") {
        setError(data.message || "Failed to get answer.");
        setIsStreaming(false);
        socket.close();
      }
    };

    socket.onerror = () => {
      setError("WebSocket connection failed.");
      setIsStreaming(false);
    };
  };

  const handleSubmit = () => {
    if (!file) {
      setError("Please choose a PDF file.");
      return;
    }

    setError("");

    const formData = new FormData();
    formData.append("file", file);

    uploadMutation.mutate(formData, {
      onSuccess: ({ data }) => {
        setDocumentId(data.documentId);
        setSessionId(data.sessionId);
        setUploadMeta(data);

        const expiresAt = Date.now() + data.expiresInSeconds * 1000;

        setExpiresAt(expiresAt);

        localStorage.setItem(
          "rag-session",
          JSON.stringify({
            sessionId: data.sessionId,
            documentId: data.documentId,
            uploadMeta: data,
            questionStats: {
              used: 0,
              remaining: data.maxQuestions,
              max: data.maxQuestions,
            },
            expiresAt,
          }),
        );

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
      },

      onError: (error) => {
        setError(error.response?.data?.detail || "Failed to upload PDF.");
      },
    });
  };

  const handleQuestionKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollButton(!isNearBottom);
  };

  useEffect(() => {
    localStorage.setItem("rag-messages", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (!isStreaming) return;
    scrollToBottom();
  }, [messages, isStreaming]);

  return (
    <main className="min-h-dvh bg-[#f7f7f8] text-[#111827] lg:h-dvh lg:overflow-hidden">
      <div className="flex min-h-dvh w-full flex-col lg:h-full lg:min-h-0 lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 border-b border-[#e5e7eb] bg-[#202123] text-white lg:h-full lg:w-80 lg:border-b-0 lg:border-r lg:border-[#303139]">
          <div className="flex flex-col p-3 sm:p-4 lg:h-full lg:overflow-y-auto">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#10a37f]" aria-hidden="true" />
                <h1 className="text-lg font-semibold">RAG PDF Chat</h1>
              </div>
              <p className="mt-1 text-sm text-[#c5c5d2]">
                Upload a PDF, then ask questions from its content.
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-[#3f4048] bg-[#2a2b32] p-3 sm:p-4">
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

              <label className="mt-3 flex cursor-pointer flex-col rounded-md border border-dashed border-[#565869] px-4 py-4 text-center text-sm text-[#d1d5db] transition hover:border-white hover:bg-[#343541] sm:mt-4 sm:py-5">
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

              <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4">
                <button
                  data-testid="upload-button"
                  onClick={handleSubmit}
                  disabled={!file || uploadMutation.isPending}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-[#202123] transition hover:bg-[#ececf1] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                >
                  {uploadMutation.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  )}
                  {uploadMutation.isPending ? "Uploading" : "Upload"}
                </button>
                <button
                  data-testid="delete-button"
                  onClick={handleFileDelete}
                  disabled={!file && !fileUploaded}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-[#565869] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#343541] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-2.5 sm:p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Available questions
                </p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {questionStats.remaining}
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-2.5 sm:p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Questions used
                </p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {questionStats.used}
                  <span className="text-sm font-normal text-[#8e8ea0]">
                    /{questionStats.max || uploadMeta?.maxQuestions || 0}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-2.5 sm:p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Max questions
                </p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {questionStats.max || uploadMeta?.maxQuestions || 0}
                </p>
              </div>
              <div className="rounded-lg border border-[#3f4048] bg-[#2a2b32] p-2.5 sm:p-3">
                <p className="flex items-center gap-1.5 text-xs text-[#8e8ea0]">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Max file size
                </p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">
                  {MAX_FILE_SIZE_LABEL}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-lg border border-[#3f4048] bg-[#2a2b32] p-2.5 text-sm text-[#d1d5db] sm:mt-4 sm:p-3">
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

        <section className="flex min-h-[65dvh] flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
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

          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
          >
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 ? (
                <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
                  <div className="flex items-center gap-2 rounded-full border border-[#d1d5db] bg-white px-5 py-3 text-sm font-medium shadow-sm">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Upload a PDF to begin
                  </div>
                  <p className="mt-4 max-w-md text-sm leading-6 text-[#6b7280]">
                    You can ask up to {uploadMeta?.maxQuestions || 5} questions
                    per upload. PDF upload size is limited to{" "}
                    {MAX_FILE_SIZE_LABEL}.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex gap-4 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
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

                  {isStreaming && !hasReceivedToken && (
                    <article className="flex gap-4">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#10a37f] text-sm font-semibold text-white">
                        <Bot className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#6b7280] shadow-sm">
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
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
              <div ref={bottomRef} />
              {showScrollButton && (
                <button
                  onClick={scrollToBottom}
                  className="sticky bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-[#d1d5db] bg-white px-4 py-2 text-xs font-medium text-[#374151] shadow-md hover:bg-[#f3f4f6] cursor-pointer"
                >
                  <ChevronsDown className="inline-block mr-1" /> Scroll to
                  latest
                </button>
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
                    isStreaming ||
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
                {questionStats.max || uploadMeta?.maxQuestions || 0}. Max PDF
                size {MAX_FILE_SIZE_LABEL}.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default RAGPDF;
