import { useMutation } from "@tanstack/react-query";
import { askQuestion } from "@/services/rag.service";

export function useAskQuestion() {
  return useMutation({
    mutationFn: askQuestion,
  });
}