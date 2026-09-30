@val external imul: (int, int) => int = "Math.imul"
@send external charCodeAt: (string, int) => int = "charCodeAt"
@get external length: string => int = "length"
let unsigned: int => float = %raw(`value => value >>> 0`)

/** FNV-1a hashes JavaScript UTF-16 code units, including surrogate pairs. */
@genType let fnv1a32 = (input: string): float => {
  let hash = ref(-2128831035)
  for index in 0 to length(input) - 1 {
    hash.contents = imul(Int.bitwiseXor(hash.contents, charCodeAt(input, index)), 16777619)
  }
  unsigned(hash.contents)
}
@genType
let bucketForExperiment = (visitorId: string, experimentId: string): int =>
  Int.fromFloat(fnv1a32(visitorId ++ ":" ++ experimentId) % 100.)
@genType
let bucketForSurface = (visitorId: string, surface: string): int =>
  Int.fromFloat(fnv1a32(visitorId ++ ":surface:" ++ surface) % 10000.)
@genType
let assignVariant = (visitorId: string, experimentId: string): DecisionTypes.variant =>
  if bucketForExperiment(visitorId, experimentId) < 50 {
    #control
  } else {
    #treatment
  }
