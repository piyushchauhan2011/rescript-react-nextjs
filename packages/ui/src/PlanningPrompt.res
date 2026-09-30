@react.component
let make = (~brief: string, ~expanded: string) => {
  let visible = DecisionProvider.useDecision(values => values.planningGuideVisible)
  let detail = DecisionProvider.useDecision(values => values.planningGuideDetail)
  if !visible {
    React.null
  } else {
    let detailName = switch detail {
    | #brief => "brief"
    | #expanded => "expanded"
    }
    <span className={"planning-prompt planning-prompt-" ++ detailName}>
      <span className="planning-prompt-label"> {React.string("PLAN AHEAD")} </span>
      {React.string(" ")}
      {React.string(
        switch detail {
        | #brief => brief
        | #expanded => expanded
        },
      )}
    </span>
  }
}
