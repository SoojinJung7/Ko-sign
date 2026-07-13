import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
