export function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json({ error: "Une erreur est survenue. Veuillez réessayer." }, { status: 500 });
}

export async function readJson<T>(request: Request, schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { success: false as const };
  }
  try {
    return schema.safeParse(await request.json());
  } catch {
    return { success: false as const };
  }
}