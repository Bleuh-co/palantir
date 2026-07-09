import { NextRequest } from "next/server";
import { gandalfMiddleware } from "@bleuh-co/gandalf-sdk-next/middleware";

/**
 * Middleware Palantir — contrat d'embarquement Gandalf (embed + langue +
 * frame-ancestors) sur les PAGES uniquement.
 *
 * IMPORTANT : les routes /api/* sont volontairement EXCLUES du matcher.
 * Le hub appelle Palantir serveur-à-serveur avec le header `x-palantir-key`
 * (PALANTIR_API_KEY) sur /api/services, /api/alerts, /api/firestore,
 * /api/billing/* — ces appels ne doivent recevoir ni cookies ni en-têtes
 * d'embed. Leur auth par clé reste inchangée dans les routes elles-mêmes.
 */
export function middleware(req: NextRequest) {
  return gandalfMiddleware(req);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|favicon.svg|manifest.webmanifest|sw.js|logo-|icons?/).*)"],
};
