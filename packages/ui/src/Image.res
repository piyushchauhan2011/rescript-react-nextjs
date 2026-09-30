type width = W480 | W800 | W1280

let pattern = RegExp.fromString("^/images/([a-z0-9-]+\\.webp)$")
let imageUrl = (source: string, width: width): string => {
  switch RegExp.exec(pattern, source) {
  | None => JsError.throwWithMessage("Unsupported catalog image: " ++ source)
  | Some(matches) =>
    let filename = matches->Array.get(1)->Option.flatMap(value => value)
    switch filename {
    | None => JsError.throwWithMessage("Unsupported catalog image: " ++ source)
    | Some(filename) =>
      let size = switch width {
      | W480 => "480"
      | W800 => "800"
      | W1280 => "1280"
      }
      "/image/" ++ size ++ "/" ++ filename
    }
  }
}

let srcSet = source =>
  imageUrl(source, W480) ++
  " 480w, " ++
  imageUrl(source, W800) ++
  " 800w, " ++
  imageUrl(source, W1280) ++ " 1280w"

module Tag = {
  @module("react")
  external create: (string, 'props) => React.element = "createElement"

  @react.component
  let make = (
    ~src: string,
    ~srcSet: string,
    ~sizes: string,
    ~width: string,
    ~height: string,
    ~alt: string="",
    ~loading: string="lazy",
    ~decoding: string="async",
    ~fetchPriority: string=?,
  ) =>
    create(
      "img",
      {
        "src": src,
        "srcSet": srcSet,
        "sizes": sizes,
        "width": width,
        "height": height,
        "alt": alt,
        "loading": loading,
        "decoding": decoding,
        "fetchPriority": fetchPriority,
      },
    )
}

module HeroPreload = {
  @react.component
  let make = () => <>
    {Tag.create(
      "link",
      {
        "rel": "preload",
        "as": "image",
        "href": "/image/1280/hero-1280.webp",
        "media": "(min-width: 651px)",
        "fetchPriority": "high",
      },
    )}
    {Tag.create(
      "link",
      {
        "rel": "preload",
        "as": "image",
        "href": "/image/800/hero-1280.webp",
        "media": "(max-width: 650px)",
        "fetchPriority": "high",
      },
    )}
  </>
}
