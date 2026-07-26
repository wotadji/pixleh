import { getStudioSession } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { OrdersView } from "@/components/studio/OrdersView";

export default async function OrdersPage() {
  const session = await getStudioSession();
  const studioId = session!.user.studioId;
  const orders = await prisma.order.findMany({
    where: { studioId },
    include: { items: { include: { product: true, photo: true } }, gallery: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <OrdersView
      orders={orders.map((o) => ({
        id: o.id,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        galleryId: o.galleryId,
        galleryTitle: o.gallery?.title || null,
        totalCents: o.totalCents,
        status: o.status,
        items: o.items.map((item) => ({
          id: item.id,
          quantity: item.quantity,
          productId: item.productId,
          productName: item.product.name,
          // Chaque OrderItem est lié à une photo précise (voir /api/cart/checkout) — sert
          // au bouton "Plus de détail" pour montrer les photos réellement commandées dans
          // ce groupe (produit + quantité), plutôt qu'une simple ligne texte.
          photo:
            item.photo && o.galleryId
              ? {
                  id: item.photo.id,
                  filename: item.photo.filename,
                  thumbUrl: `/api/files/studios/${studioId}/galleries/${o.galleryId}/${item.photo.id}/thumb.jpg?v=${item.photo.updatedAt.getTime()}`,
                  previewUrl: `/api/files/studios/${studioId}/galleries/${o.galleryId}/${item.photo.id}/preview.jpg?v=${item.photo.updatedAt.getTime()}`,
                }
              : null,
        })),
      }))}
    />
  );
}
