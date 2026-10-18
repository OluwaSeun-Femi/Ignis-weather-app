import { useState } from 'react'
import './App.css'

// This describes the shape of the geocoding answer so TypeScript knows which fields exist.
type GeocodeResponse = {
  results?: { name: string; country: string; latitude: number; longitude: number }[]
}

// This describes the forecast answer: "current" is the weather right now, "daily" is one list per day.
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
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
  }
}

// One day of the forecast: its date plus the highest and lowest temperature expected.
type Day = {
  date: string
  max: number
  min: number
  code: number
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
  days: Day[]
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

// dayName turns a date like "2026-10-19" into a short weekday such as "Mon".
function dayName(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
}

// Popular quick-pick cities that allow one-tap searching on mobile.
const POPULAR_CITIES = ['Lagos', 'London', 'Tokyo', 'New York', 'Paris']

function App() {
  // query is whatever the user has typed into the search box so far.
  const [query, setQuery] = useState('')

  // weather is null until a lookup succeeds, then holds the city and its current conditions.
  const [weather, setWeather] = useState<Weather | null>(null)

  // loading is true while the two requests are running so the page can say "Loading…".
  const [loading, setLoading] = useState(false)

  // error holds a short message if either request fails, so the page never goes blank.
  const [error, setError] = useState<string | null>(null)

  // notFoundCity holds the query when a city cannot be found, showing a friendly notice instead of an error.
  const [notFoundCity, setNotFoundCity] = useState<string | null>(null)

  // lookUp turns a city name into coordinates, then coordinates into the current weather.
  async function lookUp(city: string) {
    setLoading(true)
    setError(null)
    setNotFoundCity(null)
    try {
      // Step 1: the geocoding API turns the typed city into latitude and longitude.
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
      )
      const geo: GeocodeResponse = await geoRes.json()

      // If the API returns no results, the city doesn't exist or is misspelled, so show a friendly message.
      if (!geo.results || geo.results.length === 0) {
        setWeather(null)
        setNotFoundCity(city)
        return
      }
      const { name, country, latitude, longitude } = geo.results[0]

      // Step 2: the forecast API takes those coordinates and returns the conditions right now.
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`,
      )
      const forecast: ForecastResponse = await forecastRes.json()
      const c = forecast.current
      const d = forecast.daily

      // The daily lists are index-aligned (item 2 of each is the same day), so we zip them into
      // Day objects and skip index 0, which is today, to keep only the next 3 days.
      const days: Day[] = d.time.slice(1).map((date, i) => ({
        date,
        max: d.temperature_2m_max[i + 1],
        min: d.temperature_2m_min[i + 1],
        code: d.weather_code[i + 1],
      }))

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
        days,
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

  // Quick-search handler for popular city chips (great for mobile one-thumb interaction).
  function handleQuickSearch(cityName: string) {
    setQuery(cityName)
    lookUp(cityName)
  }

  // sky is the icon and description for the current weather code (only when we have weather).
  const sky = weather ? describe(weather.code, weather.isDay) : null

  // The JSX shows the search box, then an error, "Loading…", or the current weather card.
  return (
    <main className="app">
      <h1>Weather</h1>
      <p className="tagline">Type a city to see the weather right now.</p>

      <form className="search" onSubmit={handleSubmit} role="search">
        <div className="search-input-wrap">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Lagos"
            aria-label="City name"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              className="clear-btn"
              onClick={() => setQuery('')}
              aria-label="Clear search input"
            >
              ✕
            </button>
          )}
        </div>
        <button type="submit" disabled={loading} aria-label="Search weather">
          Search
        </button>
      </form>

      {error && <p className="status error">{error}</p>}

      {loading && (
        <div className="status loading-indicator" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      )}

      {notFoundCity && !loading && (
        <div className="status not-found">
          <span className="not-found-icon" aria-hidden="true">
            🌍
          </span>
          <p className="not-found-title">City not found</p>
          <p className="not-found-message">
            We couldn't find <strong>&ldquo;{notFoundCity}&rdquo;</strong>. It looks like this city doesn't exist or is misspelled. Please double-check and try again.
          </p>
          <div className="quick-cities fallback">
            <p className="quick-title">Or try a popular city</p>
            <div className="chips">
              {POPULAR_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  className="chip"
                  onClick={() => handleQuickSearch(city)}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!weather && !loading && !error && !notFoundCity && (
        <div className="empty-state">
          <p className="status">No city searched yet.</p>
          <div className="quick-cities">
            <p className="quick-title">Popular cities</p>
            <div className="chips">
              {POPULAR_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  className="chip"
                  onClick={() => handleQuickSearch(city)}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        </div>
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

          {/* The next 3 days: one tile per day with its icon, weekday, high and low. */}
          <h3 className="days-title">Next 3 days</h3>
          <ul className="days">
            {weather.days.map((day) => (
              <li key={day.date}>
                <span className="day-name">{dayName(day.date)}</span>
                <span className="day-icon" aria-hidden="true">
                  {describe(day.code, true).icon}
                </span>
                <span className="day-max">{Math.round(day.max)}°</span>
                <span className="day-min">{Math.round(day.min)}°</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

export default App
