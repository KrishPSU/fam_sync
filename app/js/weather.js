async function getNWSWeather(lat, lon) {
  try {
    // Step 1: Get forecast URL for lat/lon
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    const pointData = await pointRes.json();
    const forecastUrl = pointData.properties.forecast;

    // Step 2: Fetch forecast
    const forecastRes = await fetch(forecastUrl);
    const forecastData = await forecastRes.json();

    // Step 3: Extract today's forecast
    const today = forecastData.properties.periods[0];
    const output = `🌦️ High of ${today.temperature}°${today.temperatureUnit}. ${today.detailedForecast}`;
    
    // document.getElementById('weatherBox').textContent = simplifyForecast(output);
    document.getElementById('weatherBox').textContent = output;
  } catch (err) {
    document.getElementById('weatherBox').textContent = "Unable to load weather.";
    console.error(err);
  }
}



function simplifyForecast(rawText) {
  const patterns = [
    /High of \d+°F/i,
    /Rain[^.]*\./i,
    /Cloudy[^.]*\./i,
    /Partly cloudy[^.]*\./i,
    /Sunny[^.]*\./i,
    /Thunderstorms[^.]*\./i
  ];

  const highlights = [];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match && !highlights.includes(match[0])) {
      highlights.push(match[0].trim());
    }
  }

  return `🌦️ ${highlights.join(' ')}`;
}




function getUserWeather() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      getNWSWeather(lat, lon); // call your weather-fetching function
    },
    (err) => {
      alert("Location access denied or unavailable.");
      console.error(err);
    }
  );
}


getUserWeather();



// Example: New York City
// getNWSWeather(40.7128, -74.0060);