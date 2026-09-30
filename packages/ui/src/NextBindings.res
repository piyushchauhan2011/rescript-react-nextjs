type router = {push: string => unit}
type searchParams

@module("next/navigation")
external usePathname: unit => string = "usePathname"
@module("next/navigation")
external useRouter: unit => router = "useRouter"
@module("next/navigation")
external useSearchParams: unit => searchParams = "useSearchParams"
@send external searchToString: searchParams => string = "toString"

module Link = {
  type linkProps = {
    // Next consumes these props outside ReScript's analyzed call graph.
    @live href: string,
    @live className?: string,
    @live @as("aria-label") ariaLabel?: string,
    @live children: React.element,
  }
  @module("next/link")
  external component: React.component<linkProps> = "default"

  @react.component
  let make = (~href: string, ~className: string=?, ~ariaLabel: string=?, ~children) =>
    React.createElement(component, {href, ?className, ?ariaLabel, children})
}
