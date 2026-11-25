const SIGNALS: [string, string][] = [
  ["hasActiveListings", "Has active property listings"],
  ["noOnlineEnquiryForm", "No working online enquiry form"],
  ["outdatedOrNoWebsite", "Website missing or outdated"],
  ["decisionMakerIdentified", "Decision-maker publicly identified"],
  ["verifiedBusinessContact", "Business contact verified"],
  ["inTargetMarket", "In a target market"],
  ["activeOnSocial", "Active on social media"],
];

/** Fit-score checkboxes. Tick only what you checked yourself. */
export function SignalFields() {
  return (
    <fieldset className="card" style={{ padding: "0.6rem 0.8rem" }}>
      <legend className="small muted">Fit signals (tick only what you checked on their website or profiles)</legend>
      <div className="fields">
        {SIGNALS.map(([k, label]) => (
          <label key={k} className="check"><input type="checkbox" name={k} /> {label}</label>
        ))}
      </div>
    </fieldset>
  );
}
