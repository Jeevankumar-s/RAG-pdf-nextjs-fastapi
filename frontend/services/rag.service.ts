import { api } from "@/lib/axios";

export const uploadPdf = (formData: FormData) =>
  api.post("/upload-pdf", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

export const askQuestion = (payload: {
  question: string;
  sessionId: string;
  documentId: string;
}) => api.post("/ask", payload);