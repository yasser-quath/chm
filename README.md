# BusRouteWidget Web

BusRouteWidget Web is a static website version of the bus route checker.

It is designed to work with:

- GitHub Pages for free hosting
- Safari on iPhone
- Add to Home Screen on iPhone
- Google Routes API as the live data source

## What it does

- saves favorite routes in browser local storage
- stores your Google API key only in your browser local storage
- fetches routes from Google Routes API `computeRoutes`
- requests transit routing with bus-only preference
- accepts walking segments
- rejects non-bus transit segments after validating returned route steps
- supports manual refresh and auto-refresh while the page is open
- opens the route in Google Maps with a transit directions URL

## Important limitation

GitHub Pages is static hosting, so this is not server-side real-time.

In this project, "real time" means:

- the page fetches the latest Google route data live from the browser
- auto-refresh works while the page is open
- when installed on the iPhone home screen, it behaves like a lightweight web app

## Google API setup

1. Create or choose a Google Cloud project.
2. Enable billing.
3. Enable `Routes API`.
4. Create an API key.
5. Restrict the key to your GitHub Pages domain if possible.

## Official Google docs

- [Routes API](https://developers.google.com/maps/documentation/routes)
- [Compute Routes](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes)
- [Transit Preferences](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TransitPreferences)
- [Maps URLs](https://developers.google.com/maps/documentation/urls/guide)
