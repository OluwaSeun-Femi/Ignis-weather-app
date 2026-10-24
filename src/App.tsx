import { useState } from 'react'
import './App.css'

// ---------- Types: these describe the JSON the two APIs send back ----------

// The Open-Meteo geocoding answer: a list of matching places (empty when the city is unknown).
type GeocodeResponse = {
  results?: { name: string; country: string; latitude: number; longitude: number }[]
}

// The Photon backup geocoder's answer: GeoJSON, with coordinates as [longitude, latitude].
type PhotonResponse = {
  features: { geometry: { coordinates: [number, number] }; properties: { name: string; country?: string } }[]
}

// The forecast answer: "current" is right now, "hourly" is the next 24 hours, "daily" is per day.
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
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[] }
  daily: {
    time: string[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    weather_code: number[]
    sunrise: string[]
    sunset: string[]
  }
}

// One hour of the forecast, used for the scrollable strip.
type Hour = { time: string; temp: number; code: number; isDay: boolean }

// One day of the forecast: its date plus the highest and lowest temperature expected.
type Day = { date: string; max: number; min: number; code: number }

// Everything we know about a looked-up place, kept together in one object.
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
  sunrise: string
  sunset: string
  hours: Hour[]
  days: Day[]
}

// ---------- Small helpers (pure functions, no React inside) ----------

// Open-Meteo returns the sky as a WMO code number; this turns it into words, an icon and a theme name.
function describe(code: number, isDay: boolean): { text: string; icon: string; theme: string } {
  if (code === 0) return { text: 'clear sky', icon: isDay ? '☀️' : '🌙', theme: isDay ? 'clear-day' : 'clear-night' }
  if (code <= 2) return { text: 'partly cloudy', icon: isDay ? '⛅' : '☁️', theme: isDay ? 'clear-day' : 'clear-night' }
  if (code === 3) return { text: 'overcast', icon: '☁️', theme: 'cloudy' }
  if (code <= 48) return { text: 'foggy', icon: '🌫️', theme: 'fog' }
  if (code <= 57) return { text: 'drizzle', icon: '🌦️', theme: 'rain' }
  if (code <= 67) return { text: 'rain', icon: '🌧️', theme: 'rain' }
  if (code <= 77) return { text: 'snow', icon: '🌨️', theme: 'snow' }
  if (code <= 82) return { text: 'rain showers', icon: '🌧️', theme: 'rain' }
  if (code <= 86) return { text: 'snow showers', icon: '🌨️', theme: 'snow' }
  return { text: 'thunderstorm', icon: '⛈️', theme: 'storm' }
}

// dayName turns a date like "2026-10-19" into a short weekday such as "Mon".
function dayName(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
}

// clock pulls "14:00" out of an ISO time like "2026-10-19T14:00".
function clock(iso: string): string {
  return iso.slice(11, 16)
}

// Quick-pick cities shown as chips under the search box.
const QUICK_CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'London', 'New York']

// loadRecent reads the saved recent searches; wrapped in try/catch because storage can be blocked.
function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem('recent-cities') ?? '[]')
  } catch {
    return []
  }
}

