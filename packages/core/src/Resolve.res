open DecisionTypes
@genType
type resolveInput = {
  page: page,
  context: ruleContext,
  assignments: dict<variant>,
  registry?: Experiments.registry,
  disabledIds?: array<string>,
}

@genType
let resolveDecisions = (input: resolveInput): decisionResult => {
  validatePage(input.page)
  let context = Rules.decodeContext(cast(input.context))
  let registry = Belt.Option.getWithDefault(input.registry, Experiments.decisionRegistry)
  let disabledIds = Belt.Option.getWithDefault(input.disabledIds, [])
  let rawAssignments = objectValue(cast(input.assignments), "experiment assignments")
  let selected = dictionary()
  let surfaces = dictionary()
  Dict.toArray(rawAssignments)->Belt.Array.forEach(((id, value)) => {
    let experiment = switch getOwn(registry.experimentById, id) {
    | Some(experiment) => experiment
    | None => fail("Unknown experiment ID: " ++ id)
    }
    if value != cast("control") && value != cast("treatment") {
      fail("Unknown variant for experiment " ++ id ++ ": " ++ displayValue(value))
    }
    if !Experiments.relevant(experiment, input.page) {
      fail("Experiment " ++ id ++ " is irrelevant to page " ++ displayValue(input.page))
    }
    if !Allocate.permitted(experiment, input.page, context, disabledIds) {
      fail("Experiment " ++ id ++ " is disabled or ineligible")
    }
    if own(surfaces, experiment.surface) {
      fail("Multiple assignments on surface " ++ experiment.surface)
    }
    Dict.set(surfaces, experiment.surface, true)
    Dict.set(selected, id, (cast(value): variant))
  })
  let values = defaults()
  let provenance = defaultProvenance()
  let writtenBy = dictionary()
  let apply = (patch: decisionPatch, owner, source) => {
    // Registry codecs have validated these wire keys and values already.
    let entries: array<(string, unknown)> = Dict.toArray(cast(patch))
    entries->Belt.Array.forEach(((name, value)) => {
      switch getOwn(writtenBy, name) {
      | Some(previous) =>
        fail("Decision write conflict on " ++ name ++ ": " ++ previous ++ " and " ++ owner)
      | None => ()
      }
      Dict.set(writtenBy, name, owner)
      switch decodePath(cast(name)) {
      | HeroLayout =>
        values.heroLayout = cast(value)
        provenance.heroLayout = source
      | SearchLayout =>
        values.searchLayout = cast(value)
        provenance.searchLayout = source
      | DestinationCardLayout =>
        values.destinationCardLayout = cast(value)
        provenance.destinationCardLayout = source
      | DestinationsColumns =>
        values.destinationsColumns = cast(value)
        provenance.destinationsColumns = source
      | OffersVisible =>
        values.offersVisible = cast(value)
        provenance.offersVisible = source
      | PlanningGuideVisible =>
        values.planningGuideVisible = cast(value)
        provenance.planningGuideVisible = source
      | PlanningGuideDetail =>
        values.planningGuideDetail = cast(value)
        provenance.planningGuideDetail = source
      }
    })
  }
  let assignments = dictionary()
  Experiments.on(registry.experimentsByPage, input.page)->Belt.Array.forEach(experiment => {
    switch getOwn(selected, experiment.id) {
    | None => ()
    | Some(variant) =>
      Dict.set(assignments, experiment.id, variant)
      let patch = switch variant {
      | #control => experiment.variants.control
      | #treatment => experiment.variants.treatment
      }
      apply(
        patch,
        "experiment " ++ experiment.id ++ "/" ++ displayValue(variant),
        Experiment({id: experiment.id, variant}),
      )
    }
  })
  Experiments.on(registry.rulesByPage, input.page)->Belt.Array.forEach(effect => {
    if Rules.evaluateValidatedRule(effect.when_, context) {
      apply(effect.patch, "rule " ++ effect.id, Rule({id: effect.id}))
    }
  })
  {values, provenance, assignments}
}
