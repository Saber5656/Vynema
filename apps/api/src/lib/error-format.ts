export function formatErrorWithCauses(error: unknown): string {
  const messages: string[] = [];
  const seen = new Set<Error>();
  let current = error;

  while (current instanceof Error && messages.length < 8 && !seen.has(current)) {
    seen.add(current);
    const message = current.message.trim();

    if (message && messages.at(-1) !== message) {
      messages.push(message);
    }

    current = current.cause;
  }

  if (messages.length === 0) {
    return "Unknown database command failure.";
  }

  return messages
    .map((message, index) => (index === 0 ? message : `Caused by: ${message}`))
    .join("\n");
}
