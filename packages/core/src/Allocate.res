open DecisionTypes
@genType
type allocateInput = {
  visitorId: string,
  context: ruleContext,
  page: page,
  overrides?: dict<string>,
  disabledIds?: array<string>,
  registry?: Experiments.registry,
}
@genType type allocation = {assignments: dict<variant>, ignored: dict<string>}

let findSlot = (table: array<Experiments.experiment>, bucket) => {
  let low = ref(0)
  let high = ref(Belt.Array.length(table))
  while low.contents < high.contents {
    let middle = (low.contents + high.contents) / 2
    let (start, _) = Belt.Array.getUnsafe(table, middle).allocation
    if start <= bucket {
      low.contents = middle + 1
    } else {
      high.contents = middle
    }
  }
  if low.contents == 0 {
    None
  } else {
    let candidate = Belt.Array.getUnsafe(table, low.contents - 1)
    let (_, end) = candidate.allocation
    if bucket < end {
      Some(candidate)
    } else {
      None
    }
  }
}
let permitted = (experiment: Experiments.experiment, page, context, disabledIds) =>
  Experiments.relevant(experiment, page) &&
  experiment.enabled &&
  !Belt.Array.some(disabledIds, id => id == experiment.id) &&
  switch experiment.eligibleWhen {
  | None => true
  | Some(rule) => Rules.evaluateValidatedRule(rule, context)
  }

@genType
let assignPageExperiments = (input: allocateInput): allocation => {
  validatePage(input.page)
  if Type.typeof(input.visitorId) != #string || String.trim(input.visitorId) == "" {
    fail("Invalid visitor ID")
  }
  let context = Rules.decodeContext(cast(input.context))
  let registry = Belt.Option.getWithDefault(input.registry, Experiments.decisionRegistry)
  let disabledIds = Belt.Option.getWithDefault(input.disabledIds, [])
  let assignments = dictionary()
  let ignored = dictionary()
  let forced: dict<Experiments.experiment> = dictionary()
  let overrides = switch input.overrides {
  | None => dictionary()
  | Some(overrides) => cast(objectValue(cast(overrides), "experiment overrides"))
  }
  Dict.toArray(overrides)->Belt.Array.forEach(((key, value)) => {
    let id = String.slice(key, ~start=4)
    if !String.startsWith(key, "exp.") || !own(registry.experimentById, id) {
      fail("Unknown experiment override: " ++ key)
    }
    if value != "auto" && value != "control" && value != "treatment" {
      Dict.set(ignored, key, displayValue(value))
    } else if value != "auto" {
      let experiment = Dict.getUnsafe(registry.experimentById, id)
      if !permitted(experiment, input.page, context, disabledIds) {
        Dict.set(ignored, key, value)
      } else {
        switch getOwn(forced, experiment.surface) {
        | Some(winner) if winner.id <= experiment.id => ()
        | _ => Dict.set(forced, experiment.surface, experiment)
        }
      }
    }
  })
  Dict.toArray(overrides)->Belt.Array.forEach(((key, value)) => {
    if value == "control" || value == "treatment" {
      let experiment = Dict.getUnsafe(registry.experimentById, String.slice(key, ~start=4))
      switch getOwn(forced, experiment.surface) {
      | Some(winner)
        if winner.id != experiment.id && permitted(experiment, input.page, context, disabledIds) =>
        Dict.set(ignored, key, value ++ " (surface already forced by " ++ winner.id ++ ")")
      | _ => ()
      }
    }
  })
  Experiments.on(registry.surfacesByPage, input.page)->Belt.Array.forEach(surface => {
    let selected = switch getOwn(forced, surface) {
    | Some(experiment) => Some(experiment)
    | None =>
      findSlot(
        Dict.getUnsafe(registry.allocationsBySurface, surface),
        Bucketing.bucketForSurface(input.visitorId, surface),
      )
    }
    switch selected {
    | Some(experiment) if permitted(experiment, input.page, context, disabledIds) =>
      let variant = switch getOwn(overrides, "exp." ++ experiment.id) {
      | Some("control") => #control
      | Some("treatment") => #treatment
      | _ => Bucketing.assignVariant(input.visitorId, experiment.id)
      }
      Dict.set(assignments, experiment.id, variant)
    | _ => ()
    }
  })
  {assignments, ignored}
}
