@react.component
let make = (~search: RegistryCore.Search.pageSearch, ~production: bool, ~children) => {
  let homeHref = PageLinks.href(~path="/", ~search, ~production)
  let destinationsHref = PageLinks.href(~path="/destinations", ~search, ~production)
  <>
    <header className="site-header">
      <div className="container header-inner">
        <NextBindings.Link href={homeHref} className="wordmark" ariaLabel="Elsewhere home">
          {React.string("elsewhere")}
          <span> {React.string(".")} </span>
        </NextBindings.Link>
        <nav ariaLabel="Main navigation">
          <NextBindings.Link href={homeHref}> {React.string("Home")} </NextBindings.Link>
          <NextBindings.Link href={destinationsHref}>
            {React.string("Destinations")}
          </NextBindings.Link>
        </nav>
        <span className="header-note"> {React.string("Stays with a sense of place")} </span>
      </div>
    </header>
    {children}
    <footer className="site-footer">
      <div className="container">
        <strong> {React.string("elsewhere.")} </strong>
        <p> {React.string("Independent hotels and slower journeys, selected with care.")} </p>
        <NextBindings.Link href={destinationsHref}>
          {React.string("Explore destinations →")}
        </NextBindings.Link>
      </div>
    </footer>
  </>
}
