import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError } from "@/lib/access";

/**
 * Recherche globale du panel studio (18/09/2026, demande d'Adriel : "la recherche global sur
 * le site" dans la nouvelle barre du haut fixe). Interroge en parallèle les 6 types de
 * ressources choisis (galeries, clients/prospects, contrats, factures, commandes,
 * réservations), scopés au studio courant, et renvoie un résultat groupé par catégorie —
 * plutôt qu'une seule table "recherchable" (pas de modèle unifié dans ce schéma), chaque
 * requête reste simple et rapide (5 résultats max par catégorie, insensible à la casse).
 *
 * `?q=` de moins de 2 caractères renvoie une réponse vide sans toucher la base — évite des
 * requêtes coûteuses (scan large) à chaque frappe avant que l'utilisateur ait tapé un terme
 * réellement discriminant.
 */
export async function GET(req: Request) {
  try {
    const session = await requireStudioSession();
    const studioId = session.user.studioId;
    const q = new URL(req.url).searchParams.get("q")?.trim() || "";

    if (q.length < 2) {
      return NextResponse.json({
        galleries: [],
        clients: [],
        contracts: [],
        invoices: [],
        orders: [],
        bookings: [],
      });
    }

    const insensitive = { contains: q, mode: "insensitive" as const };

    const [galleries, clients, contracts, invoices, orders, bookings] = await Promise.all([
      prisma.gallery.findMany({
        where: {
          studioId,
          OR: [{ title: insensitive }, { client: { name: insensitive } }],
        },
        select: { id: true, title: true, client: { select: { name: true } } },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.findMany({
        where: {
          studioId,
          OR: [{ name: insensitive }, { email: insensitive }, { phone: insensitive }],
        },
        select: { id: true, name: true, email: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.contract.findMany({
        where: {
          studioId,
          OR: [{ title: insensitive }, { client: { name: insensitive } }],
        },
        select: { id: true, title: true, client: { select: { name: true } } },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        where: {
          studioId,
          OR: [{ number: insensitive }, { guestClientName: insensitive }, { client: { name: insensitive } }],
        },
        select: { id: true, number: true, client: { select: { name: true } }, guestClientName: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          studioId,
          OR: [{ customerName: insensitive }, { customerEmail: insensitive }],
        },
        select: { id: true, customerName: true, customerEmail: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        where: {
          studioId,
          OR: [{ customerName: insensitive }, { customerEmail: insensitive }],
        },
        select: { id: true, customerName: true, startsAt: true },
        take: 5,
        orderBy: { startsAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      galleries: galleries.map((g) => ({ id: g.id, label: g.title, sublabel: g.client?.name || null })),
      clients: clients.map((c) => ({ id: c.id, label: c.name, sublabel: c.email })),
      contracts: contracts.map((c) => ({ id: c.id, label: c.title, sublabel: c.client?.name || null })),
      invoices: invoices.map((i) => ({
        id: i.id,
        label: i.number,
        sublabel: i.client?.name || i.guestClientName || null,
      })),
      orders: orders.map((o) => ({ id: o.id, label: o.customerName, sublabel: o.customerEmail })),
      bookings: bookings.map((b) => ({
        id: b.id,
        label: b.customerName,
        sublabel: new Date(b.startsAt).toLocaleDateString("fr-FR"),
      })),
    });
  } catch (e) {
    if (e instanceof AccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
