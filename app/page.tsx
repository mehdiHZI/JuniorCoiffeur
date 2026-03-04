export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#ffffff",
          padding: "32px 28px",
          borderRadius: "16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 600,
            marginBottom: "12px",
            color: "#111",
          }}
        >
          Bienvenue sur chriscut
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#4b5563",
            marginBottom: "24px",
          }}
        >
          Gère la fidélité de tes clients et leurs points facilement.
        </p>

        <a
          href="/auth"
          style={{
            display: "inline-block",
            width: "100%",
            backgroundColor: "#111",
            color: "#fff",
            padding: "14px",
            borderRadius: "10px",
            textDecoration: "none",
            fontSize: "15px",
            fontWeight: 500,
          }}
        >
          Accéder à mon espace
        </a>
      </div>
    </div>
  );
}
