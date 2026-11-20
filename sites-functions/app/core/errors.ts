export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, detail?: string) {
    super(detail ?? code);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function fail(code: string, status: number, detail?: string): never {
  throw new AppError(code, status, detail);
}

export function httpError(status: number, detail: string): never {
  throw new AppError("http_error", status, detail);
}

export function errorBody(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof AppError) {
    if (error.code === "http_error") {
      return { status: error.status, body: { detail: error.message } };
    }
    return { status: error.status, body: { error: error.code, detail: error.message } };
  }
  return { status: 503, body: { error: "service_unavailable", detail: "服务暂时不可用，请稍后重试。" } };
}