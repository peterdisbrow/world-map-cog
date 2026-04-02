import { next } from "@vercel/functions";

function isProtectedRequest(pathname, method) {
  const isReadMethod = method === "GET" || method === "HEAD";
  if (pathname === "/admin" || pathname === "/admin.html") return true;
  if (pathname === "/submit" || pathname === "/submit.html") return true;
  if (pathname.startsWith("/api/upload/")) return true;
  if (pathname.startsWith("/api/upload-thumbnail/")) return true;
  if ((pathname === "/api/locations" || pathname.startsWith("/api/locations/")) && !isReadMethod) return true;
  return false;
}

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="World Map Admin"',
    },
  });
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  if (!isProtectedRequest(pathname, request.method)) {
    return next();
  }

  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!username || !password) {
    return new Response("Hosted admin auth is not configured.", { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const splitIndex = decoded.indexOf(":");
  const suppliedUser = splitIndex >= 0 ? decoded.slice(0, splitIndex) : "";
  const suppliedPass = splitIndex >= 0 ? decoded.slice(splitIndex + 1) : "";

  if (suppliedUser !== username || suppliedPass !== password) {
    return unauthorized();
  }

  return next();
}

export const config = {
  matcher: ["/admin", "/admin.html", "/submit", "/submit.html", "/api/:path*"],
};
