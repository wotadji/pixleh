import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protège toutes les routes /dashboard (espace studio) : redirige vers /login
 * si l'utilisateur n'est pas authentifié via NextAuth.
 * Les galeries (/g/[slug]) et le site public (/s/[slug]) gèrent leur propre
 * accès (mot de passe de galerie) et ne passent pas par ce middleware.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
