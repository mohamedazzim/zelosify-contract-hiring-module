import { NextResponse } from "next/server";
import { extractRoleFromToken } from "@/utils/Auth/middlewareUtils";

export function middleware(request) {
  const path = request.nextUrl.pathname;

  const isPublicPath =
    path === "/login" ||
    path === "/register" ||
    path === "/setup-totp" ||
    path.startsWith("/api/");

  const accessToken = request.cookies.get("access_token")?.value;
  const refreshToken = request.cookies.get("refresh_token")?.value;
  const registrationToken = request.cookies.get("registration_token")?.value;

  const isAuthenticated = !!accessToken && !!refreshToken;
  const isRegistering = !!registrationToken;

  const response = NextResponse.next();
  let userRole = null;

  if (isAuthenticated && accessToken) {
    userRole = extractRoleFromToken(accessToken);
    if (userRole) {
      response.cookies.set("role", userRole, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
    } else {
      response.cookies.delete("role");
    }
  } else if (!isAuthenticated) {
    response.cookies.delete("role");
  }

  if (isRegistering) {
    if (path !== "/setup-totp") {
      return NextResponse.redirect(new URL("/setup-totp", request.url));
    }
    return response;
  }

  if (isPublicPath && isAuthenticated) {
    console.log("User Role = ", userRole);
    switch (userRole) {
      case "VENDOR_MANAGER":
        console.log("Redirecting VENDOR_MANAGER to /vendor-requests");
        return NextResponse.redirect(new URL("/vendor-requests", request.url));

      case "BUSINESS_USER":
        console.log("Redirecting BUSINESS_USER to /business-user/digital-initiative");
        return NextResponse.redirect(new URL("/business-user/digital-initiative", request.url));

      case "IT_VENDOR":
        console.log("Redirecting IT_VENDOR to /vendor/openings");
        return NextResponse.redirect(new URL("/vendor/openings", request.url));

      case "HIRING_MANAGER":
        console.log("Redirecting HIRING_MANAGER to /hiring-manager/openings");
        return NextResponse.redirect(new URL("/hiring-manager/openings", request.url));

      default:
        console.log("Unknown role (" + userRole + ") - redirecting to /");
        return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (!isPublicPath && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/user/:path*",
    "/vendor/:path*",
    "/business-user/:path*",
    "/hiring-manager/:path*",
    "/login",
    "/register",
    "/setup-totp",
  ],
};
