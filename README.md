# BusRouteWidget Web

Minimal web version of the bus route checker.

## UI

- fixed routes
- one duration value per route
- one update button per route
- one global `Update all` button

## API key behavior

The Google Routes API key is not committed into the public repo.

Instead:

- the site prompts for it on first load
- it stores the key only in the browser local storage

## Hosting

Hosted on GitHub Pages.

## Notes

- requests use Google Routes API `computeRoutes`
- transit preference is set to `BUS`
- walking is allowed
- non-bus transit segments are rejected
