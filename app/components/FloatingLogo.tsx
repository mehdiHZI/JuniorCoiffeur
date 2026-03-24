"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingLogo() {
  const pathname = usePathname();

  let href = "/auth";
  if (pathname.startsWith("/client")) href = "/client";
  else if (pathname.startsWith("/barber")) href = "/barber";

  return (
    <div
      style={{
        position: "fixed",
        top: "12px",
        right: "16px",
        zIndex: 80,
      }}
    >
      <Link href={href} aria-label="Retour à l'accueil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/chriscut-logo.png"
          alt="Logo Chriscut"
          style={{ height: "44px", cursor: "pointer" }}
        />
      </Link>
    </div>
  );
}
