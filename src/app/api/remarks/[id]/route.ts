import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioSession, AccessError, handleApiError } from "@/lib/access";

/** Marque une remarque comme traitée (ou non) — studio uniquement. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const remark = await prisma.photoRemark.findFirst({
      where: { id: params.id, gallery: { studioId: session.user.studioId } },
    });
    if (!remark) throw new AccessError("Remarque introuvable", 404);

    const body = await req.json();
    const updated = await prisma.photoRemark.update({
      where: { id: remark.id },
      data: { ...(body.resolved !== undefined && { resolved: !!body.resolved }) },
    });
    return NextResponse.json({ remark: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireStudioSession();
    const remark = await prisma.photoRemark.findFirst({
      where: { id: params.id, gallery: { studioId: session.user.studioId } },
    });
    if (!remark) throw new AccessError("Remarque introuvable", 404);
    await prisma.photoRemark.delete({ where: { id: remark.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
