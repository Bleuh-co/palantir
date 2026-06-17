import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-server";
import { getAlerts, createAlert, type Alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/**
 * GET /api/alerts?status=active|acknowledged|all
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") as
    | "active"
    | "acknowledged"
    | null;

  try {
    const alerts = await getAlerts(status || undefined);
    return NextResponse.json({ alerts, count: alerts.length });
  } catch (err: any) {
    console.error("[API /alerts]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/alerts — webhook for external alerts (GCP Monitoring, budget)
 * Auth: either session cookie or X-Palantir-Key header
 */
export async function POST(req: NextRequest) {
  // Auth: session or API key
  const session = await getSession();
  const apiKey = req.headers.get("x-palantir-key");
  const validApiKey = process.env.PALANTIR_API_KEY;

  if (!session && (!apiKey || !validApiKey || apiKey !== validApiKey)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const alert: Omit<Alert, "id"> = {
      service: body.service || "external",
      env: body.env || "prod",
      type: body.type || "external",
      severity: body.severity || "warning",
      status: "active",
      message: body.message || "Alerte externe",
      value: body.value || 0,
      threshold: body.threshold || 0,
      createdAt: new Date().toISOString(),
    };

    const id = await createAlert(alert);
    return NextResponse.json({ ok: true, id });
  } catch (err: any) {
    console.error("[API /alerts POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
