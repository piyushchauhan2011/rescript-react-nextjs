module DestinationSearch = {
  @react.component
  let make = (~destinations: array<RegistryCore.Catalog.destination>, ~search, ~production) => {
    let previews = RegistryCore.Search.inspectorSearch(search, production)
    <form className="destination-search" action="/destinations" method="get">
      <label htmlFor="destination-select"> {React.string("Find your next place")} </label>
      <div className="search-row">
        <select id="destination-select" name="destination" defaultValue="" required=true>
          <option value="" disabled=true> {React.string("Choose a destination")} </option>
          {destinations
          ->Array.map(destination =>
            <option key={destination.id} value={destination.slug}>
              {React.string(destination.name ++ ", " ++ destination.country)}
            </option>
          )
          ->React.array}
        </select>
        <button type_="submit">
          {React.string("Explore stays ")}
          <span ariaHidden=true> {React.string("↗")} </span>
        </button>
      </div>
      {previews
      ->Dict.toArray
      ->Array.map(((key, value)) => <input key type_="hidden" name={key} value />)
      ->React.array}
    </form>
  }
}

module Hero = {
  @react.component
  let make = (~destinations, ~search, ~production) => {
    let heroLayout = DecisionProvider.useDecision(values => values.heroLayout)
    let searchLayout = DecisionProvider.useDecision(values => values.searchLayout)
    let heroName = switch heroLayout {
    | #immersive => "immersive"
    | #split => "split"
    }
    let searchName = switch searchLayout {
    | #overlay => "overlay"
    | #inline => "inline"
    }
    DestinationCards.domElement(
      "section",
      {
        "className": "hero hero-" ++ heroName ++ " search-" ++ searchName,
        "data-hero-layout": heroName,
        "data-search-layout": searchName,
      },
      <>
        <div className="hero-visual" role="presentation" />
        <div className="container hero-content">
          <p className="eyebrow"> {React.string("STAYS WITH A SENSE OF PLACE")} </p>
          <h1>
            {React.string("Go somewhere")}
            <br />
            <em> {React.string("worth remembering.")} </em>
          </h1>
          <p> {React.string("Independent hotels and slower journeys, selected with care.")} </p>
          <PlanningPrompt
            brief="Plan at your own pace."
            expanded="Choose a destination to narrow the collection before exploring."
          />
          {switch searchLayout {
          | #inline => <DestinationSearch destinations search production />
          | #overlay => React.null
          }}
        </div>
        {switch searchLayout {
        | #overlay =>
          <div className="container hero-search">
            <DestinationSearch destinations search production />
          </div>
        | #inline => React.null
        }}
      </>,
    )
  }
}

module Places = {
  @react.component
  let make = (~destinations, ~search, ~production) => {
    let href = PageLinks.href(~path="/destinations", ~search, ~production)
    <section className="section places">
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="eyebrow"> {React.string("CURATED PLACES")} </p>
            <h2> {React.string("Where will you go next?")} </h2>
          </div>
          <NextBindings.Link href> {React.string("All destinations →")} </NextBindings.Link>
        </div>
        <DestinationCards destinations search production />
      </div>
    </section>
  }
}

module FeaturedStays = {
  @send external fixed: (float, int) => string = "toFixed"
  @react.component
  let make = (
    ~hotels: array<RegistryCore.Catalog.hotel>,
    ~destinations: array<RegistryCore.Catalog.destination>,
    ~search,
    ~production,
  ) => {
    let href = PageLinks.href(~path="/destinations", ~search, ~production)
    <section className="section featured">
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="eyebrow"> {React.string("REMARKABLE STAYS")} </p>
            <h2> {React.string("Hotels we keep thinking about")} </h2>
          </div>
          <NextBindings.Link href> {React.string("Explore destinations →")} </NextBindings.Link>
        </div>
        <div className="hotel-grid">
          {hotels
          ->Array.map(hotel => {
            let destination =
              destinations
              ->Array.find(destination => destination.id == hotel.destinationId)
              ->Option.map(destination => destination.slug)
            let hotelHref = PageLinks.href(
              ~path="/destinations",
              ~search,
              ~production,
              ~destination,
            )
            <article className="hotel-card" key={hotel.id}>
              <NextBindings.Link href={hotelHref}>
                <div className="hotel-image">
                  <Image.Tag
                    src={Image.imageUrl(hotel.image, W800)}
                    srcSet={Image.srcSet(hotel.image)}
                    sizes="(max-width: 650px) calc(100vw - 32px), (max-width: 900px) calc((100vw - 72px) / 2), (max-width: 1228px) calc((100vw - 96px) / 3), 377px"
                    alt=""
                    width="1280"
                    height="800"
                    loading="lazy"
                    fetchPriority="low"
                    decoding="async"
                  />
                  <span className="hotel-rating">
                    {React.string("★ " ++ fixed(hotel.rating->Int.toFloat /. 10.0, 1))}
                  </span>
                </div>
                <div className="hotel-copy">
                  <p className="eyebrow"> {React.string("INDEPENDENT STAY")} </p>
                  <h3> {React.string(hotel.name)} </h3>
                  <p> {React.string(hotel.summary)} </p>
                  <PlanningPrompt
                    brief="Explore this destination."
                    expanded="Open this stay's destination to focus on one place."
                  />
                  <div className="hotel-footer">
                    <span>
                      {React.string("From ")}
                      <strong> {React.string("$" ++ Int.toString(hotel.priceFrom))} </strong>
                      {React.string(" / night")}
                    </span>
                    <span ariaHidden=true> {React.string("↗")} </span>
                  </div>
                </div>
              </NextBindings.Link>
            </article>
          })
          ->React.array}
        </div>
      </div>
    </section>
  }
}

module SeasonalOffers = {
  @react.component
  let make = () =>
    <section className="section offers">
      <div className="container offers-inner">
        <p className="eyebrow"> {React.string("SPECIAL OFFERS")} </p>
        <h2>
          {React.string("More time.")}
          <br />
          <em> {React.string("More to remember.")} </em>
        </h2>
        <p>
          {React.string(
            "Seasonal invitations designed to make a good stay linger a little longer.",
          )}
        </p>
      </div>
    </section>
}

@react.component
let make = (~catalog: RegistryCore.Catalog.homeCatalog, ~search, ~production) => {
  let offersVisible = DecisionProvider.useDecision(values => values.offersVisible)
  <main>
    <Image.HeroPreload />
    <Hero destinations={catalog.destinations} search production />
    <Places destinations={catalog.destinations} search production />
    <FeaturedStays hotels={catalog.hotels} destinations={catalog.destinations} search production />
    {if offersVisible {
      <SeasonalOffers />
    } else {
      React.null
    }}
  </main>
}
