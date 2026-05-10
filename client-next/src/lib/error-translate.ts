import { useTranslations } from "next-intl";

export function useErrorTranslation() {
  const t = useTranslations("errors.codes");
  const tFallback = useTranslations("errors");

  return function translateError(error: unknown, fallback?: string): string {
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "data" in error.response &&
      error.response.data &&
      typeof error.response.data === "object" &&
      "code" in error.response.data &&
      typeof error.response.data.code === "string"
    ) {
      const code = error.response.data.code;
      try {
        const translated = t(code);
        if (translated !== code) return translated;
      } catch {
        // Key not found, fall through
      }
    }

    // Fallback: use existing error message
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "data" in error.response &&
      error.response.data &&
      typeof error.response.data === "object" &&
      "error" in error.response.data &&
      typeof error.response.data.error === "string"
    ) {
      return error.response.data.error;
    }

    if (error instanceof Error) return error.message;

    return fallback || tFallback("title");
  };
}
