/**
 * Google Places Autocomplete (Brasil + viés SP nas calculadoras).
 * Com loading=async, a biblioteca places deve ser carregada via importLibrary().
 */

import { API_KEYS } from "./apiConfig.js";
import {
  waitForGoogleMaps,
  importGoogleMapsLibrary,
} from "./googleMapsLoader.js";

let placesLibPromise = null;
let placesDetailsService = null;

async function getPlacesLibrary() {
  if (!placesLibPromise) {
    placesLibPromise = importGoogleMapsLibrary("places");
  }
  return placesLibPromise;
}

async function ensurePlacesDetailsService() {
  if (!placesDetailsService) {
    const { PlacesService } = await getPlacesLibrary();
    placesDetailsService = new PlacesService(document.createElement("div"));
  }
}

/**
 * Aguarda o script do Google Maps (index.html) e a biblioteca `places`.
 */
export async function waitForGooglePlaces(timeoutMs = 15000) {
  const lib = await getPlacesLibrary();
  if (!lib?.AutocompleteService) {
    throw new Error(
      "Google Places não carregou. Verifique VITE_GOOGLE_MAPS_KEY e se a Places API está ativa."
    );
  }
  await ensurePlacesDetailsService();
}

/** Bounds aproximados da Grande São Paulo (viés de autocomplete). */
export const SAO_PAULO_BOUNDS = {
  south: -23.82,
  west: -46.92,
  north: -23.35,
  east: -46.36,
};

/**
 * @param {string} query
 * @param {{ proximityLngLat?: [number, number] | null, bounds?: { south: number, west: number, north: number, east: number } | null }} [options]
 * @returns {Promise<Array<{ label: string, placeId: string, coords: null }>>}
 */
export async function fetchGooglePlacePredictions(query, options = {}) {
  if (!API_KEYS.googleMaps) return [];

  const bounds = options.bounds ?? null;

  await waitForGoogleMaps();
  const { AutocompleteService, PlacesServiceStatus } =
    await getPlacesLibrary();
  const autocomplete = new AutocompleteService();

  /** @type {google.maps.places.AutocompletionRequest} */
  const request = {
    input: query,
    componentRestrictions: { country: "br" },
    language: "pt-BR",
    types: ["geocode"],
  };

  if (bounds) {
    request.bounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(bounds.south, bounds.west),
      new window.google.maps.LatLng(bounds.north, bounds.east)
    );
  }

  return new Promise((resolve) => {
    autocomplete.getPlacePredictions(request, (predictions, status) => {
      if (
        status !== PlacesServiceStatus.OK ||
        !predictions?.length
      ) {
        resolve([]);
        return;
      }
      resolve(
        predictions.slice(0, 6).map((p) => ({
          label: p.description,
          placeId: p.place_id,
          coords: null,
        }))
      );
    });
  });
}

/**
 * @param {string} placeId
 * @returns {Promise<{ label: string, coords: [number, number] } | null>}
 */
export async function fetchGooglePlaceDetails(placeId) {
  if (!placeId || !API_KEYS.googleMaps) return null;

  const { PlacesServiceStatus } = await getPlacesLibrary();
  await ensurePlacesDetailsService();

  return new Promise((resolve) => {
    placesDetailsService.getDetails(
      { placeId, fields: ["geometry", "formatted_address"] },
      (place, status) => {
        if (
          status !== PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          resolve(null);
          return;
        }
        const loc = place.geometry.location;
        resolve({
          label: place.formatted_address || "",
          coords: [loc.lng(), loc.lat()],
        });
      }
    );
  });
}

/**
 * Resolve coordenadas de uma sugestão (Google place_id → lat/lng).
 * @param {{ label?: string, placeId?: string, coords?: number[] }} suggestion
 */
export async function resolvePlaceSuggestion(suggestion) {
  if (!suggestion) return suggestion;
  if (suggestion.coords?.length >= 2) return suggestion;
  if (!suggestion.placeId) return suggestion;

  const details = await fetchGooglePlaceDetails(suggestion.placeId);
  if (!details) return suggestion;

  return {
    ...suggestion,
    label: details.label || suggestion.label,
    coords: details.coords,
  };
}
