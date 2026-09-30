open DecisionTypes

@genType type variants = {control: decisionPatch, treatment: decisionPatch}
@genType
type experiment = {
  id: string,
  surface: string,
  enabled: bool,
  allocation: (int, int),
  eligibleWhen?: Rules.rule,
  owns: array<path>,
  variants: variants,
}
@genType type pageIndex<'a> = {home: array<'a>, destinations: array<'a>}
@genType
type registry = {
  // Original catalogs remain part of the generated TypeScript registry API.
  @live experiments: array<experiment>,
  @live ruleEffects: array<Rules.ruleEffect>,
  experimentsByPage: pageIndex<experiment>,
  rulesByPage: pageIndex<Rules.ruleEffect>,
  surfacesByPage: pageIndex<string>,
  experimentById: dict<experiment>,
  allocationsBySurface: dict<array<experiment>>,
}
type claim = {owner: string, surface: option<string>}
@val external integer: unknown => bool = "Number.isInteger"
@send
external sortTable: (array<experiment>, (experiment, experiment) => int) => array<experiment> =
  "sort"
let on = (index, page) =>
  switch page {
  | #home => index.home
  | #destinations => index.destinations
  }
let relevant = (experiment: experiment, page) =>
  Belt.Array.some(experiment.owns, path => onPage(path, page))

