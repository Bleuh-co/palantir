// Rôle interne Palantir (mappé depuis le rôle standardisé Chanv)
// - superadmin : accès total
// - admin      : gestion complète
// - membre     : accès consultation (rôle Consulter)
// - blocked    : pas d'accès
export type Role = "superadmin" | "admin" | "membre" | "blocked";

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Super Administrateur",
  admin: "Administrateur",
  membre: "Membre",
  blocked: "Bloqué",
};
