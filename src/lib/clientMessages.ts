/**
 * Sérialise un ClientMessage pour l'API — remplace les pièces jointes stockées (qui
 * contiennent la clé de stockage interne, voir buildClientMessageAttachmentKey) par une URL
 * de téléchargement studio-only, jamais la clé brute. Utilisé par GET /api/clients/[id] (fil
 * complet) et POST /api/clients/[id]/messages (message qui vient d'être créé), pour rester
 * cohérent entre les deux réponses.
 */
export function serializeClientMessage<
  T extends { id: string; clientId: string; attachments: unknown }
>(message: T) {
  const attachments = ((message.attachments as any[]) || []).map((a) => ({
    id: a.id,
    name: a.name,
    mime: a.mime,
    size: a.size,
    url: `/api/clients/${message.clientId}/messages/${message.id}/attachments/${a.id}`,
  }));
  return { ...message, attachments };
}