function App() {
  // query is whatever the user has typed into the search box so far.
  const [query, setQuery] = useState('')

  // weather is null until a lookup succeeds, then holds the place and its full forecast.
  const [weather, setWeather] = useState<Weather | null>(null)

  // loading is true while the requests are running so the page can show the skeleton.
  const [loading, setLoading] = useState(false)

  // error holds a short message if a request fails, so the page never goes blank.
  const [error, setError] = useState<string | null>(null)

  // notFound remembers the city name that had no match, so we can show a friendly note instead of an error.
  const [notFound, setNotFound] = useState<string | null>(null)

  // unit lets the user flip between Celsius and Fahrenheit without refetching.
  const [unit, setUnit] = useState<'C' | 'F'>('C')

  // recent is the last five cities searched, remembered between visits.
  const [recent, setRecent] = useState<string[]>(loadRecent)

  // show converts a Celsius number to the chosen unit and rounds it for display.
  function show(celsius: number): string {
    const value = unit === 'C' ? celsius : celsius * 9 / 5 + 32
    return `${Math.round(value)}°`
  }

  // remember adds a city to the front of the recent list (no duplicates, max five) and saves it.
  function remember(city: string) {
    const next = [city, ...recent.filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(0, 5)
    setRecent(next)
    try {
      localStorage.setItem('recent-cities', JSON.stringify(next))
    } catch {
      // storage blocked (private mode etc.) — the list still works for this visit
    }
  }

  // geocode turns a city name into coordinates, trying Open-Meteo first and Photon if it is slow.
  async function geocode(city: string) {
    try {
      // AbortSignal.timeout(2000) gives Open-Meteo two seconds before we try the backup.
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
        { signal: AbortSignal.timeout(2000) },
      )
      const geo: GeocodeResponse = await res.json()
      if (!geo.results || geo.results.length === 0) return null
      const { name, country, latitude, longitude } = geo.results[0]
      return { name, country, latitude, longitude }
    } catch {
      // Backup: Photon has the same job but different inputs, and lists longitude before latitude.
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=1&layer=city`,
      )
      const data: PhotonResponse = await res.json()
      if (data.features.length === 0) return null
      const f = data.features[0]
      return {
        name: f.properties.name,
        country: f.properties.country ?? '',
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
      }
    }
  }

  // fetchWeather takes coordinates and loads the current, hourly and daily forecast for them.
  async function fetchWeather(name: string, country: string, latitude: number, longitude: number) {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
        `&hourly=temperature_2m,weather_code,is_day&forecast_hours=24` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset&forecast_days=4&timezone=auto`,
    )
    const forecast: ForecastResponse = await res.json()
    const c = forecast.current
    const h = forecast.hourly
    const d = forecast.daily

    // The hourly lists are index-aligned, so we zip them into Hour objects for the next 24 hours.
    const hours: Hour[] = h.time.map((time, i) => ({
      time,
      temp: h.temperature_2m[i],
      code: h.weather_code[i],
      isDay: h.is_day[i] === 1,
    }))

    // Same for daily, skipping index 0 (today) to keep only the next 3 days.
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
      sunrise: d.sunrise[0],
      sunset: d.sunset[0],
      hours,
      days,
    })
  }

  // lookUp runs the whole chain for a typed city: geocode, then fetch the weather, with messages for each outcome.
  async function lookUp(city: string) {
    setLoading(true)
    setError(null)
    setNotFound(null)
    try {
      const place = await geocode(city)

      // No match from either geocoder: that is not an error, just a place we do not know.
      if (!place) {
        setWeather(null)
        setNotFound(city)
        return
      }
      await fetchWeather(place.name, place.country, place.latitude, place.longitude)
      remember(place.name)
      setQuery(place.name)
    } catch {
      // Any network or parsing problem lands here instead of crashing the page.
      setError('Could not load the weather. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // useMyLocation asks the browser for GPS coordinates and skips the geocoding step entirely.
  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Your browser does not share location.')
      return
    }
    setLoading(true)
    setError(null)
    setNotFound(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetchWeather('Your location', '', pos.coords.latitude, pos.coords.longitude)
          setQuery('')
        } catch {
          setError('Could not load the weather for your location.')
        } finally {
          setLoading(false)
        }
      },
      () => {
        setError('Location permission was refused.')
        setLoading(false)
      },
    )
  }

  // handleSubmit runs when the user presses Search or hits Enter, and looks up the typed city.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault() // stop the browser from reloading the page
    const city = query.trim()
    if (city) lookUp(city)
  }

  // sky is the icon, description and colour theme for the current weather (only when we have weather).
  const sky = weather ? describe(weather.code, weather.isDay) : null

  // The JSX: a full-screen scene whose colours follow the weather, with the card in the middle.
  return (
    <div className={`scene theme-${sky?.theme ?? 'default'}`}>
      <main className="app">
        <header className="top">
          <h1>Weather</h1>
          {/* The unit toggle: two buttons, the active one highlighted. */}
          <div className="unit" role="group" aria-label="Temperature unit">
            <button type="button" className={unit === 'C' ? 'on' : ''} onClick={() => setUnit('C')}>
              °C
            </button>
            <button type="button" className={unit === 'F' ? 'on' : ''} onClick={() => setUnit('F')}>
              °F
            </button>
          </div>
        </header>

        <form className="search" onSubmit={handleSubmit}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a city"
            aria-label="City"
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" disabled={loading} aria-label="Search">
            {loading ? <span className="spinner" /> : '🔍'}
          </button>
          <button type="button" className="locate" onClick={useMyLocation} disabled={loading} aria-label="Use my location" title="Use my location">
            📍
          </button>
        </form>

        {/* Quick-pick chips: recent searches first (if any), then a few popular cities. */}
        <div className="chips" aria-label="Quick picks">
          {(recent.length ? recent : QUICK_CITIES).map((city) => (
            <button type="button" key={city} onClick={() => lookUp(city)} disabled={loading}>
              {city}
            </button>
          ))}
        </div>

        {error && <p className="status error">{error}</p>}

        {/* The loading skeleton: grey blocks in the shape of the result, pulsing until data arrives. */}
        {loading && (
          <div className="skeleton" aria-label="Loading">
            <div className="sk sk-title" />
            <div className="sk sk-icon" />
            <div className="sk sk-temp" />
            <div className="sk sk-row" />
          </div>
        )}

        {/* The friendly "city not found" note: calm colours, the name they typed, and a tip. */}
        {notFound && !loading && (
          <div className="not-found">
            <span className="not-found-icon" aria-hidden="true">
              🔍
            </span>
            <p>
              We couldn't find <strong>"{notFound}"</strong>.
            </p>
            <p className="hint">Check the spelling or try a bigger city nearby, like Lagos or Abuja.</p>
          </div>
        )}

        {!weather && !loading && !error && !notFound && (
          <div className="empty">
            <span aria-hidden="true">🌍</span>
            <p>Type a city or tap one above to see the weather right now and for the next 3 days.</p>
          </div>
        )}

        {weather && sky && !loading && (
          <section className="current" key={weather.city + weather.time}>
            <h2>
              {weather.city}
              {weather.country && <span className="country">, {weather.country}</span>}
            </h2>
            {/* The API's time is already in the city's own time zone (timezone=auto). */}
            <p className="time">Local time {clock(weather.time)}</p>
            <div className="icon" aria-hidden="true">
              {sky.icon}
            </div>
            <p className="temp">{show(weather.temperature)}</p>
            <p className="desc">{sky.text}</p>

            <dl className="details">
              <div>
                <dt>Feels like</dt>
                <dd>{show(weather.feelsLike)}</dd>
              </div>
              <div>
                <dt>Humidity</dt>
                <dd>{weather.humidity}%</dd>
              </div>
              <div>
                <dt>Wind</dt>
                <dd>{Math.round(weather.wind)} km/h</dd>
              </div>
              <div>
                <dt>Sunrise</dt>
                <dd>{clock(weather.sunrise)}</dd>
              </div>
              <div>
                <dt>Sunset</dt>
                <dd>{clock(weather.sunset)}</dd>
              </div>
            </dl>

            {/* The next 24 hours: a strip you can swipe sideways on a phone. */}
            <h3 className="section-title">Next 24 hours</h3>
            <ul className="hours">
              {weather.hours.map((hour, i) => (
                <li key={hour.time} className={i === 0 ? 'now' : ''}>
                  <span className="hour-time">{i === 0 ? 'Now' : clock(hour.time)}</span>
                  <span className="hour-icon" aria-hidden="true">
                    {describe(hour.code, hour.isDay).icon}
                  </span>
                  <span className="hour-temp">{show(hour.temp)}</span>
                </li>
              ))}
            </ul>

            {/* The next 3 days: one tile per day with its icon, weekday, high and low. */}
            <h3 className="section-title">Next 3 days</h3>
            <ul className="days">
              {weather.days.map((day) => (
                <li key={day.date}>
                  <span className="day-name">{dayName(day.date)}</span>
                  <span className="day-icon" aria-hidden="true">
                    {describe(day.code, true).icon}
                  </span>
                  <span className="day-desc">{describe(day.code, true).text}</span>
                  <span className="day-range">
                    <span className="day-max">{show(day.max)}</span>
                    <span className="day-min">{show(day.min)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
