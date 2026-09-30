let href = (
  ~path: string,
  ~search: RegistryCore.Search.pageSearch,
  ~production: bool,
  ~destination: option<string>=None,
) => {
  let query =
    RegistryCore.Search.withDestination(
      search,
      destination,
      production,
    )->RegistryCore.Search.toQuery
  path ++ if query == "" {
    ""
  } else {
    "?" ++ query
  }
}
