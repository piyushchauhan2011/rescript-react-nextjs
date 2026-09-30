type cardProps = {
  destination: RegistryCore.Catalog.destination,
  search: RegistryCore.Search.pageSearch,
  production: bool,
}

type registry = {
  image: React.component<cardProps>,
  compact: React.component<cardProps>,
}

@module("react")
external domElement: (string, 'props, React.element) => React.element = "createElement"

let imageCard = ({destination, search, production}: cardProps) => {
  let href = PageLinks.href(
    ~path="/destinations",
    ~search,
    ~production,
    ~destination=Some(destination.slug),
  )
  <article className="destination-card image-card">
    <NextBindings.Link href>
      <Image.Tag
        src={Image.imageUrl(destination.image, W800)}
        srcSet={Image.srcSet(destination.image)}
        sizes="(max-width: 650px) calc(100vw - 32px), (max-width: 900px) calc((100vw - 72px) / 2), (max-width: 1228px) calc((100vw - 96px) / 3), 600px"
        alt=""
        width="1280"
        height="720"
        loading="lazy"
        decoding="async"
      />
      <div className="card-copy">
        <span className="eyebrow"> {React.string(destination.country)} </span>
        <h3> {React.string(destination.name)} </h3>
        <p> {React.string(destination.summary)} </p>
        <b> {React.string("Explore place ↗")} </b>
        <PlanningPrompt
          brief={"Focus on " ++ destination.name ++ "."}
          expanded={"Select " ++ destination.name ++ " to filter the collection to one place."}
        />
      </div>
    </NextBindings.Link>
  </article>
}

let compactCard = ({destination, search, production}: cardProps) => {
  let href = PageLinks.href(
    ~path="/destinations",
    ~search,
    ~production,
    ~destination=Some(destination.slug),
  )
  <article className="destination-card compact-card">
    <NextBindings.Link href>
      <span className="eyebrow"> {React.string(destination.country)} </span>
      <h3>
        {React.string(destination.name ++ " ")}
        <span ariaHidden=true> {React.string("↗")} </span>
      </h3>
      <p> {React.string(destination.summary)} </p>
      <PlanningPrompt
        brief={"Focus on " ++ destination.name ++ "."}
        expanded={"Select " ++ destination.name ++ " to filter the collection to one place."}
      />
    </NextBindings.Link>
  </article>
}

let cardRegistry: registry = {
  image: React.component(imageCard),
  compact: React.component(compactCard),
}

module KeyedCard = {
  @react.component
  let make = (~card: React.component<cardProps>, ~destination, ~search, ~production) =>
    React.createElement(card, {destination, search, production})
}

@react.component
let make = (~destinations: array<RegistryCore.Catalog.destination>, ~search, ~production) => {
  let layout = DecisionProvider.useDecision(values => values.destinationCardLayout)
  let columns = DecisionProvider.useDecision(values => values.destinationsColumns)
  let (card, layoutName) = switch layout {
  | #image => (cardRegistry.image, "image")
  | #compact => (cardRegistry.compact, "compact")
  }
  let columnsName = switch columns {
  | #three => "three"
  | #two => "two"
  }
  domElement(
    "div",
    {
      "className": "destination-grid columns-" ++ columnsName,
      "data-card-layout": layoutName,
      "data-columns": columnsName,
    },
    destinations
    ->Array.map(destination =>
      <KeyedCard key={destination.id} card destination search production />
    )
    ->React.array,
  )
}
