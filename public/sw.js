// Service worker minimal — enregistré uniquement pour rendre la PWA
// installable (Chrome exige un service worker avec un fetch handler).
// On ne met PAS de cache offline pour l'instant : les pages dynamiques
// (Firestore-backed) n'ont aucun sens en offline et un cache trop
// agressif causerait des données stale.

self.addEventListener("install", (event) => {
  // Active immédiatement la nouvelle version (ne pas attendre la fermeture
  // des onglets ouverts).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Prend le contrôle des clients existants sans reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through — pas de cache. Le service worker existe juste pour
  // satisfaire les critères PWA de Chrome.
  // (intentionnellement vide — laisse le browser gérer normalement)
});
