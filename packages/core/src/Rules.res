open DecisionTypes

@genType @tag("type")
type rec rule =
  | @as("all") All({rules: array<rule>})
  | @as("any") Any({rules: array<rule>})
  | @as("not") Not({rule: rule})
  | @as("eq") Eq({@live field: string, value: country})
  | @as("flag") Flag({name: string})
@genType
type ruleEffect = {id: string, owns: array<path>, @as("when") when_: rule, patch: decisionPatch}

let rec decodeRule = (value: unknown): rule => {
  let node = objectValue(value, "rule")
  switch displayValue(field(node, "type")) {
  | ("all" | "any") as kind =>
    let children =
      arrayValue(
        field(node, "rules"),
        "Invalid " ++ kind ++ " rule: expected rules array",
      )->Belt.Array.map(decodeRule)
    if kind == "all" {
      All({rules: children})
    } else {
      Any({rules: children})
    }
  | "not" => Not({rule: decodeRule(field(node, "rule"))})
  | "eq" =>
    let name = field(node, "field")
    if name != cast("visitor.country") {
      fail("Unknown rule field: " ++ displayValue(name))
    }
    let country = field(node, "value")
    if country != cast("IN") && country != cast("US") {
      fail("Invalid visitor.country rule value: " ++ displayValue(country))
    }
    Eq({field: "visitor.country", value: cast(country)})
  | "flag" =>
    let name = field(node, "name")
    if name != cast("seasonal-offers") && name != cast("planning-guide") {
      fail("Unknown rule flag: " ++ displayValue(name))
    }
    Flag({name: cast(name)})
  | _ => fail("Unknown rule node: " ++ displayValue(field(node, "type")))
  }
}
@genType let validateRule = (value: unknown): unit => decodeRule(value)->ignore
let decodeContext = (value: unknown): ruleContext => {
  let context = objectValue(value, "rule context")
  let visitor = objectValue(field(context, "visitor"), "visitor")
  let country = field(visitor, "country")
  if country != cast("IN") && country != cast("US") {
    fail("Invalid visitor.country: " ++ displayValue(country))
  }
  let flags = objectValue(field(context, "flags"), "flags")
  if Type.typeof(field(flags, "seasonal-offers")) != #boolean {
    fail("Invalid seasonal-offers flag: expected boolean")
  }
  if Type.typeof(field(flags, "planning-guide")) != #boolean {
    fail("Invalid planning-guide flag: expected boolean")
  }
  cast(value)
}
@genType let validateContext = (value: unknown): unit => decodeContext(value)->ignore
let rec evaluateValidatedRule = (rule, context: ruleContext) =>
  switch rule {
  | All({rules}) => Belt.Array.every(rules, child => evaluateValidatedRule(child, context))
  | Any({rules}) => Belt.Array.some(rules, child => evaluateValidatedRule(child, context))
  | Not({rule}) => !evaluateValidatedRule(rule, context)
  | Eq({value}) => context.visitor.country == value
  | Flag({name}) =>
    if name == "seasonal-offers" {
      context.flags.seasonalOffers
    } else {
      context.flags.planningGuide
    }
  }
@genType
let evaluateRule = (rule: unknown, context: unknown): bool => {
  let rule = decodeRule(rule)
  let context = decodeContext(context)
  evaluateValidatedRule(rule, context)
}
@genType
let ruleEffects: array<ruleEffect> = [
  {
    id: "india-seasonal-offers",
    owns: [OffersVisible],
    when_: All({
      rules: [Flag({name: "seasonal-offers"}), Eq({field: "visitor.country", value: #IN})],
    }),
    patch: {offersVisible: true},
  },
  {
    id: "planning-guide-flag",
    owns: [PlanningGuideVisible],
    when_: Flag({name: "planning-guide"}),
    patch: {planningGuideVisible: true},
  },
]
