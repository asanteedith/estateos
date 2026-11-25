import Link from "next/link";
import { formatMoney } from "@/modules/shared/money";
import { PRICING_POLICY } from "@/modules/commercial/pricing";

export default function Home() {
  return (
    <>
      <header className="public-header">
        <div className="wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>EstateOS</strong>
          <span style={{ display: "flex", gap: 8 }}>
            <Link className="button secondary" href="/login">Log in</Link>
            <Link className="button" href="/signup">Create agency workspace</Link>
          </span>
        </div>
      </header>
      <main className="wrap">
        <section className="hero">
          <h1>Your agency&apos;s listings and enquiries, in one place.</h1>
          <p className="muted" style={{ fontSize: "1.1rem", maxWidth: 640 }}>
            EstateOS gives a real estate agency a public listings page with an enquiry form, and an inbox and
            workspace to manage those listings and the leads they bring in.
          </p>
          <p style={{ marginTop: "1.25rem" }}>
            <Link className="button" href="/signup">Start your workspace</Link>
          </p>
        </section>
        <section className="grid two">
          <div className="card">
            <h3>What is included today</h3>
            <ul>
              <li>Listings for sale and rent, with draft, published and archived states</li>
              <li>A public page for your agency at <code>/p/your-agency</code></li>
              <li>An enquiry form on that page, feeding your enquiries inbox</li>
              <li>Separate, private workspace per agency</li>
            </ul>
          </div>
          <div className="card">
            <h3>Complete digital package</h3>
            <p>
              Set-up, onboarding of your current listings and a walkthrough session.
            </p>
            <p>
              Ghana: <strong>{formatMoney(PRICING_POLICY.ghana.listPriceMinor, "GHS")}</strong>
              <br />
              International: <strong>{formatMoney(PRICING_POLICY.international.listPriceMinor, "USD")}</strong>
            </p>
            <p className="small muted">50% deposit to start, balance on delivery.</p>
          </div>
        </section>
      </main>
    </>
  );
}
