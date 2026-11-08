"use client";

// Rendered outside the root layout (no i18n provider), so it carries a short trilingual fallback.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-CA">
      <body style={{ fontFamily: "system-ui", display: "grid", placeItems: "center", minHeight: "100dvh" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p lang="fr-CA" style={{ margin: "4px 0" }}>Une erreur s&apos;est produite</p>
          <p lang="pt-BR" style={{ margin: "4px 0" }}>Algo deu errado</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 999 }}>
            Try again · <span lang="fr-CA">Réessayer</span> · <span lang="pt-BR">Tentar de novo</span>
          </button>
        </div>
      </body>
    </html>
  );
}
