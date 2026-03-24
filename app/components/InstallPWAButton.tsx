"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPWAButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = window.navigator.userAgent;
    const isIPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isIPhone = /iPhone/.test(ua);
    if (isIPad || isIPhone) setIsIOS(true);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstallPrompt(null);
    }
  };

  const showButton = !isInstalled && (installPrompt !== null || isIOS);

  if (!showButton) return null;

  const buttonStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 16px",
    borderRadius: "9999px",
    border: "none",
    backgroundColor: "#111",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
  };

  return (
    <>
      <button
        type="button"
        onClick={isIOS ? () => setShowIOSHelp(true) : handleInstall}
        style={buttonStyle}
        aria-label="Installer l'application"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
        Installer l&apos;app
      </button>

      {showIOSHelp && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Fermer l'aide iOS"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => setShowIOSHelp(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
              setShowIOSHelp(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "320px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: "16px", fontWeight: 600, color: "#111", marginBottom: "12px" }}>
              Ajouter Chriscut sur l&apos;écran d&apos;accueil
            </p>
            <p style={{ fontSize: "14px", color: "#4b5563", marginBottom: "20px" }}>
              Appuyez sur le bouton <strong>Partager</strong> (en bas de Safari), puis choisissez{" "}
              <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
            </p>
            <button
              type="button"
              onClick={() => setShowIOSHelp(false)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#111",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
