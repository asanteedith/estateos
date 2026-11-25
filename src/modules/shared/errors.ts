export class DomainError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "invalid" | "conflict" | "unauthenticated",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} not found`);
export const forbidden = (why = "You do not have permission to do that") => new DomainError("forbidden", why);
export const invalid = (why: string) => new DomainError("invalid", why);
export const conflict = (why: string) => new DomainError("conflict", why);
