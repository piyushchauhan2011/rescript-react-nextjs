@genType type page = [#home | #destinations]
@genType type variant = [#control | #treatment]
@genType type country = [#IN | #US]
@genType type heroLayout = [#immersive | #split]
@genType type searchLayout = [#overlay | #inline]
@genType type cardLayout = [#image | #compact]
@genType type columns = [#three | #two]
@genType type guideDetail = [#brief | #expanded]

@genType @unboxed
type path =
  | @as("hero.layout") HeroLayout
  | @as("search.layout") SearchLayout
  | @as("destinationCard.layout") DestinationCardLayout
  | @as("destinations.columns") DestinationsColumns
  | @as("offers.visible") OffersVisible
  | @as("planningGuide.visible") PlanningGuideVisible
  | @as("planningGuide.detail") PlanningGuideDetail

@genType
type decisionValues = {
  @as("hero.layout") mutable heroLayout: heroLayout,
  @as("search.layout") mutable searchLayout: searchLayout,
  @as("destinationCard.layout") mutable destinationCardLayout: cardLayout,
  @as("destinations.columns") mutable destinationsColumns: columns,
  @as("offers.visible") mutable offersVisible: bool,
  @as("planningGuide.visible") mutable planningGuideVisible: bool,
  @as("planningGuide.detail") mutable planningGuideDetail: guideDetail,
}
// Sparse fields are read through the validated string-keyed boundary codec.
@genType
type decisionPatch = {
  @live @as("hero.layout") heroLayout?: heroLayout,
  @live @as("search.layout") searchLayout?: searchLayout,
  @live @as("destinationCard.layout") destinationCardLayout?: cardLayout,
  @live @as("destinations.columns") destinationsColumns?: columns,
  @live @as("offers.visible") offersVisible?: bool,
  @live @as("planningGuide.visible") planningGuideVisible?: bool,
  @live @as("planningGuide.detail") planningGuideDetail?: guideDetail,
}
@genType @tag("source")
type provenance =
  | @as("default") Default({})
  | @as("rule") Rule({id: string})
  | @as("experiment") Experiment({id: string, variant: variant})

@genType
type decisionProvenance = {
  @as("hero.layout") mutable heroLayout: provenance,
  @as("search.layout") mutable searchLayout: provenance,
  @as("destinationCard.layout") mutable destinationCardLayout: provenance,
  @as("destinations.columns") mutable destinationsColumns: provenance,
  @as("offers.visible") mutable offersVisible: provenance,
  @as("planningGuide.visible") mutable planningGuideVisible: provenance,
  @as("planningGuide.detail") mutable planningGuideDetail: provenance,
}
@genType
type flags = {
  @as("seasonal-offers") seasonalOffers: bool,
  @as("planning-guide") planningGuide: bool,
}
@genType type visitor = {country: country}
@genType type ruleContext = {visitor: visitor, flags: flags}
@genType
type decisionResult = {
  values: decisionValues,
  provenance: decisionProvenance,
  assignments: dict<variant>,
}
@genType
type decisionSnapshot = {
  values: decisionValues,
  provenance: decisionProvenance,
  assignments: dict<variant>,
  ignored: dict<string>,
}

// Only boundary codecs use this identity cast, after runtime validation.
external cast: 'a => 'b = "%identity"
@val external displayValue: 'a => string = "String"
@val external own: (dict<'a>, string) => bool = "Object.hasOwn"
@val external nullDictionary: Nullable.t<unit> => dict<'a> = "Object.create"
let dictionary = () => nullDictionary(Nullable.null)
let getOwn = (dict, key) =>
  if own(dict, key) {
    Some(Dict.getUnsafe(dict, key))
  } else {
    None
  }
let fail = message => JsError.throwWithMessage(message)
let objectValue = (value: unknown, description) =>
  switch JSON.Decode.object(cast(value)) {
  | Some(dict) => (cast(dict): dict<unknown>)
  | None => fail("Invalid " ++ description ++ ": expected an object")
  }
let field = (dict, key): unknown => Dict.getUnsafe(dict, key)
let stringValue = (value: unknown, description) =>
  if Type.typeof(value) == #string {
    (cast(value): string)
  } else {
    fail(description)
  }
let arrayValue = (value: unknown, description) =>
  if Array.isArray(value) {
    (cast(value): array<unknown>)
  } else {
    fail(description)
  }

@genType
let paths = [
  HeroLayout,
  SearchLayout,
  DestinationCardLayout,
  DestinationsColumns,
  OffersVisible,
  PlanningGuideVisible,
  PlanningGuideDetail,
]
@genType let pathName = (path: path): string => cast(path)
let decodePath = value =>
  switch displayValue(value) {
  | "hero.layout" => HeroLayout
  | "search.layout" => SearchLayout
  | "destinationCard.layout" => DestinationCardLayout
  | "destinations.columns" => DestinationsColumns
  | "offers.visible" => OffersVisible
  | "planningGuide.visible" => PlanningGuideVisible
  | "planningGuide.detail" => PlanningGuideDetail
  | _ => fail("Unknown decision path " ++ displayValue(value))
  }
let onPage = (path, page) =>
  switch page {
  | #home => true
  | #destinations =>
    switch path {
    | DestinationCardLayout
    | DestinationsColumns
    | PlanningGuideVisible
    | PlanningGuideDetail => true
    | HeroLayout | SearchLayout | OffersVisible => false
    }
  }
let validatePage = (page: page) =>
  if page != #home && page != #destinations {
    fail("Unknown decision page: " ++ displayValue(page))
  }
let defaults = (): decisionValues => {
  heroLayout: #immersive,
  searchLayout: #overlay,
  destinationCardLayout: #image,
  destinationsColumns: #three,
  offersVisible: false,
  planningGuideVisible: false,
  planningGuideDetail: #brief,
}
@genType let decisionDefaults = defaults()
let defaultProvenance = (): decisionProvenance => {
  heroLayout: Default({}),
  searchLayout: Default({}),
  destinationCardLayout: Default({}),
  destinationsColumns: Default({}),
  offersVisible: Default({}),
  planningGuideVisible: Default({}),
  planningGuideDetail: Default({}),
}
let validPatchValue = (path, value: unknown) =>
  switch path {
  | HeroLayout => value == cast("immersive") || value == cast("split")
  | SearchLayout => value == cast("overlay") || value == cast("inline")
  | DestinationCardLayout => value == cast("image") || value == cast("compact")
  | DestinationsColumns => value == cast("three") || value == cast("two")
  | OffersVisible | PlanningGuideVisible => Type.typeof(value) == #boolean
  | PlanningGuideDetail => value == cast("brief") || value == cast("expanded")
  }
let decodePatch = (value: unknown, owner, owns): decisionPatch => {
  let dict = objectValue(value, "patch for " ++ owner)
  Dict.toArray(dict)->Belt.Array.forEach(((name, value)) => {
    let path = decodePath(cast(name))
    if !Belt.Array.some(owns, owned => owned == path) {
      fail(owner ++ " writes " ++ name ++ " without owning it")
    }
    if !validPatchValue(path, value) {
      fail("Invalid value for " ++ name ++ " in " ++ owner)
    }
  })
  cast(dict)
}
