import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { acknowledgeAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/**
 * POST /api/alerts/[id]/acknowledge
 * Body: { reason: string, suppressFuture?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();
    const reason = body.reason || "Acquitté sans raison";
    const suppressFuture = body.suppressFuture === true;

    await acknowledgeAlert(id, session.email, reason, suppressFuture);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(`[API /alerts/${id}/acknowledge]`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
