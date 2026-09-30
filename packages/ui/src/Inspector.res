module Types = RegistryCore.DecisionTypes
module Search = RegistryCore.Search
module Experiments = RegistryCore.Experiments

@send external focus: Dom.element => unit = "focus"
@get external targetValue: {..} => string = "value"

let focusRef = (reference: React.ref<nullable<Dom.element>>) => {
  switch reference.current->Nullable.toOption {
  | Some(element) => element->focus
  | None => ()
  }
}

let selectedValue = (search: Search.pageSearch, key) => search->Dict.get(key)->Option.getOr("auto")

let variantText = (variant: Types.variant) =>
  switch variant {
  | #control => "control"
  | #treatment => "treatment"
  }

let provenanceText = (provenance: Types.provenance) =>
  switch provenance {
  | Default(_) => "default"
  | Rule({id}) => "rule: " ++ id
  | Experiment({id, variant}) => "experiment: " ++ id ++ " / " ++ variantText(variant)
  }

let invalidOption = (value, accepted) =>
  if value !== "" && !(accepted->Array.some(allowed => allowed === value)) {
    <option value> {React.string("Invalid: " ++ value)} </option>
  } else {
    React.null
  }

module VisitorControl = {
  @react.component
  let make = (~label, ~ariaLabel, ~field, ~search: Search.pageSearch, ~options, ~update) => {
    let value = selectedValue(search, field)
    <label>
      {React.string(label)}
      <select
        ariaLabel
        value
        onChange={event => update(field, event->ReactEvent.Form.target->targetValue)}
      >
        {options
        ->Array.map(((value, title)) => <option key=value value> {React.string(title)} </option>)
        ->React.array}
        {invalidOption(value, options->Array.map(((value, _)) => value))}
      </select>
    </label>
  }
}

module VisitorControls = {
  @react.component
  let make = (~search: Search.pageSearch, ~update) => {
    <details className="inspector-section inspector-context" open_=true>
      <summary> {React.string("Visitor and flags")} </summary>
      <div className="inspector-controls">
        <VisitorControl
          label="Country"
          ariaLabel="Visitor country"
          field="country"
          search
          options=[("auto", "Auto (US)"), ("US", "US"), ("IN", "IN")]
          update
        />
        <VisitorControl
          label="Seasonal offers flag"
          ariaLabel="Seasonal offers flag"
          field="offers"
          search
          options=[("auto", "Auto (off)"), ("off", "Off"), ("on", "On")]
          update
        />
        <VisitorControl
          label="Planning guide flag"
          ariaLabel="Planning guide flag"
          field="guide"
          search
          options=[("auto", "Auto (off)"), ("off", "Off"), ("on", "On")]
          update
        />
      </div>
    </details>
  }
}

module ExperimentControls = {
  @react.component
  let make = (
    ~result: Types.decisionSnapshot,
    ~search: Search.pageSearch,
    ~filter,
    ~setFilter,
    ~filterRef,
    ~update,
  ) => {
    let needle = filter->String.trim->String.toLowerCase
    let matching =
      Experiments.experiments->Array.filter(experiment =>
        experiment.id->String.toLowerCase->String.includes(needle)
      )
    <section className="inspector-section" ariaLabelledby="inspector-experiments">
      <h3 id="inspector-experiments">
        {React.string("Experiments ")}
        <span>
          {React.string(
            matching->Array.length->Int.toString ++
            " of " ++
            Experiments.experiments->Array.length->Int.toString,
          )}
        </span>
      </h3>
      <label className="inspector-filter">
        {React.string("Filter experiments")}
        <input
          ref={filterRef->ReactDOM.Ref.domRef}
          type_="search"
          value=filter
          onChange={event => setFilter(event->ReactEvent.Form.target->targetValue)}
          placeholder="Search by experiment ID"
        />
      </label>
      <div className="inspector-experiment-list">
        {matching
        ->Array.map(experiment => {
          let id = experiment.id
          let field = "exp." ++ id
          let value = selectedValue(search, field)
          let assignment = switch result.assignments->Dict.get(id) {
          | Some(variant) => "Assigned: " ++ variantText(variant)
          | None => "Not assigned on this page"
          }
          <label className="inspector-experiment" key=id>
            <span className="inspector-experiment-heading">
              <span> {React.string(id)} </span>
              <span className="inspector-assignment"> {React.string(assignment)} </span>
            </span>
            <select
              ariaLabel={id ++ " assignment"}
              value
              onChange={event => update(field, event->ReactEvent.Form.target->targetValue)}
            >
              <option value="auto"> {React.string("Auto")} </option>
              <option value="control"> {React.string("Control")} </option>
              <option value="treatment"> {React.string("Treatment")} </option>
              {invalidOption(value, ["auto", "control", "treatment"])}
            </select>
          </label>
        })
        ->React.array}
        {if matching->Array.length === 0 {
          <p role="status" className="inspector-empty">
            {React.string("No experiments match “" ++ filter ++ "”.")}
          </p>
        } else {
          React.null
        }}
      </div>
    </section>
  }
}

