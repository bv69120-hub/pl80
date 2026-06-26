export interface AppShellProps {
  appName: string;
}

export function AppShell({ appName }: AppShellProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px",
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          width: "min(100%, 760px)",
          border: "1px solid #d9dee8",
          borderRadius: "8px",
          background: "#ffffff",
          padding: "32px",
          boxShadow: "0 16px 40px rgba(23, 32, 51, 0.08)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            color: "#5d6a7f",
            fontSize: "14px",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Socle applicatif
        </p>
        <h1
          style={{
            margin: 0,
            color: "#172033",
            fontSize: "clamp(32px, 5vw, 48px)",
            lineHeight: 1.1,
          }}
        >
          {appName}
        </h1>
      </section>
    </main>
  );
}
