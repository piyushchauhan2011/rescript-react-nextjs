@genType
type destination = {
  id: string,
  slug: string,
  name: string,
  country: string,
  summary: string,
  image: string,
}

@genType
type hotel = {
  id: string,
  destinationId: string,
  // Retained by the catalog's generated SQL/TypeScript projection contract.
  @live slug: string,
  name: string,
  summary: string,
  rating: int,
  priceFrom: int,
  image: string,
}

@genType
type homeCatalog = {destinations: array<destination>, hotels: array<hotel>}
