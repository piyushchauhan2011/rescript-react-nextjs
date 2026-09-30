module Intro = {
  @react.component
  let make = () =>
    <header className="destination-intro">
      <p className="eyebrow"> {React.string("FIELD GUIDES")} </p>
      <h1>
        {React.string("Places worth")}
        <br />
        <em> {React.string("knowing slowly.")} </em>
      </h1>
      <p>
        {React.string(
          "Independent stays, local rituals, and considered notes for a more rewarding arrival.",
        )}
      </p>
      <PlanningPrompt
        brief="Choose one place to focus."
        expanded="Select a card to narrow the collection to one destination."
      />
    </header>
}

@react.component
let make = (~destinations: array<RegistryCore.Catalog.destination>, ~search, ~production) => {
  <main className="container destination-page">
    <Intro />
    {if Array.length(destinations) > 0 {
      <DestinationCards destinations search production />
    } else {
      let href = PageLinks.href(~path="/destinations", ~search, ~production)
      <div className="empty-state">
        <h2> {React.string("No destination found")} </h2>
        <p>
          {React.string(
            "That destination is not in our collection. Browse all seven places instead.",
          )}
        </p>
        <NextBindings.Link href> {React.string("Clear destination filter →")} </NextBindings.Link>
      </div>
    }}
  </main>
}
