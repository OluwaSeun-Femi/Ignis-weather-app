import { useState } from 'react'

// This describes the shape of the geocoding answer so TypeScript knows which fields exist.
type GeocodeResponse = {
  results?: { name: string; country: string; latitude: number; longitude: number }[]
}

// This describes the forecast answer: temperature_2m is the current temperature in °C.
type ForecastResponse = {
  current: { temperature_2m: number }
}

// Everything we know about a looked-up city, kept together in one object.
type Weather = {
  city: string
  country: string
  temperature: number
}

function App() {
  // query is whatever the user has typed into the search box so far.
  const [query, setQuery] = useState('')

  // weather is null until a lookup succeeds, then holds the city and its temperature.
  const [weather, setWeather] = useState<Weather | null>(null)

  // loading is true while the two requests are running so the page can say "Loading…".
  const [loading, setLoading] = useState(false)

  // error holds a short message if either request fails, so the page never goes blank.
  const [error, setError] = useState<string | null>(null)

  // lookUp turns a city name into coordinates, then coordinates into the current temperature.
  async function lookUp(city: string) {
    setLoading(true)
    setError(null)
    try {
      // Step 1: the geocoding API turns the typed city into latitude and longitude.
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      )
      const geo: GeocodeResponse = await geoRes.json()

      // If the API returns no results, the city was not found, so we stop with a message.
      if (!geo.results || geo.results.length === 0) {
        setWeather(null)
        setError('City not found')
        return
      }
      const { name, country, latitude, longitude } = geo.results[0]

      // Step 2: the forecast API takes those coordinates and returns the temperature now.
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`,
      )
      const forecast: ForecastResponse = await forecastRes.json()

      // Storing the result in state makes React re-render and show it.
      setWeather({ city: name, country, temperature: forecast.current.temperature_2m })
    } catch {
      // Any network or parsing problem lands here instead of crashing the page.
      setError('Could not load the weather. Please try again.')
    } finally {
      // Whether it worked or not, the requests are finished, so stop saying "Loading…".
      setLoading(false)
    }
  }

  // handleSubmit runs when the user presses Search or hits Enter, and looks up the typed city.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault() // stop the browser from reloading the page
    const city = query.trim()
    if (city) lookUp(city)
  }

  // The JSX shows the search box, then an error, "Loading…", or the city and its temperature.
  return (
    <main style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '2rem' }}>
      <h1>Weather</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a city"
          aria-label="City"
        />
        <button type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {error && <p>{error}</p>}
      {loading && <p>Loading…</p>}
      {weather && !loading && (
        <>
          <h2>
            {weather.city}, {weather.country}
          </h2>
          <p style={{ fontSize: '3rem', margin: 0 }}>{weather.temperature}°C</p>
        </>
      )}
    </main>
  )
}

export default App
