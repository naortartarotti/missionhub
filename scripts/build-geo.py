"""Builds public/geo/* from the dr5hn countries-states-cities database (ODbL-1.0).

Usage: python3 -I scripts/build-geo.py <countries+states+cities.json> public/geo
Source: https://github.com/dr5hn/countries-states-cities-database (json/countries+states+cities.json)

Output:
  countries.json  [[iso2, englishName, hasStates], ...]  (display names are localized client-side)
  <ISO2>.json     [[regionCode, regionName, [city, ...]], ...]
Region codes are ISO 3166-2 subdivision codes without the country prefix (e.g. "ON"), matching the
values already stored in location_region; they fall back to the name when missing or ambiguous.
"""
import json, os, sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
data = json.load(open(src, encoding="utf-8"))
countries = []
for c in sorted(data, key=lambda c: c["name"]):
    iso = c["iso2"]
    states = c.get("states") or []
    with_cities = [s for s in states if s.get("cities")]
    # Where cities hang off sub-units (e.g. French departments), parent regions have none: skip them.
    keep = with_cities or states
    codes = [s.get("iso2") or "" for s in keep]
    rows = []
    for s in keep:
        code = s.get("iso2") or ""
        if not code or codes.count(code) > 1 or len(code) > 10:
            code = s["name"]
        cities = sorted({x["name"].strip() for x in s.get("cities") or [] if x["name"].strip()}, key=str.casefold)
        rows.append([code, s["name"].strip(), cities])
    rows.sort(key=lambda r: r[1].casefold())
    with open(os.path.join(out, f"{iso}.json"), "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    countries.append([iso, c["name"], bool(rows)])
with open(os.path.join(out, "countries.json"), "w", encoding="utf-8") as f:
    json.dump(countries, f, ensure_ascii=False, separators=(",", ":"))
print(len(countries), "countries")
