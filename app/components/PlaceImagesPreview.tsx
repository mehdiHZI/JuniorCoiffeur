"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type Props = {
  urls: string[];
  thumbSize?: number;
  gap?: number;
  marginTop?: number | string;
  alt?: string;
};

export function PlaceImagesPreview({ urls, thumbSize = 44, gap = 6, marginTop, alt = "" }: Props) {
  const [index, setIndex] = useState<number | null>(null);

  const close = () => setIndex(null);

  const go = useCallback(
    (delta: number) => {
      setIndex((prev) => {
        if (prev === null || urls.length === 0) return prev;
        return (prev + delta + urls.length) % urls.length;
      });
    },
    [urls.length]
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  if (!urls.length) return null;

  const wrapStyle: CSSProperties = {
    display: "flex",
    gap,
    flexWrap: "wrap",
    ...(marginTop !== undefined ? { marginTop } : {}),
  };

  const thumbBtn: CSSProperties = {
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    borderRadius: "8px",
    lineHeight: 0,
  };

  const radius = thumbSize <= 44 ? 6 : thumbSize <= 56 ? 8 : 10;

  return (
    <>
      <div style={wrapStyle}>
        {urls.map((url, i) => (
          <button key={url} type="button" onClick={() => setIndex(i)} aria-label="Agrandir la photo du lieu" style={thumbBtn}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              style={{
                width: thumbSize,
                height: thumbSize,
                objectFit: "cover",
                borderRadius: radius,
                border: "1px solid #e5e7eb",
                display: "block",
              }}
            />
          </button>
        ))}
      </div>

      {index !== null && (
        <div
          role="dialog"
          aria-modal
          aria-label="Photo du lieu en grand"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.88)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={close}
        >
          <button
            type="button"
            aria-label="Fermer"
            onClick={close}
            style={{
              position: "absolute",
              top: "16px",
              right: "16px",
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "26px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
          {urls.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Photo précédente"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontSize: "28px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Photo suivante"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontSize: "28px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ›
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[index]}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "min(92vw, 1200px)",
              maxHeight: "88vh",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              borderRadius: "8px",
            }}
          />
        </div>
      )}
    </>
  );
}
