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
          width={44}
          height={44}
          style={{
            width: "44px",
            height: "44px",
            objectFit: "contain",
            cursor: "pointer",
            filter: "drop-shadow(0 4px 12px rgba(17, 24, 39, 0.18))",
          }}
        />
      </Link>
    </div>
  );
}
