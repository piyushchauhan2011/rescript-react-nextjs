type values = RegistryCore.DecisionTypes.decisionValues
let context: React.Context.t<option<values>> = React.createContext(None)

module Provider = {
  let make = React.Context.provider(context)
}

@react.component
let make = (~values: values, ~children) => <Provider value={Some(values)}> {children} </Provider>

let useDecision = (selector: values => 'a): 'a => {
  switch React.useContext(context) {
  | Some(values) => selector(values)
  | None => JsError.throwWithMessage("useDecision requires a DecisionProvider")
  }
}
