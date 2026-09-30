@genType @react.component
let make = () =>
  <Shell search={Dict.make()} production=true>
    <main className="container not-found">
      <h1> {React.string("Page not found")} </h1>
      <NextBindings.Link href="/"> {React.string("Return home")} </NextBindings.Link>
    </main>
  </Shell>