@genType
let createDecisionRegistry = (
  registeredExperiments: unknown,
  registeredEffects: unknown,
): registry => {
  let rawExperiments = arrayValue(registeredExperiments, "Invalid experiments: expected an array")
  let rawEffects = arrayValue(registeredEffects, "Invalid rule effects: expected an array")
  let claims: dict<claim> = dictionary()
  let ids = dictionary()
  let registerOwner = (node, kind, surface) => {
    let rawId = field(node, "id")
    let rawOwns = field(node, "owns")
    if Type.typeof(rawId) != #string || String.trim(cast(rawId)) == "" || !Array.isArray(rawOwns) {
      fail("Invalid " ++ kind ++ " registration: id and nonempty owns are required")
    }
    let id: string = cast(rawId)
    let rawOwns: array<unknown> = cast(rawOwns)
    if Belt.Array.length(rawOwns) == 0 {
      fail("Invalid " ++ kind ++ " registration: id and nonempty owns are required")
    }
    if own(ids, id) {
      fail("Duplicate registration ID: " ++ id)
    }
    Dict.set(ids, id, true)
    let owner = kind ++ " " ++ id
    let local = dictionary()
    let owns = rawOwns->Belt.Array.map(value => {
      let path = decodePath(value)
      let name = pathName(path)
      let previous = getOwn(claims, name)
      let conflict = switch previous {
      | Some(previous) => surface == None || previous.surface != surface
      | None => false
      }
      if own(local, name) || conflict {
        let previousOwner = switch previous {
        | Some(p) => p.owner
        | None => owner
        }
        fail("Ownership conflict on " ++ name ++ ": " ++ previousOwner ++ " and " ++ owner)
      }
      Dict.set(local, name, true)
      path
    })
    owns->Belt.Array.forEach(path => Dict.set(claims, pathName(path), {owner, surface}))
    (id, owns)
  }
  let experimentById = dictionary()
  let allocationsBySurface = dictionary()
  let experiments = rawExperiments->Belt.Array.map(value => {
    let node = objectValue(value, "experiment registration")
    let rawSurface = field(node, "surface")
    let surfaceOption = if Type.typeof(rawSurface) == #string {
      Some((cast(rawSurface): string))
    } else {
      None
    }
    let (id, owns) = registerOwner(node, "experiment", surfaceOption)
    let surface = stringValue(rawSurface, "Invalid surface for experiment " ++ id)
    if String.trim(surface) == "" {
      fail("Invalid surface for experiment " ++ id)
    }
    let enabled = field(node, "enabled")
    if Type.typeof(enabled) != #boolean {
      fail("Invalid enabled for experiment " ++ id)
    }
    let range = arrayValue(field(node, "allocation"), "Invalid allocation for experiment " ++ id)
    if Belt.Array.length(range) != 2 || !Belt.Array.every(range, integer) {
      fail("Invalid allocation for experiment " ++ id)
    }
    let start: int = cast(range[0])
    let end: int = cast(range[1])
    if start < 0 || end > 10000 || start > end || (start == end && start != 0) {
      fail("Invalid allocation for experiment " ++ id)
    }
    let eligibleWhen = switch getOwn(node, "eligibleWhen") {
    | Some(value) if Type.typeof(value) != #undefined => Some(Rules.decodeRule(value))
    | _ => None
    }
    let variants = objectValue(field(node, "variants"), "variants for experiment " ++ id)
    let control = decodePatch(field(variants, "control"), "experiment " ++ id ++ "/control", owns)
    let treatment = decodePatch(
      field(variants, "treatment"),
      "experiment " ++ id ++ "/treatment",
      owns,
    )
    let experiment: experiment = {
      id,
      surface,
      enabled: cast(enabled),
      allocation: (start, end),
      ?eligibleWhen,
      owns,
      variants: {control, treatment},
    }
    Dict.set(experimentById, id, experiment)
    let table = switch getOwn(allocationsBySurface, surface) {
    | Some(table) => table
    | None =>
      let table = []
      Dict.set(allocationsBySurface, surface, table)
      table
    }
    Array.push(table, experiment)
    experiment
  })
  let ruleEffects = rawEffects->Belt.Array.map(value => {
    let node = objectValue(value, "rule registration")
    let (id, owns) = registerOwner(node, "rule", None)
    let when_ = Rules.decodeRule(field(node, "when"))
    let patch = decodePatch(field(node, "patch"), "rule " ++ id, owns)
    ({id, owns, when_, patch}: Rules.ruleEffect)
  })
  Dict.toArray(allocationsBySurface)->Belt.Array.forEach(((surface, table)) => {
    sortTable(table, (a, b) => {
      let (aStart, aEnd) = a.allocation
      let (bStart, bEnd) = b.allocation
      if aStart != bStart {
        aStart - bStart
      } else {
        aEnd - bEnd
      }
    })->ignore
    let end = ref(0)
    table->Belt.Array.forEach(experiment => {
      let (start, nextEnd) = experiment.allocation
      if start != nextEnd {
        if start < end.contents {
          fail("Overlapping allocation on surface " ++ surface ++ ": " ++ experiment.id)
        }
        end.contents = nextEnd
      }
    })
  })
  // Build page indexes only after validating and sorting the complete global surface tables.
  let experimentsByPage = {
    home: Belt.Array.keep(experiments, experiment => relevant(experiment, #home)),
    destinations: Belt.Array.keep(experiments, experiment => relevant(experiment, #destinations)),
  }
  let rulesByPage = {
    home: Belt.Array.keep(ruleEffects, effect =>
      Belt.Array.some(effect.owns, path => onPage(path, #home))
    ),
    destinations: Belt.Array.keep(ruleEffects, effect =>
      Belt.Array.some(effect.owns, path => onPage(path, #destinations))
    ),
  }
  let surfaces = (experiments: array<experiment>) => {
    let seen = dictionary()
    experiments->Belt.Array.keepMap(experiment => {
      if own(seen, experiment.surface) {
        None
      } else {
        Dict.set(seen, experiment.surface, true)
        Some(experiment.surface)
      }
    })
  }
  {
    experiments,
    ruleEffects,
    experimentsByPage,
    rulesByPage,
    surfacesByPage: {
      home: surfaces(experimentsByPage.home),
      destinations: surfaces(experimentsByPage.destinations),
    },
    experimentById,
    allocationsBySurface,
  }
}
@genType
let experiments: array<experiment> = [
  {
    id: "arrival-flow",
    surface: "arrival-flow",
    enabled: true,
    allocation: (0, 10000),
    owns: [HeroLayout, SearchLayout, DestinationCardLayout],
    variants: {
      control: {},
      treatment: {heroLayout: #split, searchLayout: #inline, destinationCardLayout: #compact},
    },
  },
  {
    id: "destination-density",
    surface: "destination-density",
    enabled: true,
    allocation: (0, 10000),
    owns: [DestinationsColumns],
    variants: {control: {}, treatment: {destinationsColumns: #two}},
  },
  {
    id: "planning-guide-detail",
    surface: "planning-guide-detail",
    enabled: true,
    allocation: (0, 10000),
    owns: [PlanningGuideDetail],
    variants: {control: {}, treatment: {planningGuideDetail: #expanded}},
  },
]
@genType let decisionRegistry = createDecisionRegistry(cast(experiments), cast(Rules.ruleEffects))