module ResolvedDecisions = {
  @react.component
  let make = (~result: Types.decisionSnapshot) => {
    let values = result.values
    let provenance = result.provenance
    let rows = [
      (
        "hero.layout",
        switch values.heroLayout {
        | #immersive => "immersive"
        | #split => "split"
        },
        provenance.heroLayout,
      ),
      (
        "search.layout",
        switch values.searchLayout {
        | #overlay => "overlay"
        | #inline => "inline"
        },
        provenance.searchLayout,
      ),
      (
        "destinationCard.layout",
        switch values.destinationCardLayout {
        | #image => "image"
        | #compact => "compact"
        },
        provenance.destinationCardLayout,
      ),
      (
        "destinations.columns",
        switch values.destinationsColumns {
        | #three => "three"
        | #two => "two"
        },
        provenance.destinationsColumns,
      ),
      ("offers.visible", values.offersVisible ? "true" : "false", provenance.offersVisible),
      (
        "planningGuide.visible",
        values.planningGuideVisible ? "true" : "false",
        provenance.planningGuideVisible,
      ),
      (
        "planningGuide.detail",
        switch values.planningGuideDetail {
        | #brief => "brief"
        | #expanded => "expanded"
        },
        provenance.planningGuideDetail,
      ),
    ]
    <details className="inspector-section inspector-decisions">
      <summary>
        {React.string("Resolved decisions (" ++ rows->Array.length->Int.toString ++ ")")}
      </summary>
      <dl className="decision-list">
        {rows
        ->Array.map(((path, value, provenance)) =>
          <div key=path>
            <dt> {React.string(path)} </dt>
            <dd>
              <strong> {React.string(value)} </strong>
              <span> {React.string(provenanceText(provenance))} </span>
            </dd>
          </div>
        )
        ->React.array}
      </dl>
    </details>
  }
}

@genType @react.component
let make = (~result: Types.decisionSnapshot, ~search: Search.pageSearch) => {
  let router = NextBindings.useRouter()
  let pathname = NextBindings.usePathname()
  let currentParams = NextBindings.useSearchParams()
  let (isOpen, setOpen) = React.useState(() => false)
  let (filter, setFilter) = React.useState(() => "")
  let launcherRef = React.useRef(Nullable.null)
  let filterRef = React.useRef(Nullable.null)
  let ignored = result.ignored->Dict.toArray
  let ignoredCount = ignored->Array.length

  React.useEffect1(() => {
    if isOpen {
      focusRef(filterRef)
    }
    None
  }, [isOpen])

  let close = () => {
    setOpen(_ => false)
    focusRef(launcherRef)
  }
  let update = (key, value) => {
    let previous = Search.fromQuery(currentParams->NextBindings.searchToString, false)
    let query = Search.updateSearch(previous, key, value, false)->Search.toQuery
    router.push(pathname ++ (query === "" ? "" : "?" ++ query))
  }

  <div className="inspector-dock">
    <button
      ref={launcherRef->ReactDOM.Ref.domRef}
      type_="button"
      className="inspector-launcher"
      ariaExpanded=isOpen
      ariaControls="decision-inspector-panel"
      onClick={_ => isOpen ? close() : setOpen(_ => true)}
    >
      {React.string("Decision inspector")}
      {if ignoredCount > 0 {
        <span className="inspector-alert">
          {React.string(ignoredCount->Int.toString ++ " ignored")}
        </span>
      } else {
        React.null
      }}
    </button>
    <aside
      id="decision-inspector-panel"
      className="inspector-panel"
      ariaLabel="Decision inspector"
      hidden={!isOpen}
      onKeyDown={event => {
        if event->ReactEvent.Keyboard.key === "Escape" {
          close()
        }
      }}
    >
      <div className="inspector-header">
        <div>
          <h2> {React.string("Decision inspector")} </h2>
          <span> {React.string("Local experiment controls")} </span>
        </div>
        <button
          type_="button"
          className="inspector-close"
          ariaLabel="Close decision inspector"
          onClick={_ => close()}
        >
          {React.string("Close")}
        </button>
      </div>
      <div className="inspector-body">
        <ExperimentControls
          result search filter setFilter={value => setFilter(_ => value)} filterRef update
        />
        <VisitorControls search update />
        {if ignoredCount > 0 {
          <p role="status" className="ignored">
            {React.string(
              "Ignored overrides: " ++
              ignored->Array.map(((key, value)) => key ++ "=" ++ value)->Array.join(", "),
            )}
          </p>
        } else {
          React.null
        }}
        <ResolvedDecisions result />
        <p className="inspector-note">
          {React.string(
            "Assignments use an anonymous cookie when accepted. This demo does not track exposure or metrics.",
          )}
        </p>
      </div>
    </aside>
  </div>
}
