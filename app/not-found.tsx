import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body stack">
          <h1>Nothing here</h1>
          <p className="muted">
            Either this matter does not exist or the identity you are running as is not permitted to see it.
            The prototype deliberately does not distinguish between the two.
          </p>
          <Link href="/matters" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>Back to matters</Link>
        </div>
      </div>
    </main>
  );
}
