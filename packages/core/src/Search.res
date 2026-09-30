open DecisionTypes
@genType type pageSearch = dict<string>
type params
@new external newParams: string => params = "URLSearchParams"
@send external each: (params, (string, string) => unit) => unit = "forEach"
@send external set: (params, string, string) => unit = "set"
@send external string: params => string = "toString"

let recognized = key =>
  key == "country" ||
  key == "offers" ||
  key == "guide" ||
  (String.startsWith(key, "exp.") &&
  own(Experiments.decisionRegistry.experimentById, String.slice(key, ~start=4)))

@genType
let validatePageSearch = (input: unknown, production: bool): pageSearch => {
  let result = dictionary()
  switch JSON.Decode.object(cast(input)) {
  | None => ()
  | Some(source) =>
    Dict.toArray(source)->Belt.Array.forEach(((key, value)) => {
      if (
        (key == "destination" || (!production && recognized(key))) && Type.typeof(value) == #string
      ) {
        Dict.set(result, key, (cast(value): string))
      }
    })
  }
  result
}
@genType
let inspectorSearch = (search: pageSearch, production: bool): pageSearch => {
  let result = validatePageSearch(cast(search), production)
  Dict.delete(result, "destination")
  result
}
@genType
let fromQuery = (query: string, production: bool): pageSearch => {
  let input = dictionary()
  let seen = dictionary()
  newParams(query)->each((value, key) => {
    if own(seen, key) {
      // Repeated parameters are arrays at the framework boundary, not scalar previews.
      Dict.delete(input, key)
    } else {
      Dict.set(input, key, value)
      Dict.set(seen, key, true)
    }
  })
  validatePageSearch(cast(input), production)
}
@genType
let toQuery = (search: pageSearch): string => {
  let params = newParams("")
  Dict.toArray(search)->Belt.Array.forEach(((key, value)) => params->set(key, value))
  string(params)
}
@genType
let updateSearch = (
  search: pageSearch,
  key: string,
  value: string,
  production: bool,
): pageSearch => {
  let result = validatePageSearch(cast(search), production)
  if value == "auto" {
    Dict.delete(result, key)
  } else if key == "destination" || (!production && recognized(key)) {
    Dict.set(result, key, value)
  }
  result
}
@genType
let withDestination = (
  search: pageSearch,
  destination: option<string>,
  production: bool,
): pageSearch => {
  let result = inspectorSearch(search, production)
  switch destination {
  | Some(value) => Dict.set(result, "destination", value)
  | None => ()
  }
  result
}
