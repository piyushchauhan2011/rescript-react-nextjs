module Runtime = {
  @react.component
  let make = (
    ~page: RegistryCore.DecisionTypes.page,
    ~catalog: RegistryCore.Catalog.homeCatalog,
    ~snapshot: RegistryCore.DecisionTypes.decisionSnapshot,
    ~search: RegistryCore.Search.pageSearch,
    ~production: bool,
    ~children: React.element,
  ) =>
    <DecisionProvider values={snapshot.values}>
      <Shell search production>
        {switch page {
        | #home => <HomePage catalog search production />
        | #destinations =>
          <DestinationsPage destinations={catalog.destinations} search production />
        }}
      </Shell>
      {children}
    </DecisionProvider>
}

@genType @react.component
let make = (
  ~page: RegistryCore.DecisionTypes.page,
  ~catalog: RegistryCore.Catalog.homeCatalog,
  ~snapshot: RegistryCore.DecisionTypes.decisionSnapshot,
  ~search: RegistryCore.Search.pageSearch,
  ~production: bool,
  ~children: React.element=React.null,
) => {
  let pathname = NextBindings.usePathname()
  let pageName = switch page {
  | #home => "home"
  | #destinations => "destinations"
  }
  <Runtime key={pageName ++ ":" ++ pathname} page catalog snapshot search production children />
}
