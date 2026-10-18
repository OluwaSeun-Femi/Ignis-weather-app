import { useState } from 'react'
import './App.css'

// This describes the shape of the geocoding answer so TypeScript knows which fields exist.
type GeocodeResponse = {
  results?: { name: string; country: string; latitude: number; longitude: number }[]
}

// This describes the forecast answer: the "current" block holds the weather right now.
type ForecastResponse = {
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
    is_day: number
  }
}

// Everything we know about a looked-up city, kept together in one object.
type Weather = {
  city: string
  country: string
  time: string
  temperature: number
  feelsLike: number
  humidity: number
  wind: number
  code: number
  isDay: boolean
}

// Open-Meteo returns the sky as a WMO code number; this turns it into words and an icon.
function describe(code: number, isDay: boolean): { text: string; icon: string } {
  if (code === 0) return { text: 'clear sky', icon: isDay ? '☀️' : '🌙' }
  if (code <= 2) return { text: 'partly cloudy', icon: isDay ? '⛅' : '☁️' }
  if (code === 3) return { text: 'overcast', icon: '☁️' }
  if (code <= 48) return { text: 'foggy', icon: '🌫️' }
  if (code <= 57) return { text: 'drizzle', icon: '🌦️' }
  if (code <= 67) return { text: 'rain', icon: '🌧️' }
  if (code <= 77) return { text: 'snow', icon: '🌨️' }
  if (code <= 82) return { text: 'rain showers', icon: '🌧️' }
  if (code <= 86) return { text: 'snow showers', icon: '🌨️' }
  return { text: 'thunderstorm', icon: '⛈️' }
}

function App() {
  // query is whatever the user has typed into the search box so far.
  const [query, setQuery] = useState('')

  // weather is null until a lookup succeeds, then holds the city and its current conditions.
  const [weather, setWeather] = useState<Weather | null>(null)

  // loading is true while the two requests are running so the page can say "Loading…".
  const [loading, setLoading] = useState(false)

  // error holds a short message if either request fails, so the page never goes blank.
  const [error, setError] = useState<string | null>(null)

  // lookUp turns a city name into coordinates, then coordinates into the current weather.
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

      // Step 2: the forecast API takes those coordinates and returns the conditions right now.
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&timezone=auto`,
      )
      const forecast: ForecastResponse = await forecastRes.json()
      const c = forecast.current

      // Storing the result in state makes React re-render and show it.
      setWeather({
        city: name,
        country,
        time: c.time,
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        wind: c.wind_speed_10m,
        code: c.weather_code,
        isDay: c.is_day === 1,
      })
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

  // sky is the icon and description for the current weather code (only when we have weather).
  const sky = weather ? describe(weather.code, weather.isDay) : null

  // The JSX shows the search box, then an error, "Loading…", or the current weather card.
  return (
    <main className="app">
      <h1>Weather</h1>
      <p className="tagline">Type a city to see the weather right now.</p>

      <form className="search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Lagos"
          aria-label="City"
        />
        <button type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {error && <p className="status error">{error}</p>}
      {loading && <p className="status">Loading…</p>}
      {!weather && !loading && !error && (
        <p className="status">No city searched yet.</p>
      )}

      {weather && sky && !loading && (
        <section className="current">
          <h2>
            {weather.city}, {weather.country}
          </h2>
          {/* The API's time is already in the city's own time zone (timezone=auto). */}
          <p className="time">Local time {weather.time.slice(11, 16)}</p>
          <div className="icon" aria-hidden="true">
            {sky.icon}
          </div>
          <p className="temp">{Math.round(weather.temperature)}°</p>
          <p className="desc">{sky.text}</p>

          <dl className="details">
            <div>
              <dt>Feels like</dt>
              <dd>{Math.round(weather.feelsLike)}°C</dd>
            </div>
            <div>
              <dt>Humidity</dt>
              <dd>{weather.humidity}%</dd>
            </div>
            <div>
              <dt>Wind</dt>
              <dd>{Math.round(weather.wind)} km/h</dd>
            </div>
          </dl>
        </section>
      )}
    </main>
  )
}

export default App
