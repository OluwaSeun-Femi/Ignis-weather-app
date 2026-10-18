import { useEffect, useState } from 'react'

// The geocoding API turns a city name into coordinates, which the forecast API needs.
const GEOCODE_URL =
  'https://geocoding-api.open-meteo.com/v1/search?name=Lagos&count=1'

// This describes the shape of the geocoding answer so TypeScript knows which fields exist.
type GeocodeResponse = {
  results?: { latitude: number; longitude: number }[]
}

// This describes the forecast answer: temperature_2m is the current temperature in °C.
type ForecastResponse = {
  current: { temperature_2m: number }
}

function App() {
  // temperature starts as null (not loaded yet) and becomes a number once the data arrives.
  const [temperature, setTemperature] = useState<number | null>(null)

  // error holds a short message if either request fails, so the page never goes blank.
  const [error, setError] = useState<string | null>(null)

  // useEffect with an empty [] runs this fetch once, right after the page first renders.
  useEffect(() => {
    async function loadTemperature() {
      try {
        // Step 1: fetch Lagos's coordinates from the geocoding API.
        const geoRes = await fetch(GEOCODE_URL)
        const geo: GeocodeResponse = await geoRes.json()

        // If the API returns no results, the city was not found, so we stop with a message.
        if (!geo.results || geo.results.length === 0) {
          setError('City not found')
          return
        }
        const { latitude, longitude } = geo.results[0]

        // Step 2: pass those coordinates to the forecast API and ask only for the current temperature.
        const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`
        const forecastRes = await fetch(forecastUrl)
        const forecast: ForecastResponse = await forecastRes.json()

        // Store the number in state, which makes React re-render and show it.
        setTemperature(forecast.current.temperature_2m)
      } catch {
        // Any network or parsing problem lands here instead of crashing the page.
        setError('Could not load the weather. Please try again.')
      }
    }
    loadTemperature()
  }, [])

  // The JSX shows an error, or "Loading…" until the number arrives, then the temperature.
  return (
    <main style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem' }}>
      <h1>Lagos weather</h1>
      {error ? (
        <p>{error}</p>
      ) : temperature === null ? (
        <p>Loading…</p>
      ) : (
        <p style={{ fontSize: '3rem', margin: 0 }}>{temperature}°C</p>
      )}
    </main>
  )
}

export default App
