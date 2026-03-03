"use client";

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f3f4f6",
  padding: "24px 16px",
  paddingTop: "60px",
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  maxWidth: "480px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  padding: "28px 24px",
  borderRadius: "16px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};

export default function BarberShopPage() {
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#111",
          }}
        >
          Shop
        </h1>
        <p style={{ fontSize: "14px", color: "#4b5563" }}>
          Espace shop coiffeur (à venir).
        </p>
      </div>
    </div>
  );
}
