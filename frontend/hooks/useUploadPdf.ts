import { useMutation } from "@tanstack/react-query";
import { uploadPdf } from "@/services/rag.service";

export function useUploadPdf() {
  return useMutation({
    mutationFn: uploadPdf,
  });
}