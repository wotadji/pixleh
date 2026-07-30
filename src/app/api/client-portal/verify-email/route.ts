import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  if (!token) {
    return NextResponse.redirect(`${appUrl}/client/login?verify=invalid`);
  }

  const account = await prisma.clientAccount.findUnique({ where: { verifyToken: token } });
  if (!account || !account.verifyTokenExpiry || account.verifyTokenExpiry < new Date()) {
    return NextResponse.redirect(`${appUrl}/client/login?verify=expired`);
  }

  await prisma.clientAccount.update({
    where: { id: account.id },
    data: { emailVerified: new Date(), verifyToken: null, verifyTokenExpiry: null },
  });

  return NextResponse.redirect(`${appUrl}/client/login?verify=success`);
}
