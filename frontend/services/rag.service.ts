import { api } from "@/lib/axios";

export const uploadPdf = (formData: FormData) =>
  api.post("/upload-pdf", formData);

export const askQuestion = (payload: {
  question: string;
  sessionId: string;
  documentId: string;
}) => api.post("/ask", payload);
