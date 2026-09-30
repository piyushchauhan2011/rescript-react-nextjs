open DecisionTypes
@genType type rollout = {disabledIds: array<string>, seasonalOffers: bool, planningGuide: bool}
@genType
type decisionRequest = {
  page: page,
  search: dict<string>,
  visitorId: string,
  production: bool,
  rollout: rollout,
}
@genType
let resolveDecisionRequest = (request: decisionRequest): decisionSnapshot => {
  let ignored = dictionary()
  let country = ref(#US)
  let offers = ref(request.rollout.seasonalOffers)
  let guide = ref(request.rollout.planningGuide)
  let overrides = dictionary()
  let getSearch = key =>
    switch getOwn(request.search, key) {
    | Some(value) if Type.typeof(value) == #undefined => None
    | value => value
    }
  if !request.production {
    switch getSearch("country") {
    | Some("IN") => country.contents = #IN
    | Some("US") => country.contents = #US
    | Some(value) => Dict.set(ignored, "country", value)
    | None => ()
    }
    ["offers", "guide"]->Belt.Array.forEach(key => {
      switch getSearch(key) {
      | Some(value) if value != "on" && value != "off" => Dict.set(ignored, key, value)
      | _ => ()
      }
    })
    offers.contents = getSearch("offers") == Some("on")
    guide.contents = getSearch("guide") == Some("on")
    Dict.toArray(request.search)->Belt.Array.forEach(((key, value)) => {
      if String.startsWith(key, "exp.") && Type.typeof(value) != #undefined {
        Dict.set(overrides, key, value)
      }
    })
  }
  let context: ruleContext = {
    visitor: {country: country.contents},
    flags: {seasonalOffers: offers.contents, planningGuide: guide.contents},
  }
  let allocation = Allocate.assignPageExperiments({
    page: request.page,
    visitorId: request.visitorId,
    context,
    disabledIds: request.rollout.disabledIds,
    overrides,
  })
  let resolved = Resolve.resolveDecisions({
    page: request.page,
    context,
    assignments: allocation.assignments,
    disabledIds: request.rollout.disabledIds,
  })
  Dict.toArray(allocation.ignored)->Belt.Array.forEach(((key, value)) =>
    Dict.set(ignored, key, value)
  )
  {
    values: resolved.values,
    provenance: resolved.provenance,
    assignments: resolved.assignments,
    ignored,
  }
}
